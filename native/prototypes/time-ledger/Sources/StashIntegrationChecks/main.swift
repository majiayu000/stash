import Foundation
import KeeplineKit
import StashCore
import StashKeeplineIntegration

private enum CheckFailure: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case let .failed(message): message
        }
    }
}

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else { throw CheckFailure.failed(message) }
}

private struct ForcedSaveFailure: LocalizedError {
    var errorDescription: String? { "forced integration save failure" }
}

private actor FailAtSaveRepository: WorkspaceRepository {
    private(set) var workspace: LedgerWorkspace?
    private(set) var saveAttempt = 0
    private let failingSaveAttempt: Int

    init(workspace: LedgerWorkspace, failingSaveAttempt: Int) {
        self.workspace = workspace
        self.failingSaveAttempt = failingSaveAttempt
    }

    func load() async throws -> LedgerWorkspace? { workspace }

    func save(_ workspace: LedgerWorkspace) async throws {
        saveAttempt += 1
        if saveAttempt == failingSaveAttempt {
            throw ForcedSaveFailure()
        }
        self.workspace = workspace
    }
}

private enum RecordedMutation: Hashable {
    case upsert
    case manualSessionLink
    case launchDispatch
    case ambiguousResolution
    case completionReview
}

private actor RecordingTransport: KeeplineTransport {
    private var mutationCounts: [RecordedMutation: Int] = [:]
    private var dispatchIDsByKey: [String: String] = [:]
    private(set) var dispatchKeys: [String] = []
    private(set) var logicalLaunchCount = 0

    func count(_ mutation: RecordedMutation) -> Int {
        mutationCounts[mutation, default: 0]
    }

    func metadata() async throws -> KeeplineMetadata {
        try fixture("""
        {
          "apiVersion":"1.0","serviceVersion":"test","instanceId":"test",
          "mode":"service","capabilities":[],"runtimes":[]
        }
        """)
    }

    func listSessions() async throws -> [KeeplineSession] { [] }

    func upsertExternalWorkItem(
        source: String,
        externalID: String,
        input: ExternalWorkItemInput
    ) async throws -> KeeplineWorkItem {
        mutationCounts[.upsert, default: 0] += 1
        return try workItemFixture(id: "work-1", title: input.title, status: input.status)
    }

    func linkSession(workItemID: String, sessionID: String) async throws -> KeeplineSessionLink {
        mutationCounts[.manualSessionLink, default: 0] += 1
        return try fixture("""
        {
          "id":"link-1","workItemId":"\(workItemID)","agentSessionId":"agent-session-1",
          "linkSource":"user","acceptanceStatus":"accepted","acceptedAt":"2026-08-30T00:00:00Z",
          "createdAt":"2026-08-30T00:00:00Z","updatedAt":"2026-08-30T00:00:00Z"
        }
        """)
    }

    func dispatch(workItemID: String, request: DispatchRequest) async throws -> KeeplineDispatch {
        mutationCounts[.launchDispatch, default: 0] += 1
        dispatchKeys.append(request.idempotencyKey)
        let dispatchID: String
        if let existing = dispatchIDsByKey[request.idempotencyKey] {
            dispatchID = existing
        } else {
            logicalLaunchCount += 1
            dispatchID = "dispatch-\(logicalLaunchCount)"
            dispatchIDsByKey[request.idempotencyKey] = dispatchID
        }
        return try dispatchFixture(
            id: dispatchID,
            workItemID: workItemID,
            runtimeID: request.runtimeID.rawValue,
            cwd: request.cwd,
            state: "awaiting_session"
        )
    }

    func dispatch(id: String) async throws -> KeeplineDispatch {
        try dispatchFixture(
            id: id,
            workItemID: "work-1",
            runtimeID: "codex",
            cwd: "/tmp",
            state: "awaiting_session"
        )
    }

    func resolveDispatchSession(id: String, sessionID: String) async throws -> KeeplineDispatch {
        mutationCounts[.ambiguousResolution, default: 0] += 1
        return try dispatchFixture(
            id: id,
            workItemID: "work-1",
            runtimeID: "codex",
            cwd: "/tmp",
            state: "linked",
            linkedSessionID: sessionID
        )
    }

    func reviewCompletion(
        workItemID: String,
        request: CompletionReviewRequest
    ) async throws -> CompletionReviewResult {
        mutationCounts[.completionReview, default: 0] += 1
        return try fixture("""
        {
          "review":{
            "id":"review-1","workItemId":"\(workItemID)","evidenceId":"evidence-1",
            "decision":"\(request.decision.rawValue)","createdAt":"2026-08-30T00:00:00Z",
            "updatedAt":"2026-08-30T00:00:00Z"
          },
          "item":{
            "id":"\(workItemID)","title":"Task","body":null,"projectRoot":"/tmp",
            "kind":"todo","status":"done","externalSource":"stash","externalId":"task-1",
            "createdAt":"2026-08-30T00:00:00Z","updatedAt":"2026-08-30T00:00:00Z"
          }
        }
        """)
    }
}

@main
private struct StashIntegrationChecks {
    static func main() async throws {
        try await checkLaunchUpsertGate()
        try await checkLaunchDispatchGate()
        try await checkManualLinkGates()
        try await checkAmbiguousResolutionGate()
        try await checkCompletionReviewGate()
        try await checkProjectionSyncGate()
        try await checkIdempotentRestartRecovery()
        print("StashIntegrationChecks: all checks passed")
    }

    @MainActor
    private static func checkLaunchUpsertGate() async throws {
        let task = LedgerTask(title: "Launch upsert gate")
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task]),
            failingSaveAttempt: 2
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        try await expectPersistenceFailure {
            try await coordinator.launch(
                runtimeID: .codex,
                directory: FileManager.default.temporaryDirectory,
                task: task
            )
        }
        let upserts = await transport.count(.upsert)
        let dispatches = await transport.count(.launchDispatch)
        try expect(upserts == 0, "launch upsert escaped its production gate")
        try expect(dispatches == 0, "launch dispatched after upsert persistence failed")
    }

    @MainActor
    private static func checkLaunchDispatchGate() async throws {
        let task = LedgerTask(title: "Launch dispatch gate")
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task]),
            failingSaveAttempt: 4
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        try await expectPersistenceFailure {
            try await coordinator.launch(
                runtimeID: .codex,
                directory: FileManager.default.temporaryDirectory,
                task: task
            )
        }
        let upserts = await transport.count(.upsert)
        let dispatches = await transport.count(.launchDispatch)
        try expect(upserts == 1, "launch fixture did not reach the dispatch gate")
        try expect(dispatches == 0, "launch dispatch escaped its production gate")
    }

    @MainActor
    private static func checkManualLinkGates() async throws {
        let session = try sessionFixture()

        let upsertTask = LedgerTask(title: "Manual upsert gate")
        let upsertRepository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [upsertTask]),
            failingSaveAttempt: 2
        )
        let upsertStore = LedgerStore(repository: upsertRepository, initialWorkspace: LedgerWorkspace())
        await upsertStore.bootstrap()
        let upsertTransport = RecordingTransport()
        let upsertCoordinator = StashKeeplineCoordinator(store: upsertStore, transport: upsertTransport)
        try await expectPersistenceFailure {
            try await upsertCoordinator.manualLink(session, to: upsertTask)
        }
        let upserts = await upsertTransport.count(.upsert)
        try expect(upserts == 0, "manual-link upsert escaped its production gate")

        let linkTask = LedgerTask(title: "Manual session-link gate")
        let linkRepository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [linkTask]),
            failingSaveAttempt: 3
        )
        let linkStore = LedgerStore(repository: linkRepository, initialWorkspace: LedgerWorkspace())
        await linkStore.bootstrap()
        let linkTransport = RecordingTransport()
        let linkCoordinator = StashKeeplineCoordinator(store: linkStore, transport: linkTransport)
        try await expectPersistenceFailure {
            try await linkCoordinator.manualLink(session, to: linkTask)
        }
        let linkedUpserts = await linkTransport.count(.upsert)
        let links = await linkTransport.count(.manualSessionLink)
        try expect(linkedUpserts == 1, "manual-link fixture did not reach the session-link gate")
        try expect(links == 0, "manual session link escaped its production gate")
    }

    @MainActor
    private static func checkAmbiguousResolutionGate() async throws {
        let task = LedgerTask(title: "Resolve ambiguous gate")
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-1",
            dispatchID: "dispatch-1",
            dispatchState: .ambiguous,
            candidateSessionIDs: ["runtime-session-1"],
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task], agentTaskLinks: [link]),
            failingSaveAttempt: 2
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        try await expectPersistenceFailure {
            try await coordinator.resolveAmbiguous(
                link: link,
                with: try sessionFixture(),
                task: task
            )
        }
        let resolves = await transport.count(.ambiguousResolution)
        try expect(resolves == 0, "ambiguous resolution escaped its production gate")
    }

    @MainActor
    private static func checkCompletionReviewGate() async throws {
        let task = LedgerTask(title: "Completion review gate", status: .active)
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-1",
            sessionID: "runtime-session-1",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .manuallyLinked
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task], agentTaskLinks: [link]),
            failingSaveAttempt: 2
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        try await expectPersistenceFailure {
            try await coordinator.reviewCompletion(
                link: link,
                session: try sessionFixture(),
                task: task,
                accepted: true
            )
        }
        let reviews = await transport.count(.completionReview)
        try expect(reviews == 0, "completion review escaped its production gate")
        try expect(store.task(id: task.id)?.status == .active, "failed review changed the Stash task")
    }

    @MainActor
    private static func checkProjectionSyncGate() async throws {
        let task = LedgerTask(title: "Projection gate", status: .planned)
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-1",
            sessionID: "runtime-session-1",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .manuallyLinked
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task], agentTaskLinks: [link]),
            failingSaveAttempt: 2
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        try await expectPersistenceFailure {
            try await coordinator.syncTaskProjections()
        }
        let upserts = await transport.count(.upsert)
        try expect(upserts == 0, "projection sync escaped its production gate")
    }

    @MainActor
    private static func checkIdempotentRestartRecovery() async throws {
        let task = LedgerTask(title: "Recover one logical dispatch")
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task]),
            failingSaveAttempt: 5
        )
        let transport = RecordingTransport()
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        try await expectPersistenceFailure {
            try await coordinator.launch(
                runtimeID: .codex,
                directory: FileManager.default.temporaryDirectory,
                task: task
            )
        }

        let restarted = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await restarted.bootstrap()
        let restartedCoordinator = StashKeeplineCoordinator(store: restarted, transport: transport)
        _ = try await restartedCoordinator.resumePendingAttempts()

        let keys = await transport.dispatchKeys
        let logicalLaunches = await transport.logicalLaunchCount
        let savedWorkspace = await repository.workspace
        try expect(keys.count == 2, "restart recovery did not issue two dispatch requests")
        try expect(keys[0] == keys[1], "restart recovery changed the stable idempotency key")
        try expect(logicalLaunches == 1, "idempotent retry produced two logical launches")
        let savedLink = savedWorkspace?.agentTaskLinks.first
        try expect(savedLink?.dispatchID == "dispatch-1", "retry did not converge on the original dispatch")
    }

    @MainActor
    private static func expectPersistenceFailure(
        _ operation: () async throws -> Void
    ) async throws {
        do {
            try await operation()
            throw CheckFailure.failed("expected production coordinator persistence failure")
        } catch is WorkspacePersistenceGateError {
            return
        }
    }
}

private func sessionFixture() throws -> KeeplineSession {
    try fixture("""
    {
      "id":"session-row-1","sessionId":"runtime-session-1","runtimeId":"codex",
      "title":"Fixture session","directory":"/tmp","status":"running",
      "lastActiveAt":"2026-08-30T00:00:00Z","evidenceSummary":"Completed fixture",
      "completionEvidenceId":"evidence-1","processRunning":true
    }
    """)
}

private func workItemFixture(id: String, title: String, status: String) throws -> KeeplineWorkItem {
    try fixture("""
    {
      "id":"\(id)","title":"\(title)","body":null,"projectRoot":"/tmp",
      "kind":"todo","status":"\(status)","externalSource":"stash","externalId":"task-1",
      "createdAt":"2026-08-30T00:00:00Z","updatedAt":"2026-08-30T00:00:00Z"
    }
    """)
}

private func dispatchFixture(
    id: String,
    workItemID: String,
    runtimeID: String,
    cwd: String,
    state: String,
    linkedSessionID: String? = nil
) throws -> KeeplineDispatch {
    let linkedSession = linkedSessionID.map { "\"\($0)\"" } ?? "null"
    return try fixture("""
    {
      "id":"\(id)","workItemId":"\(workItemID)","runtimeId":"\(runtimeID)",
      "cwd":"\(cwd)","state":"\(state)","candidateSessionIds":[],
      "linkedAgentSessionId":null,"linkedSessionId":\(linkedSession),"error":null,
      "launchedAt":"2026-08-30T00:00:00Z","correlationDeadlineAt":"2026-08-30T00:01:00Z",
      "createdAt":"2026-08-30T00:00:00Z","updatedAt":"2026-08-30T00:00:00Z"
    }
    """)
}

private func fixture<Value: Decodable>(_ json: String) throws -> Value {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(Value.self, from: Data(json.utf8))
}
