import Foundation
import KeeplineKit
import StashCore

public struct StashIntegrationNotice: Equatable, Sendable {
    public let taskID: UUID
    public let message: String

    public init(taskID: UUID, message: String) {
        self.taskID = taskID
        self.message = message
    }
}

private struct TaskProjection: Equatable {
    let title: String
    let body: String?
    let projectRoot: String?
    let status: String
}

@MainActor
public final class StashKeeplineCoordinator {
    public let store: LedgerStore
    public let transport: any KeeplineTransport
    private var projectedTasks: [UUID: TaskProjection] = [:]

    public init(store: LedgerStore, transport: any KeeplineTransport) {
        self.store = store
        self.transport = transport
    }

    public func launch(
        runtimeID: KeeplineRuntimeID,
        directory: URL,
        task: LedgerTask
    ) async throws {
        guard store.agentLink(for: task.id)?.isTerminal != false else {
            throw StashKeeplineCoordinatorError.activeLinkConflict
        }
        var isDirectory: ObjCBool = false
        guard directory.isFileURL,
              directory.path.hasPrefix("/"),
              FileManager.default.fileExists(atPath: directory.path, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            throw StashKeeplineCoordinatorError.invalidProjectDirectory
        }

        let link = AgentTaskLink(
            taskID: task.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(task.id.uuidString):\(UUID().uuidString)",
            projectRoot: directory.path,
            runtimeID: runtimeID.rawValue,
            source: .dispatched
        )
        guard store.persistAgentLink(link) else {
            throw StashKeeplineCoordinatorError.activeLinkConflict
        }
        try await resumeDispatchAttempt(link: link, task: task)
    }

    public func manualLink(_ session: KeeplineSession, to task: LedgerTask) async throws {
        let latestLink = store.agentLink(for: task.id)
        if let latestLink, latestLink.dispatchState == .ambiguous {
            try await resolveAmbiguous(link: latestLink, with: session, task: task)
            return
        }
        let existing = latestLink?.isTerminal == false ? latestLink : nil
        let workItem: KeeplineWorkItem
        if let existing {
            guard let existingWorkItemID = existing.keeplineWorkItemID else {
                throw StashKeeplineCoordinatorError.missingWorkItemIdentity
            }
            workItem = try await WorkspacePersistenceGate.perform(.manualLinkUpsert, store: store) {
                try await transport.upsertExternalWorkItem(
                    source: "stash",
                    externalID: task.id.uuidString,
                    input: Self.workItemInput(task: task, projectRoot: session.directory)
                )
            }
            guard workItem.id == existingWorkItemID else {
                throw StashKeeplineCoordinatorError.workItemIdentityChanged
            }
        } else {
            workItem = try await WorkspacePersistenceGate.perform(.manualLinkUpsert, store: store) {
                try await transport.upsertExternalWorkItem(
                    source: "stash",
                    externalID: task.id.uuidString,
                    input: Self.workItemInput(task: task, projectRoot: session.directory)
                )
            }
        }

        _ = try await WorkspacePersistenceGate.perform(.manualSessionLink, store: store) {
            try await transport.linkSession(workItemID: workItem.id, sessionID: session.sessionID)
        }
        if var existing {
            existing.sessionID = session.sessionID
            existing.runtimeID = session.runtimeID.rawValue
            existing.projectRoot = session.directory
            guard store.persistAgentLink(existing) else {
                throw StashKeeplineCoordinatorError.activeLinkConflict
            }
        } else {
            let link = AgentTaskLink(
                taskID: task.id,
                keeplineWorkItemID: workItem.id,
                sessionID: session.sessionID,
                projectRoot: session.directory,
                runtimeID: session.runtimeID.rawValue,
                source: .manuallyLinked
            )
            guard store.persistAgentLink(link) else {
                throw StashKeeplineCoordinatorError.activeLinkConflict
            }
        }
        try await WorkspacePersistenceGate.require(store)
    }

    public func resolveAmbiguous(
        link: AgentTaskLink,
        with session: KeeplineSession,
        task: LedgerTask
    ) async throws {
        guard link.taskID == task.id,
              link.dispatchState == .ambiguous,
              let dispatchID = link.dispatchID,
              link.candidateSessionIDs?.contains(session.sessionID) == true else {
            throw StashKeeplineCoordinatorError.invalidDispatchCandidate
        }
        let dispatch = try await WorkspacePersistenceGate.perform(.ambiguousResolution, store: store) {
            try await transport.resolveDispatchSession(id: dispatchID, sessionID: session.sessionID)
        }
        let updated = Self.applying(dispatch, to: link)
        guard store.persistAgentLink(updated) else {
            throw StashKeeplineCoordinatorError.activeLinkConflict
        }
        try await WorkspacePersistenceGate.require(store)
    }

    public func reviewCompletion(
        link: AgentTaskLink,
        session: KeeplineSession,
        task: LedgerTask,
        accepted: Bool
    ) async throws {
        guard let workItemID = link.keeplineWorkItemID else {
            throw StashKeeplineCoordinatorError.missingWorkItemIdentity
        }
        guard let evidenceID = session.completionEvidenceID else {
            throw StashKeeplineCoordinatorError.missingCompletionEvidence
        }
        let decision: CompletionReviewDecision = accepted ? .accepted : .rejected
        _ = try await WorkspacePersistenceGate.perform(.completionReview, store: store) {
            try await transport.reviewCompletion(
                workItemID: workItemID,
                request: CompletionReviewRequest(evidenceID: evidenceID, decision: decision)
            )
        }
        let localDecision: AgentCompletionDecision = accepted ? .accepted : .rejected
        guard store.recordAgentCompletionDecision(linkID: link.id, decision: localDecision) else {
            throw StashKeeplineCoordinatorError.linkNotFound
        }
        if accepted, store.task(id: task.id)?.status != .completed {
            store.toggleCompletion(id: task.id)
        }
        try await WorkspacePersistenceGate.require(store)
    }

    public func resumePendingAttempts() async throws -> [StashIntegrationNotice] {
        let pending = store.workspace.agentTaskLinks.filter {
            !$0.isTerminal && $0.source == .dispatched && $0.sessionID == nil
        }
        var notices: [StashIntegrationNotice] = []
        for link in pending {
            if link.dispatchState == .ambiguous { continue }
            if link.dispatchID == nil {
                guard let task = store.task(id: link.taskID) else { continue }
                try await resumeDispatchAttempt(link: link, task: task)
                continue
            }
            guard let dispatchID = link.dispatchID else { continue }
            let dispatch = try await transport.dispatch(id: dispatchID)
            let updated = Self.applying(dispatch, to: link)
            if updated != link {
                guard store.persistAgentLink(updated) else {
                    throw StashKeeplineCoordinatorError.activeLinkConflict
                }
                try await WorkspacePersistenceGate.require(store)
            }
            if updated.dispatchState == .ambiguous {
                notices.append(StashIntegrationNotice(
                    taskID: link.taskID,
                    message: "More than one Agent session matched. Choose the correct session."
                ))
            } else if updated.dispatchState == .failed || updated.dispatchState == .cancelled {
                notices.append(StashIntegrationNotice(
                    taskID: link.taskID,
                    message: dispatch.error ?? "Keepline could not launch this Agent."
                ))
            }
        }
        return notices
    }

    public func syncTaskProjections() async throws {
        let taskIDs = Set(store.workspace.agentTaskLinks.map(\.taskID))
        var pending: [(UUID, String, ExternalWorkItemInput, TaskProjection)] = []
        for taskID in taskIDs {
            guard let task = store.task(id: taskID),
                  let link = store.agentLink(for: taskID),
                  let workItemID = link.keeplineWorkItemID else {
                continue
            }
            let input = Self.workItemInput(task: task, projectRoot: link.projectRoot)
            let projection = TaskProjection(
                title: input.title,
                body: input.body,
                projectRoot: input.projectRoot,
                status: input.status
            )
            guard projectedTasks[taskID] != projection else { continue }
            pending.append((taskID, workItemID, input, projection))
        }
        guard !pending.isEmpty else { return }
        try await WorkspacePersistenceGate.perform(.projectionSync, store: store) {
            for (taskID, workItemID, input, projection) in pending {
                let workItem = try await transport.upsertExternalWorkItem(
                    source: "stash",
                    externalID: taskID.uuidString,
                    input: input
                )
                guard workItem.id == workItemID else {
                    throw StashKeeplineCoordinatorError.workItemIdentityChanged
                }
                projectedTasks[taskID] = projection
            }
        }
    }

    private func resumeDispatchAttempt(link: AgentTaskLink, task: LedgerTask) async throws {
        guard let key = link.idempotencyKey, let projectRoot = link.projectRoot else {
            throw StashKeeplineCoordinatorError.incompleteDispatchAttempt
        }
        var pending = link
        if pending.keeplineWorkItemID == nil {
            let workItem = try await WorkspacePersistenceGate.perform(.launchWorkItemUpsert, store: store) {
                try await transport.upsertExternalWorkItem(
                    source: "stash",
                    externalID: task.id.uuidString,
                    input: Self.workItemInput(task: task, projectRoot: projectRoot)
                )
            }
            pending.keeplineWorkItemID = workItem.id
            guard store.persistAgentLink(pending) else {
                throw StashKeeplineCoordinatorError.activeLinkConflict
            }
            try await WorkspacePersistenceGate.require(store)
        }
        guard let workItemID = pending.keeplineWorkItemID else {
            throw StashKeeplineCoordinatorError.missingWorkItemIdentity
        }
        let prompt = [task.title, task.notes.nonEmpty].compactMap { $0 }.joined(separator: "\n\n")
        let dispatch = try await WorkspacePersistenceGate.perform(.launchDispatch, store: store) {
            try await transport.dispatch(
                workItemID: workItemID,
                request: DispatchRequest(
                    runtimeID: KeeplineRuntimeID(rawValue: pending.runtimeID),
                    cwd: projectRoot,
                    prompt: prompt,
                    idempotencyKey: key
                )
            )
        }
        let updated = Self.applying(dispatch, to: pending)
        guard store.persistAgentLink(updated) else {
            throw StashKeeplineCoordinatorError.activeLinkConflict
        }
        try await WorkspacePersistenceGate.require(store)
    }

    private static func workItemInput(task: LedgerTask, projectRoot: String?) -> ExternalWorkItemInput {
        ExternalWorkItemInput(
            title: task.title,
            body: task.notes.nonEmpty,
            projectRoot: projectRoot,
            status: workItemStatus(for: task.status)
        )
    }

    private static func workItemStatus(for status: TaskStatus) -> String {
        switch status {
        case .inbox: "inbox"
        case .planned: "planned"
        case .active: "active"
        case .completed: "done"
        case .deferred: "blocked"
        case .cancelled: "archived"
        }
    }

    private static func applying(_ dispatch: KeeplineDispatch, to link: AgentTaskLink) -> AgentTaskLink {
        var updated = link
        updated.keeplineWorkItemID = dispatch.workItemID
        updated.dispatchID = dispatch.id
        updated.dispatchState = AgentDispatchState(rawValue: dispatch.state)
        updated.candidateSessionIDs = dispatch.candidateSessionIDs
        updated.sessionID = dispatch.linkedSessionID ?? updated.sessionID
        return updated
    }
}

public enum StashKeeplineCoordinatorError: LocalizedError, Equatable, Sendable {
    case activeLinkConflict
    case invalidProjectDirectory
    case linkNotFound
    case missingCompletionEvidence
    case missingWorkItemIdentity
    case incompleteDispatchAttempt
    case invalidDispatchCandidate
    case workItemIdentityChanged

    public var errorDescription: String? {
        switch self {
        case .activeLinkConflict: "This task already has an active Agent link."
        case .invalidProjectDirectory: "Choose an existing project folder before launching an Agent."
        case .linkNotFound: "The task's Agent link could not be found."
        case .missingCompletionEvidence: "Keepline has not produced explicit completion evidence yet."
        case .missingWorkItemIdentity: "Keepline work item identity is missing."
        case .incompleteDispatchAttempt: "The saved Agent launch attempt is incomplete."
        case .invalidDispatchCandidate: "Choose one of Keepline's matched Agent sessions."
        case .workItemIdentityChanged: "Keepline returned a different work item for this task."
        }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
