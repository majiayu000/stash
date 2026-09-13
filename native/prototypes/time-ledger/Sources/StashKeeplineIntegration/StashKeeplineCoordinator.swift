import Foundation
import KeeplineKit
import StashCore

public struct StashIntegrationNotice: Equatable, Sendable {
    public let taskID: UUID
    /// Originating `AgentTaskLink.id` so callers can revalidate before publish.
    /// A concurrent `manualLink` may attach a session after the notice was buffered.
    public let linkID: UUID
    public let message: String
    /// Dispatch state observed when the notice was buffered. Overlapping refreshes
    /// can persist a newer terminal poll for the same link; revalidation drops the
    /// notice when that stamp no longer matches.
    public let observedDispatchState: AgentDispatchState?

    public init(
        taskID: UUID,
        linkID: UUID,
        message: String,
        observedDispatchState: AgentDispatchState? = nil
    ) {
        self.taskID = taskID
        self.linkID = linkID
        self.message = message
        self.observedDispatchState = observedDispatchState
    }
}

public struct StashPendingResumeResult: Equatable, Sendable {
    public var notices: [StashIntegrationNotice]
    /// Task IDs whose pending dispatch was processed without a failure notice.
    /// Callers should clear only prior *resume* notices for these IDs — not
    /// unrelated `taskErrors` entries such as a failed `manualLink`.
    public var recoveredTaskIDs: [UUID]

    public init(
        notices: [StashIntegrationNotice] = [],
        recoveredTaskIDs: [UUID] = []
    ) {
        self.notices = notices
        self.recoveredTaskIDs = recoveredTaskIDs
    }

    public var isEmpty: Bool {
        notices.isEmpty && recoveredTaskIDs.isEmpty
    }

    /// Drops buffered notices whose originating link is gone, already session-linked,
    /// superseded by a newer current link for the same task, or whose observed
    /// dispatch state no longer matches (a newer overlapping poll mutated the link).
    /// Terminal failed/cancelled origins still publish only while they remain current
    /// and the buffered stamp still matches that terminal state.
    /// Missing, session-linked, or superseded origins are treated as recovered so
    /// prior resume errors clear (a removed/imported link never re-enters resume,
    /// and a newer manual link is excluded from future resume batches).
    /// State-stamp mismatches only suppress the stale notice — they do not recover,
    /// so a newer terminal publish for the same link is left intact.
    public func revalidated(against links: [AgentTaskLink]) -> StashPendingResumeResult {
        // Imported backups may contain duplicate link IDs. Prefer the newer
        // `linkedAt` without trapping via `Dictionary(uniqueKeysWithValues:)`.
        let byID = Dictionary(links.map { ($0.id, $0) }, uniquingKeysWith: { lhs, rhs in
            lhs.linkedAt >= rhs.linkedAt ? lhs : rhs
        })
        var filtered: [StashIntegrationNotice] = []
        var recovered = recoveredTaskIDs
        for notice in notices {
            guard let link = byID[notice.linkID], link.taskID == notice.taskID else {
                // Import/replace removed the originating link; clear sticky resume
                // errors because that link will never enter another pending batch.
                if !recovered.contains(notice.taskID) {
                    recovered.append(notice.taskID)
                }
                continue
            }
            // Mirror LedgerStore.agentLink(for:): a newer non-terminal (or newer
            // overall) link means this notice no longer represents the task.
            if let current = Self.currentLink(for: notice.taskID, in: links),
               current.id != notice.linkID {
                if !recovered.contains(notice.taskID) {
                    recovered.append(notice.taskID)
                }
                continue
            }
            if link.sessionID != nil {
                if !recovered.contains(notice.taskID) {
                    recovered.append(notice.taskID)
                }
                continue
            }
            // A newer overlapping refresh may have persisted failed/cancelled (or
            // otherwise advanced dispatch state) after this notice was buffered.
            // Publishing the older transient lookup failure would overwrite that
            // actionable terminal message permanently.
            if link.dispatchState != notice.observedDispatchState {
                continue
            }
            filtered.append(notice)
        }
        return StashPendingResumeResult(
            notices: filtered,
            recoveredTaskIDs: recovered
        )
    }

    /// Drops buffered notices whose task resume-error generation advanced past the
    /// snapshot taken before this refresh awaited. A newer overlapping recovery
    /// stamps the generation so an unchanged `awaiting_session` link cannot publish
    /// a stale failure after a successful poll already cleared the path.
    /// Durable outcomes (failed/cancelled/ambiguous) still publish after a sibling
    /// *recovery* stamp — those links leave future resume batches — but are rejected
    /// when a *foreground* `publishTaskError` advanced generation past the snapshot;
    /// that actionable retry failure must not be overwritten by an older notice.
    public func rejectingNoticesSupersededByGeneration(
        observed: [UUID: UInt64],
        current: [UUID: UInt64],
        foreground: [UUID: UInt64] = [:]
    ) -> StashPendingResumeResult {
        let filtered = notices.filter { notice in
            let observedGeneration = observed[notice.taskID] ?? 0
            let currentGeneration = current[notice.taskID] ?? 0
            if currentGeneration == observedGeneration {
                return true
            }
            if notice.observedDispatchState?.isDurableResumeOutcome == true {
                let foregroundGeneration = foreground[notice.taskID] ?? 0
                // Sibling recovery may advance `current` without a foreground stamp.
                // A foreground error after this snapshot owns a generation > observed.
                return foregroundGeneration <= observedGeneration
            }
            return false
        }
        return StashPendingResumeResult(
            notices: filtered,
            recoveredTaskIDs: recoveredTaskIDs
        )
    }

    /// Same selection rules as `LedgerStore.agentLink(for:)`.
    private static func currentLink(for taskID: UUID, in links: [AgentTaskLink]) -> AgentTaskLink? {
        let forTask = links.filter { $0.taskID == taskID }
        return forTask
            .sorted { $0.linkedAt > $1.linkedAt }
            .first { !$0.isTerminal }
            ?? forTask.max { $0.linkedAt < $1.linkedAt }
    }
}

/// Cancellation mid-batch that still carries outcomes already persisted or
/// classified for earlier pending links. Callers must publish `partial` before
/// treating the resume as cancelled.
public struct StashPendingResumeCancellation: Error, Equatable, Sendable {
    public let partial: StashPendingResumeResult

    public init(partial: StashPendingResumeResult) {
        self.partial = partial
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
    /// Links owned by an in-flight `manualLink` recovery (known or missing
    /// work-item identity). Resume must not upsert/dispatch the same UUID while
    /// that remote work awaits.
    private var reservedManualRecoveryLinkIDs: Set<UUID> = []

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
        if let existing, let existingWorkItemID = existing.keeplineWorkItemID {
            // Reserve across upsert + session-link so resume cannot launch first
            // while this known-identity recovery awaits remote work.
            reservedManualRecoveryLinkIDs.insert(existing.id)
            defer { reservedManualRecoveryLinkIDs.remove(existing.id) }
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
            // Reload before linkSession: import may preserve the launch attempt
            // while swapping keeplineWorkItemID. Mirror missing-identity and
            // reject before the remote mutation applies the upsert identity.
            var current = try Self.requireReservedManualRecoveryLink(
                store.workspace.agentTaskLinks.first(where: { $0.id == existing.id }),
                matching: existing,
                requestedSessionID: session.sessionID
            )
            try Self.requireCompatibleWorkItemIdentity(current, with: workItem.id)
            _ = try await WorkspacePersistenceGate.perform(.manualSessionLink, store: store) {
                try await transport.linkSession(workItemID: workItem.id, sessionID: session.sessionID)
            }
            // Reload before persist: import may have removed/replaced the link
            // while upsert or session-link awaited.
            current = try Self.requireReservedManualRecoveryLink(
                store.workspace.agentTaskLinks.first(where: { $0.id == existing.id }),
                matching: existing,
                requestedSessionID: session.sessionID
            )
            try Self.requireCompatibleWorkItemIdentity(current, with: workItem.id)
            current.keeplineWorkItemID = workItem.id
            current.sessionID = session.sessionID
            current.runtimeID = session.runtimeID.rawValue
            current.projectRoot = session.directory
            guard store.persistAgentLink(current) else {
                throw StashKeeplineCoordinatorError.activeLinkConflict
            }
        } else if let reserved = existing {
            // Interrupted launches may leave a pending link without a work-item ID
            // when the runtime capability was absent. Establish identity here so
            // manual session recovery is not blocked until that capability returns.
            // Reserve across upsert + session-link so resume cannot launch first,
            // and revalidate the reserved attempt after each await — import can
            // remove the link or swap same-ID attempt fields while we suspend.
            reservedManualRecoveryLinkIDs.insert(reserved.id)
            defer { reservedManualRecoveryLinkIDs.remove(reserved.id) }
            workItem = try await WorkspacePersistenceGate.perform(.manualLinkUpsert, store: store) {
                try await transport.upsertExternalWorkItem(
                    source: "stash",
                    externalID: task.id.uuidString,
                    input: Self.workItemInput(task: task, projectRoot: session.directory)
                )
            }
            var current = try Self.requireReservedManualRecoveryLink(
                store.workspace.agentTaskLinks.first(where: { $0.id == reserved.id }),
                matching: reserved,
                requestedSessionID: session.sessionID
            )
            // Import may keep the same launch attempt while filling in a newer
            // work-item ID. Do not linkSession / overwrite that identity.
            try Self.requireCompatibleWorkItemIdentity(current, with: workItem.id)
            _ = try await WorkspacePersistenceGate.perform(.manualSessionLink, store: store) {
                try await transport.linkSession(workItemID: workItem.id, sessionID: session.sessionID)
            }
            current = try Self.requireReservedManualRecoveryLink(
                store.workspace.agentTaskLinks.first(where: { $0.id == reserved.id }),
                matching: reserved,
                requestedSessionID: session.sessionID
            )
            try Self.requireCompatibleWorkItemIdentity(current, with: workItem.id)
            current.keeplineWorkItemID = workItem.id
            current.sessionID = session.sessionID
            current.runtimeID = session.runtimeID.rawValue
            current.projectRoot = session.directory
            guard store.persistAgentLink(current) else {
                throw StashKeeplineCoordinatorError.activeLinkConflict
            }
        } else {
            workItem = try await WorkspacePersistenceGate.perform(.manualLinkUpsert, store: store) {
                try await transport.upsertExternalWorkItem(
                    source: "stash",
                    externalID: task.id.uuidString,
                    input: Self.workItemInput(task: task, projectRoot: session.directory)
                )
            }
            _ = try await WorkspacePersistenceGate.perform(.manualSessionLink, store: store) {
                try await transport.linkSession(workItemID: workItem.id, sessionID: session.sessionID)
            }
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

    /// Ensures a reserved manual recovery still owns the same launch attempt
    /// after an await. Import may drop the UUID or preserve it while swapping
    /// task/attempt fields; either case must not re-add or overwrite.
    /// A concurrent resume poll may also promote the link to `.ambiguous`
    /// while upsert/session-link suspends — reject that so recovery goes through
    /// `resolveAmbiguous` instead of persisting a session onto unresolved
    /// dispatch-specific ambiguity (`.ambiguous` is not terminal).
    /// When an existing-dispatch poll attaches the requested session during the
    /// same awaits, treat that completed recovery as success instead of
    /// `linkNotFound` (which would stick as a foreground error after the link
    /// leaves later resume batches).
    private static func requireReservedManualRecoveryLink(
        _ current: AgentTaskLink?,
        matching original: AgentTaskLink,
        requestedSessionID: String
    ) throws -> AgentTaskLink {
        guard let current,
              matchesLaunchAttempt(current, original: original),
              !current.isTerminal else {
            throw StashKeeplineCoordinatorError.linkNotFound
        }
        if current.sessionID == requestedSessionID {
            return current
        }
        guard current.sessionID == nil else {
            throw StashKeeplineCoordinatorError.linkNotFound
        }
        guard current.dispatchState != .ambiguous else {
            throw StashKeeplineCoordinatorError.invalidDispatchCandidate
        }
        return current
    }

    /// Manual recovery may race an import that preserves the launch attempt
    /// fields `matchesLaunchAttempt` checks while supplying a newer
    /// `keeplineWorkItemID`. Reject before linkSession / persist so the upsert
    /// result cannot overwrite that imported identity (known- and missing-
    /// identity paths both revalidate here).
    private static func requireCompatibleWorkItemIdentity(
        _ current: AgentTaskLink,
        with workItemID: String
    ) throws {
        guard current.keeplineWorkItemID == nil
                || current.keeplineWorkItemID == workItemID else {
            throw StashKeeplineCoordinatorError.workItemIdentityChanged
        }
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
        guard link.taskID == task.id,
              link.sessionID == session.sessionID,
              link.keeplineWorkItemID == session.completionEvidenceWorkItemID else {
            throw StashKeeplineCoordinatorError.invalidCompletionContext
        }
        guard let workItemID = link.keeplineWorkItemID else {
            throw StashKeeplineCoordinatorError.missingWorkItemIdentity
        }
        guard let evidenceID = session.completionEvidenceID else {
            throw StashKeeplineCoordinatorError.missingCompletionEvidence
        }
        let decision: CompletionReviewDecision = accepted ? .accepted : .rejected
        let result = try await WorkspacePersistenceGate.perform(.completionReview, store: store) {
            try await transport.reviewCompletion(
                workItemID: workItemID,
                request: CompletionReviewRequest(evidenceID: evidenceID, decision: decision)
            )
        }
        guard result.review.workItemID == workItemID,
              result.review.evidenceID == evidenceID,
              result.review.decision == decision,
              result.item.id == workItemID else {
            throw StashKeeplineCoordinatorError.invalidCompletionResponse
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

    public func resumePendingAttempts(
        capabilities: Set<String>? = nil
    ) async throws -> StashPendingResumeResult {
        let pending = store.workspace.agentTaskLinks.filter {
            !$0.isTerminal && $0.source == .dispatched && $0.sessionID == nil
        }
        var notices: [StashIntegrationNotice] = []
        var recoveredTaskIDs: [UUID] = []
        for link in pending {
            do {
                try Task.checkCancellation()
            } catch {
                throw Self.cancellationError(
                    notices: notices,
                    recoveredTaskIDs: recoveredTaskIDs,
                    links: store.workspace.agentTaskLinks
                )
            }
            if link.dispatchState == .ambiguous { continue }
            // A concurrent manualLink recovery owns this link until it attaches a
            // session; launching here would create a duplicate Agent.
            if reservedManualRecoveryLinkIDs.contains(link.id) { continue }
            // Tracks an in-memory poll/retry apply performed in this iteration so
            // a later persistence failure is not mistaken for a concurrent manual link.
            var appliedPollSnapshot: AgentTaskLink?
            do {
                if link.dispatchID == nil {
                    guard let task = store.task(id: link.taskID) else { continue }
                    // Capability gating lives inside resumeDispatchAttempt after any
                    // missing work-item upsert so manual recovery can establish
                    // identity even when this runtime is not currently launchable.
                    // Status polling for existing dispatch IDs continues without it.
                    // `nil` capabilities keep the test default of allowing every retry.
                    let dispatch = try await resumeDispatchAttempt(
                        link: link,
                        task: task,
                        capabilities: capabilities
                    )
                    if let current = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }),
                       current.sessionID != nil {
                        recoveredTaskIDs.append(link.taskID)
                        continue
                    }
                    guard let dispatch else { continue }
                    // Idempotent retries can return terminal failed/cancelled without
                    // throwing — classify like the existing-dispatch poll path.
                    appendResumeOutcome(
                        for: link,
                        dispatch: dispatch,
                        notices: &notices,
                        recoveredTaskIDs: &recoveredTaskIDs
                    )
                    continue
                }
                guard let dispatchID = link.dispatchID else { continue }
                let dispatch = try await transport.dispatch(id: dispatchID)
                // Reload after the await: manualLink may have attached a session
                // while this poll was in flight. Never persist a stale snapshot.
                guard let current = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }),
                      !current.isTerminal,
                      current.source == .dispatched,
                      current.dispatchID == dispatchID else {
                    continue
                }
                if current.sessionID != nil {
                    recoveredTaskIDs.append(link.taskID)
                    continue
                }
                // Sibling refresh may have already promoted this link to .ambiguous
                // with candidates while this poll was in flight. Do not let an older
                // nonterminal response erase that transition (same skip as the
                // pre-await snapshot filter above).
                if current.dispatchState == .ambiguous {
                    continue
                }
                let updated = Self.applying(dispatch, to: current)
                if updated != current {
                    appliedPollSnapshot = current
                    try await persistLinkRequiringSave(updated, restoringOnFailure: current)
                }
                appendResumeOutcome(
                    for: link,
                    dispatch: dispatch,
                    notices: &notices,
                    recoveredTaskIDs: &recoveredTaskIDs
                )
            } catch is CancellationError {
                throw Self.cancellationError(
                    notices: notices,
                    recoveredTaskIDs: recoveredTaskIDs,
                    links: store.workspace.agentTaskLinks
                )
            } catch let cancelled as StashPendingResumeCancellation {
                throw cancelled
            } catch {
                // Reload after a failed await: manualLink may have attached a
                // session while the lookup/retry was in flight. Publishing a
                // stale notice for an already-linked task would stick forever
                // because recovered-task clearing only runs for pending resumes.
                // Do not treat our own unsaved poll apply as recovery — that
                // path restores `appliedPollSnapshot` before rethrowing.
                if appliedPollSnapshot == nil,
                   let current = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }),
                   current.sessionID != nil {
                    recoveredTaskIDs.append(link.taskID)
                    continue
                }
                guard let current = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }),
                      !current.isTerminal,
                      current.source == .dispatched,
                      current.sessionID == nil else {
                    continue
                }
                notices.append(StashIntegrationNotice(
                    taskID: current.taskID,
                    linkID: current.id,
                    message: error.localizedDescription,
                    observedDispatchState: current.dispatchState
                ))
            }
        }
        // Cancellation-unaware transports may return normally after shutdown /
        // setSceneActive(false) cancelled the task during the final poll or save.
        // Recheck here so refresh does not continue into syncTaskProjections while
        // still preserving any partial outcomes already classified.
        do {
            try Task.checkCancellation()
        } catch {
            throw Self.cancellationError(
                notices: notices,
                recoveredTaskIDs: recoveredTaskIDs,
                links: store.workspace.agentTaskLinks
            )
        }
        // Revalidate after the full batch: an earlier catch may have buffered a
        // notice, then manualLink attached a session while a later poll awaited.
        return StashPendingResumeResult(notices: notices, recoveredTaskIDs: recoveredTaskIDs)
            .revalidated(against: store.workspace.agentTaskLinks)
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

    /// Returns the remote dispatch when it was applied to the pending link.
    /// Returns `nil` when the link disappeared, became terminal, already has
    /// a session (caller should treat a session as recovered), or the runtime
    /// capability gate blocks launch after work-item identity was ensured.
    private func resumeDispatchAttempt(
        link: AgentTaskLink,
        task: LedgerTask,
        capabilities: Set<String>? = nil
    ) async throws -> KeeplineDispatch? {
        guard let key = link.idempotencyKey, let projectRoot = link.projectRoot else {
            throw StashKeeplineCoordinatorError.incompleteDispatchAttempt
        }
        if reservedManualRecoveryLinkIDs.contains(link.id) {
            return nil
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
            // Reload before persisting the work-item id: manualLink may have attached
            // a session, or an import may have replaced the workspace, during the
            // upsert await. Writing the stale pending snapshot would re-add a
            // discarded link and still allow launchDispatch below.
            guard let current = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }) else {
                return nil
            }
            // Same-ID import replacements can keep the UUID while swapping task /
            // attempt fields. Reject before persisting identity onto the replacement.
            guard Self.matchesLaunchAttempt(current, original: link),
                  current.sessionID == nil,
                  !current.isTerminal else {
                return nil
            }
            if reservedManualRecoveryLinkIDs.contains(link.id) {
                return nil
            }
            pending = current
            // Import may preserve launch-attempt fields while supplying a newer
            // keeplineWorkItemID. Mirror manualLink and reject before overwrite.
            do {
                try Self.requireCompatibleWorkItemIdentity(pending, with: workItem.id)
            } catch {
                return nil
            }
            // Roll back to the reloaded pre-mutation snapshot, not the original
            // call-site `link`. A sibling refresh may have already persisted a
            // work-item ID into `pending` during the upsert await; restoring the
            // stale original would erase that progress on flush failure.
            let previous = pending
            pending.keeplineWorkItemID = workItem.id
            try await persistLinkRequiringSave(pending, restoringOnFailure: previous)
            guard let reloaded = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }) else {
                return nil
            }
            pending = reloaded
        }
        // Cooperative cancellation can arrive while the upsert/persist awaits
        // above return normally. Recheck before the launch-dispatch mutation.
        try Task.checkCancellation()
        // Invalidate no-dispatch retries when manualLink won while upsert/persist
        // awaited — otherwise launchDispatch still fires and leaves a duplicate Agent.
        // Also reject same-ID import replacements that changed attempt identity.
        guard let latest = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }),
              Self.matchesLaunchAttempt(latest, original: link),
              latest.sessionID == nil,
              !latest.isTerminal else {
            return nil
        }
        if reservedManualRecoveryLinkIDs.contains(link.id) {
            return nil
        }
        pending = latest
        guard pending.keeplineWorkItemID != nil else {
            throw StashKeeplineCoordinatorError.missingWorkItemIdentity
        }
        // Gate only the launch mutation. Work-item identity above must still be
        // established so manualLink can recover when this capability is absent.
        if let capabilities {
            let required = "dispatch.\(pending.runtimeID)"
            guard capabilities.contains(required) else { return nil }
        }
        let prompt = [task.title, task.notes.nonEmpty].compactMap { $0 }.joined(separator: "\n\n")
        // `perform` suspends on require(store)/flush before running the closure.
        // Recheck inside the closure — after that gate — so a concurrent manualLink
        // during flush cannot still reach transport.dispatch.
        enum LaunchGateResult {
            case superseded
            case dispatched(KeeplineDispatch)
        }
        let gateResult = try await WorkspacePersistenceGate.perform(.launchDispatch, store: store) {
            guard let current = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }),
                  Self.matchesLaunchAttempt(current, original: link),
                  current.sessionID == nil,
                  !current.isTerminal,
                  !reservedManualRecoveryLinkIDs.contains(link.id),
                  let workItemID = current.keeplineWorkItemID else {
                return LaunchGateResult.superseded
            }
            let dispatch = try await transport.dispatch(
                workItemID: workItemID,
                request: DispatchRequest(
                    runtimeID: KeeplineRuntimeID(rawValue: current.runtimeID),
                    cwd: projectRoot,
                    prompt: prompt,
                    idempotencyKey: key
                )
            )
            return .dispatched(dispatch)
        }
        guard case let .dispatched(dispatch) = gateResult else {
            return nil
        }
        // Reload after remote work so a concurrent manualLink is not wiped.
        guard let current = store.workspace.agentTaskLinks.first(where: { $0.id == pending.id }),
              Self.matchesLaunchAttempt(current, original: link),
              !current.isTerminal else {
            return nil
        }
        if current.sessionID != nil {
            return nil
        }
        // Sibling refresh may have already promoted this link to .ambiguous
        // with candidates while this launch was in flight. Do not let an older
        // nonterminal response erase that transition (same skip as the
        // existing-dispatch status-poll path).
        if current.dispatchState == .ambiguous {
            return nil
        }
        let updated = Self.applying(dispatch, to: current)
        try await persistLinkRequiringSave(updated, restoringOnFailure: current)
        return dispatch
    }

    /// True when `current` is still the same launch attempt that started resume.
    /// Same-ID imports can preserve the UUID while swapping task/attempt fields.
    private static func matchesLaunchAttempt(
        _ current: AgentTaskLink,
        original: AgentTaskLink
    ) -> Bool {
        current.id == original.id
            && current.taskID == original.taskID
            && current.source == .dispatched
            && current.idempotencyKey == original.idempotencyKey
            && current.projectRoot == original.projectRoot
            && current.runtimeID == original.runtimeID
    }

    /// Persists `updated`, then flushes. On flush failure, restores `previous` in
    /// memory so an unsaved linked session cannot look like a recovered link —
    /// but only when the poll-owned value is still current. A concurrent
    /// `manualLink` (or other MainActor update) may replace the link while
    /// `require` is suspended; rolling back then would erase the newer update.
    private func persistLinkRequiringSave(
        _ updated: AgentTaskLink,
        restoringOnFailure previous: AgentTaskLink
    ) async throws {
        guard store.persistAgentLink(updated) else {
            throw StashKeeplineCoordinatorError.activeLinkConflict
        }
        do {
            try await WorkspacePersistenceGate.require(store)
        } catch {
            if updated != previous,
               let current = store.workspace.agentTaskLinks.first(where: { $0.id == updated.id }),
               current == updated {
                _ = store.persistAgentLink(previous)
            }
            throw error
        }
    }

    private static func cancellationError(
        notices: [StashIntegrationNotice],
        recoveredTaskIDs: [UUID],
        links: [AgentTaskLink]
    ) -> Error {
        let partial = StashPendingResumeResult(
            notices: notices,
            recoveredTaskIDs: recoveredTaskIDs
        ).revalidated(against: links)
        if partial.isEmpty {
            return CancellationError()
        }
        return StashPendingResumeCancellation(partial: partial)
    }

    private func appendResumeOutcome(
        for link: AgentTaskLink,
        dispatch: KeeplineDispatch,
        notices: inout [StashIntegrationNotice],
        recoveredTaskIDs: inout [UUID]
    ) {
        // Prefer the post-persist link id/state when available.
        let current = store.workspace.agentTaskLinks.first(where: { $0.id == link.id }) ?? link
        let state = AgentDispatchState(rawValue: dispatch.state)
        if state == .ambiguous {
            notices.append(StashIntegrationNotice(
                taskID: current.taskID,
                linkID: current.id,
                message: "More than one Agent session matched. Choose the correct session.",
                observedDispatchState: current.dispatchState
            ))
        } else if state == .failed || state == .cancelled {
            notices.append(StashIntegrationNotice(
                taskID: current.taskID,
                linkID: current.id,
                message: dispatch.error ?? "Keepline could not launch this Agent.",
                observedDispatchState: current.dispatchState
            ))
        } else {
            recoveredTaskIDs.append(current.taskID)
        }
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
    case invalidCompletionContext
    case invalidCompletionResponse
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
        case .invalidCompletionContext: "The completion evidence does not belong to this task and Agent session."
        case .invalidCompletionResponse: "Keepline returned a completion review for different evidence."
        case .workItemIdentityChanged: "Keepline returned a different work item for this task."
        }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
