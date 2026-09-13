import Foundation
import Darwin
import KeeplineKit
import StashCore
import StashKeeplineIntegration

private struct ForcedSaveFailure: LocalizedError {
    var errorDescription: String? { "forced integration save failure" }
}

private actor FailAtSaveRepository: WorkspaceRepository {
    private(set) var workspace: LedgerWorkspace?
    private(set) var saveAttempt = 0
    private let failingSaveAttempt: Int
    private var failNextSave = false
    private var onFailingSave: (@Sendable () async -> Void)?
    private var onNextSave: (@Sendable () async -> Void)?

    init(workspace: LedgerWorkspace, failingSaveAttempt: Int) {
        self.workspace = workspace
        self.failingSaveAttempt = failingSaveAttempt
    }

    func armNextSaveFailure(onFailingSave: (@Sendable () async -> Void)? = nil) {
        failNextSave = true
        self.onFailingSave = onFailingSave
    }

    /// Suspends the next successful `save` so MainActor work can interleave while
    /// `WorkspacePersistenceGate.require`/`flush` is awaiting the repository.
    func armNextSaveSuspension(_ onNextSave: @escaping @Sendable () async -> Void) {
        self.onNextSave = onNextSave
    }

    func load() async throws -> LedgerWorkspace? { workspace }

    func save(_ workspace: LedgerWorkspace) async throws {
        saveAttempt += 1
        if failNextSave {
            failNextSave = false
            let hook = onFailingSave
            onFailingSave = nil
            if let hook {
                await hook()
            }
            throw ForcedSaveFailure()
        }
        if saveAttempt == failingSaveAttempt {
            throw ForcedSaveFailure()
        }
        if let hook = onNextSave {
            onNextSave = nil
            await hook()
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
    case recoveryExecution
}

private struct ForcedDispatchLookupFailure: LocalizedError {
    var errorDescription: String? { "forced dispatch lookup failure" }
}

/// Coordinates mid-upsert cancellation: upsert waits until the test cancels the
/// resume task, then continues so cooperative checks run before launch dispatch.
private actor UpsertCancellationGate {
    private var upsertStarted: CheckedContinuation<Void, Never>?
    private var allowContinue: CheckedContinuation<Void, Never>?
    private var didStart = false
    private var shouldRelease = false

    func waitUntilUpsertStarted() async {
        if didStart { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            upsertStarted = continuation
        }
    }

    func waitUntilCancelled() async {
        didStart = true
        upsertStarted?.resume()
        upsertStarted = nil
        if shouldRelease { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            allowContinue = continuation
        }
    }

    func releaseUpsert() {
        shouldRelease = true
        allowContinue?.resume()
        allowContinue = nil
    }
}

private actor RecordingTransport: KeeplineTransport {
    private var mutationCounts: [RecordedMutation: Int] = [:]
    private var dispatchIDsByKey: [String: String] = [:]
    private(set) var dispatchKeys: [String] = []
    private(set) var logicalLaunchCount = 0
    private(set) var dispatchLookupIDs: [String] = []
    private let completionReviewEvidenceID: String?
    private let dispatchLookupError: Error?
    private let onDispatchLookup: (@Sendable () async -> Void)?
    private let onUpsert: (@Sendable () async -> Void)?
    private let onLinkSession: (@Sendable () async -> Void)?
    private let onLaunchDispatch: (@Sendable () async -> Void)?
    private let launchDispatchState: String
    private let launchDispatchError: String?
    private let dispatchLookupState: String
    private let dispatchLookupLinkedSessionID: String?
    private let dispatchLookupErrorsByID: [String: Error]
    private(set) var recoveredSessionIDs: [String] = []

    init(
        completionReviewEvidenceID: String? = nil,
        dispatchLookupError: Error? = nil,
        dispatchLookupErrorsByID: [String: Error] = [:],
        onDispatchLookup: (@Sendable () async -> Void)? = nil,
        onUpsert: (@Sendable () async -> Void)? = nil,
        onLinkSession: (@Sendable () async -> Void)? = nil,
        onLaunchDispatch: (@Sendable () async -> Void)? = nil,
        launchDispatchState: String = "awaiting_session",
        launchDispatchError: String? = nil,
        dispatchLookupState: String = "awaiting_session",
        dispatchLookupLinkedSessionID: String? = nil
    ) {
        self.completionReviewEvidenceID = completionReviewEvidenceID
        self.dispatchLookupError = dispatchLookupError
        self.dispatchLookupErrorsByID = dispatchLookupErrorsByID
        self.onDispatchLookup = onDispatchLookup
        self.onUpsert = onUpsert
        self.onLinkSession = onLinkSession
        self.onLaunchDispatch = onLaunchDispatch
        self.launchDispatchState = launchDispatchState
        self.launchDispatchError = launchDispatchError
        self.dispatchLookupState = dispatchLookupState
        self.dispatchLookupLinkedSessionID = dispatchLookupLinkedSessionID
    }

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

    func recoveryPreview(sessionID: String) async throws -> KeeplineRecoveryPreview {
        try recoveryPreviewFixture(sessionID: sessionID)
    }

    func executeRecovery(
        sessionID: String,
        request: RecoveryExecutionRequest
    ) async throws -> KeeplineRecoveryExecution {
        mutationCounts[.recoveryExecution, default: 0] += 1
        recoveredSessionIDs.append(sessionID)
        return KeeplineRecoveryExecution(
            preview: try recoveryPreviewFixture(sessionID: sessionID),
            executed: true
        )
    }

    func upsertExternalWorkItem(
        source: String,
        externalID: String,
        input: ExternalWorkItemInput
    ) async throws -> KeeplineWorkItem {
        if let onUpsert {
            await onUpsert()
        }
        mutationCounts[.upsert, default: 0] += 1
        return try workItemFixture(id: "work-1", title: input.title, status: input.status)
    }

    func linkSession(workItemID: String, sessionID: String) async throws -> KeeplineSessionLink {
        if let onLinkSession {
            await onLinkSession()
        }
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
        if let onLaunchDispatch {
            await onLaunchDispatch()
        }
        return try dispatchFixture(
            id: dispatchID,
            workItemID: workItemID,
            runtimeID: request.runtimeID.rawValue,
            cwd: request.cwd,
            state: launchDispatchState,
            error: launchDispatchError
        )
    }

    func dispatch(id: String) async throws -> KeeplineDispatch {
        dispatchLookupIDs.append(id)
        if let onDispatchLookup {
            await onDispatchLookup()
        }
        if let dispatchLookupError {
            throw dispatchLookupError
        }
        if let perIDError = dispatchLookupErrorsByID[id] {
            throw perIDError
        }
        return try dispatchFixture(
            id: id,
            workItemID: "work-1",
            runtimeID: "codex",
            cwd: "/tmp",
            state: dispatchLookupState,
            linkedSessionID: dispatchLookupLinkedSessionID
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
            "id":"review-1","workItemId":"\(workItemID)","evidenceId":"\(completionReviewEvidenceID ?? request.evidenceID)",
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
        try checkOwnedChildTermination()
        try checkAgentAttentionQueue()
        try await checkRecoveryConfirmationTransport()
        try await checkLaunchUpsertGate()
        try await checkLaunchDispatchGate()
        try await checkManualLinkGates()
        try await checkAmbiguousResolutionGate()
        try await checkCompletionReviewGate()
        try await checkCompletionReviewResponseIdentity()
        try await checkProjectionSyncGate()
        try await checkIdempotentRestartRecovery()
        try await checkResumeDispatchFailureIsIsolated()
        try await checkResumeSkipsLaunchWithoutCapabilityButPollsExisting()
        try await checkResumeUpsertsWorkItemWithoutCapability()
        try await checkManualLinkEstablishesMissingWorkItemIdentity()
        try await checkResumeGatesLaunchRetriesPerRuntimeCapability()
        try await checkResumePropagatesCancellation()
        try await checkResumePreservesPartialOutcomesOnCancellation()
        try await checkResumeClearsRecoveredTaskIDs()
        try await checkResumeDoesNotOverwriteManualLinkDuringPoll()
        try await checkResumeSuppressesLookupFailureAfterManualLink()
        try await checkResumeDropsBufferedNoticeAfterLaterManualLink()
        try await checkRevalidatedDropsNoticeSupersededByNewerTaskLink()
        try checkRevalidatedKeepsCurrentFailureWhenOlderLinkSuperseded()
        try await checkRevalidatedDropsNoticeSupersededByNewerTerminalPoll()
        try checkRevalidatedToleratesDuplicateImportedLinkIDs()
        try await checkLaunchRetryTerminalFailurePublishesNotice()
        try await checkResumeDropsBufferedNoticeAfterOverlappingTerminalPoll()
        try await checkResumeRejectsNoticeAfterNewerSuccessfulPollGeneration()
        try await checkResumeKeepsTerminalNoticeDespiteRecoveryGeneration()
        try await checkResumeKeepsAmbiguousNoticeDespiteRecoveryGeneration()
        try await checkForegroundErrorGenerationRejectsBufferedResumeNotice()
        try await checkForegroundErrorGenerationRejectsBufferedTerminalNotice()
        try await checkRevalidatedRecoversWhenOriginatingLinkMissing()
        try await checkResumePropagatesSaveFailureAfterLinkedPoll()
        try await checkResumeDoesNotRollbackConcurrentManualLinkOnSaveFailure()
        try await checkResumeRollsBackToReloadedWorkItemOnSaveFailure()
        try await checkResumeRejectsStalePollAfterAmbiguousTransition()
        try await checkResumeRejectsStaleLaunchAfterAmbiguousTransition()
        try await checkResumeCancelsBeforeLaunchMutation()
        try await checkResumeCancelsAfterFinalLookupReturnsNormally()
        try await checkResumeSkipsLaunchAfterManualLinkDuringUpsert()
        try await checkResumeSkipsLaunchAfterManualLinkDuringLaunchFlush()
        try await checkResumeSkipsPersistingLinkRemovedDuringImport()
        try await checkManualLinkReservesMissingIdentityAgainstResume()
        try await checkManualLinkReservesKnownIdentityAgainstResume()
        try await checkManualLinkRejectsAmbiguousDuringReservedUpsert()
        try await checkResumeSkipsLaunchAfterImportReplacesSameIDAttempt()
        try await checkManualLinkRejectsImportRemovalDuringMissingIdentityUpsert()
        try await checkManualLinkRejectsSameIDImportDuringMissingIdentitySessionLink()
        try await checkManualLinkRejectsImportedWorkItemIdentityDuringMissingIdentitySessionLink()
        try await checkManualLinkRejectsImportedWorkItemIdentityDuringKnownIdentityUpsert()
        try await checkResumePreservesImportedWorkItemIdentityDuringMissingIdentityUpsert()
        try await checkManualLinkAcceptsConcurrentPollAttachedRequestedSession()
        if let binary = ProcessInfo.processInfo.environment["STASH_KEEPLINE_E2E_BINARY"],
           !binary.isEmpty {
            try await checkPackagedCompletionClaimFlow(binary: binary)
            print("StashIntegrationChecks: bundled service completion-claim check passed")
        } else {
            print("StashIntegrationChecks: in-memory checks passed; bundled service check not requested")
        }
    }

    private static func checkOwnedChildTermination() throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-c", "trap '' TERM; while true; do sleep 1; done"]
        let lifetimePipe = Pipe()
        process.standardInput = lifetimePipe.fileHandleForReading
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        lifetimePipe.fileHandleForReading.closeFile()

        stopOwnedProcess(
            process,
            lifetimeHandle: lifetimePipe.fileHandleForWriting,
            gracefulTimeout: 0.1,
            terminationTimeout: 0.1
        )

        try expect(!process.isRunning, "owned child remained alive after bounded shutdown")
    }

    private static func checkAgentAttentionQueue() throws {
        let ambiguousTask = LedgerTask(title: "Choose the matching session")
        let completionTask = LedgerTask(title: "Review the completed work")
        let waitingTask = LedgerTask(title: "Answer the Agent")
        let lostTask = LedgerTask(title: "Recover interrupted work")
        let quietTask = LedgerTask(title: "Keep working")
        let completedTask = LedgerTask(title: "Already closed", status: .completed)
        let tasks = [ambiguousTask, completionTask, waitingTask, lostTask, quietTask, completedTask]
        let links = [
            AgentTaskLink(
                taskID: ambiguousTask.id,
                dispatchID: "dispatch-ambiguous",
                dispatchState: .ambiguous,
                candidateSessionIDs: ["candidate-a", "candidate-b"],
                runtimeID: "codex",
                source: .dispatched
            ),
            AgentTaskLink(
                taskID: completionTask.id,
                sessionID: "completion-session",
                dispatchState: .linked,
                runtimeID: "claude-code",
                source: .dispatched
            ),
            AgentTaskLink(
                taskID: waitingTask.id,
                sessionID: "waiting-session",
                dispatchState: .linked,
                runtimeID: "codex",
                source: .dispatched
            ),
            AgentTaskLink(
                taskID: lostTask.id,
                sessionID: "lost-session",
                dispatchState: .linked,
                runtimeID: "codex",
                source: .dispatched
            ),
            AgentTaskLink(
                taskID: quietTask.id,
                sessionID: "running-session",
                dispatchState: .linked,
                runtimeID: "claude-code",
                source: .dispatched
            ),
            AgentTaskLink(
                taskID: completedTask.id,
                sessionID: "closed-lost-session",
                dispatchState: .linked,
                runtimeID: "codex",
                source: .dispatched
            )
        ]
        let sessions = try [
            attentionSessionFixture(id: "completion-session", status: "completed", evidenceID: "evidence-1"),
            attentionSessionFixture(id: "waiting-session", status: "waiting"),
            attentionSessionFixture(id: "lost-session", status: "lost"),
            attentionSessionFixture(id: "running-session", status: "running"),
            attentionSessionFixture(id: "closed-lost-session", status: "lost")
        ]

        let items = AgentAttentionQueue.items(tasks: tasks, links: links, sessions: sessions)

        try expect(items.map(\.kind) == [.ambiguous, .completionReview, .waitingInput, .interrupted],
                   "attention queue did not preserve action priority")
        try expect(items.map(\.taskID) == [ambiguousTask.id, completionTask.id, waitingTask.id, lostTask.id],
                   "attention queue included quiet or closed tasks")
        try expect(items.last?.sessionID == "lost-session",
                   "interrupted attention item lost its exact runtime session ID")
    }

    private static func checkRecoveryConfirmationTransport() async throws {
        let transport = RecordingTransport()
        let preview = try await transport.recoveryPreview(sessionID: "runtime-session-1")
        try expect(preview.sessionID == "runtime-session-1", "recovery preview changed the session ID")
        try expect(preview.arguments == ["resume", "runtime-session-1"],
                   "recovery preview did not preserve structured arguments")
        let execution = try await transport.executeRecovery(
            sessionID: preview.sessionID,
            request: RecoveryExecutionRequest(
                confirmationID: preview.confirmationID,
                terminalApp: .automatic,
                idempotencyKey: "recovery-check-1"
            )
        )
        try expect(execution.executed, "confirmed recovery was not executed")
        let recoveredSessionIDs = await transport.recoveredSessionIDs
        try expect(recoveredSessionIDs == ["runtime-session-1"],
                   "recovery executed a different session")
    }

    @MainActor
    private static func checkPackagedCompletionClaimFlow(binary: String) async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let apiPort = Int(environment["STASH_KEEPLINE_E2E_API_PORT"] ?? ""),
              let hookPort = Int(environment["STASH_KEEPLINE_E2E_HOOK_PORT"] ?? "") else {
            throw CheckFailure.failed("packaged E2E requires API and hook ports")
        }

        let fileManager = FileManager.default
        let root = URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            .appendingPathComponent("stash-keepline-e2e-\(UUID().uuidString)", isDirectory: true)
        let home = root.appendingPathComponent("home", isDirectory: true)
        let keeplineHome = root.appendingPathComponent("keepline", isDirectory: true)
        let project = root.appendingPathComponent("project", isDirectory: true)
        let claudeProjects = home
            .appendingPathComponent(".claude", isDirectory: true)
            .appendingPathComponent("projects", isDirectory: true)
        let transcriptDirectory = claudeProjects
            .appendingPathComponent(
                project.path.replacingOccurrences(of: "/", with: "-"),
                isDirectory: true
            )
        try fileManager.createDirectory(at: keeplineHome, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: project, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: transcriptDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: root) }

        let config: [String: Any] = [
            "hookPort": hookPort,
            "fileLogging": false,
            "logLevel": "info"
        ]
        try JSONSerialization.data(withJSONObject: config, options: [.sortedKeys])
            .write(to: keeplineHome.appendingPathComponent("config.json"), options: [.atomic])

        let hookCommand = "KEEPLINE_HOOK_MARKER=keepline-hook-v2 "
            + "curl -fsS -X POST http://127.0.0.1:\(hookPort)/hook "
            + "-H \"Content-Type: application/json\" --data-binary @- > /dev/null 2>&1 || true"
        let claudeSettings: [String: Any] = [
            "hooks": [
                "Stop": [[
                    "hooks": [["type": "command", "command": hookCommand]]
                ]]
            ]
        ]
        let claudeHome = home.appendingPathComponent(".claude", isDirectory: true)
        try fileManager.createDirectory(at: claudeHome, withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: claudeSettings, options: [.sortedKeys])
            .write(to: claudeHome.appendingPathComponent("settings.json"), options: [.atomic])

        let sessionID = "stash-e2e-session"
        let now = ISO8601DateFormatter().string(from: Date())
        let transcript: [String: Any] = [
            "type": "user",
            "uuid": "stash-e2e-user",
            "sessionId": sessionID,
            "cwd": project.path,
            "timestamp": now,
            "userType": "external",
            "message": ["role": "user", "content": "Verify packaged Stash completion flow"]
        ]
        var transcriptData = try JSONSerialization.data(withJSONObject: transcript)
        transcriptData.append(Data("\n".utf8))
        try transcriptData.write(
            to: transcriptDirectory.appendingPathComponent("\(sessionID).jsonl"),
            options: [.atomic]
        )

        let baseURL = URL(string: "http://127.0.0.1:\(apiPort)")!
        let processEnvironment = environment.merging([
            "HOME": home.path,
            "KEEPLINE_HOME": keeplineHome.path,
            "KEEPLINE_PROJECT_ROOTS": claudeProjects.path
        ]) { _, isolated in isolated }

        var service = try launchService(
            binary: binary,
            apiPort: apiPort,
            environment: processEnvironment
        )
        defer { stopService(service) }

        var client = KeeplineClient(configuration: try KeeplineClientConfiguration(baseURL: baseURL))
        let metadata: KeeplineMetadata
        do {
            metadata = try await waitForValue("packaged Keepline metadata") {
                try? await client.metadata()
            }
        } catch {
            if !service.isRunning {
                throw CheckFailure.failed(
                    "packaged Keepline exited before metadata (status \(service.terminationStatus))"
                )
            }
            throw error
        }
        let claudeRuntime = metadata.runtimes.first { $0.id == .claudeCode }
        try expect(
            claudeRuntime?.capabilities.contains("agent-completion-claim-hook") == true,
            "packaged service did not advertise its completion-claim receiver"
        )
        try expect(
            claudeRuntime?.capabilities.contains("explicit-completion-manual-only") == true,
            "packaged service overstated automatic completion"
        )
        try expect(
            claudeRuntime?.capabilities.contains("explicit-completion-hook") != true,
            "packaged service advertised Stop as automatic completion"
        )
        try expect(
            metadata.capabilities.contains("sessions.recovery.preview") &&
            metadata.capabilities.contains("sessions.recovery.execute"),
            "packaged service did not advertise confirmed recovery"
        )
        try await waitForServiceScan(baseURL: baseURL)
        let task = LedgerTask(title: "Packaged completion E2E", status: .active)
        let workspaceURL = root.appendingPathComponent("workspace.json")
        let store = LedgerStore(
            repository: JSONWorkspaceRepository(fileURL: workspaceURL),
            initialWorkspace: LedgerWorkspace(tasks: [task])
        )
        await store.bootstrap()
        let coordinator = StashKeeplineCoordinator(
            store: store,
            transport: OfficialKeeplineTransport(client: client)
        )
        try await coordinator.manualLink(
            try scannedSessionFixture(sessionID: sessionID, directory: project.path),
            to: task
        )
        guard let link = store.agentLink(for: task.id) else {
            throw CheckFailure.failed("Stash did not persist the scanned session link")
        }
        guard let workItemID = link.keeplineWorkItemID else {
            throw CheckFailure.failed("Stash did not persist the Keepline work item ID")
        }
        let recognizedSession = try await waitForValue("accepted scanned Claude session") {
            try? await client.listSessions().first { $0.sessionID == sessionID }
        }
        try expect(recognizedSession.directory == project.path, "scanner returned the wrong cwd")
        try expect(
            recognizedSession.title == "Verify packaged Stash completion flow",
            "scanner returned the wrong task title"
        )
        let detectedLostSession = try await waitForValue("lost recovery fixture") {
            try? await client.listSessions().first {
                $0.sessionID == sessionID && $0.status == .lost
            }
        }
        let recoveryPreview = try await client.recoveryPreview(sessionID: detectedLostSession.sessionID)
        try expect(recoveryPreview.sessionID == sessionID,
                   "packaged recovery preview changed the exact session ID")
        try expect(recoveryPreview.runtimeID == .claudeCode,
                   "packaged recovery preview selected the wrong runtime")
        try expect(!recoveryPreview.arguments.contains("--dangerously-skip-permissions"),
                   "packaged recovery preview enabled a dangerous permission bypass")

        try sendStop(
            using: hookCommand,
            sessionID: sessionID,
            cwd: project.path,
            lastAssistantMessage: "I need more input before this task can be completed."
        )
        let ordinaryStopSession = try await client.listSessions().first { $0.sessionID == sessionID }
        try expect(
            ordinaryStopSession?.completionEvidenceID == nil,
            "ordinary Claude Stop was incorrectly treated as task completion"
        )

        try sendStop(
            using: hookCommand,
            sessionID: sessionID,
            cwd: project.path,
            lastAssistantMessage:
                "The requested work is complete and verified.\nKEEPLINE_COMPLETE_WORK_ITEM:\(workItemID)"
        )
        _ = try await waitForValue("explicit completion evidence") {
            try? await client.listSessions().first {
                $0.sessionID == sessionID &&
                $0.completionEvidenceID != nil &&
                $0.completionEvidenceWorkItemID == workItemID &&
                $0.completionEvidenceSource == "agent_completion_claim"
            }
        }

        stopService(service)
        try expect(service.terminationStatus == 0, "packaged Keepline did not stop cleanly")
        service = try launchService(
            binary: binary,
            apiPort: apiPort,
            environment: processEnvironment
        )
        client = KeeplineClient(configuration: try KeeplineClientConfiguration(baseURL: baseURL))
        _ = try await waitForValue("restarted packaged Keepline metadata") {
            try? await client.metadata()
        }
        let persistedSession = try await waitForValue("persisted completion evidence") {
            try? await client.listSessions().first {
                $0.sessionID == sessionID &&
                $0.completionEvidenceID != nil &&
                $0.completionEvidenceWorkItemID == workItemID &&
                $0.completionEvidenceSource == "agent_completion_claim"
            }
        }
        let restartedCoordinator = StashKeeplineCoordinator(
            store: store,
            transport: OfficialKeeplineTransport(client: client)
        )
        try await restartedCoordinator.reviewCompletion(
            link: link,
            session: persistedSession,
            task: task,
            accepted: true
        )
        try expect(store.task(id: task.id)?.status == .completed, "Stash did not accept completion")
        try expect(
            store.agentLink(for: task.id)?.completionDecision == .accepted,
            "Stash did not persist the completion decision"
        )
    }

    private static func launchService(
        binary: String,
        apiPort: Int,
        environment: [String: String]
    ) throws -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binary)
        process.arguments = ["--port", String(apiPort), "--scan-interval", "0.2"]
        process.environment = environment
        process.standardOutput = FileHandle.standardError
        process.standardError = FileHandle.standardError
        try process.run()
        return process
    }

    private static func stopService(_ process: Process) {
        stopProcess(process)
    }

    private static func stopProcess(_ process: Process) {
        guard process.isRunning else { return }
        process.terminate()
        let deadline = Date().addingTimeInterval(3)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if process.isRunning {
            kill(process.processIdentifier, SIGKILL)
        }
        process.waitUntilExit()
    }

    private static func waitForServiceScan(baseURL: URL) async throws {
        struct HealthEnvelope: Decodable {
            struct DataBody: Decodable {
                struct Scan: Decodable { let completed: Bool }
                let scan: Scan
            }
            let data: DataBody
        }
        _ = try await waitForValue("initial packaged session scan") {
            var request = URLRequest(url: baseURL.appendingPathComponent("api/v1/health"))
            request.timeoutInterval = 1
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200,
                  let health = try? JSONDecoder().decode(HealthEnvelope.self, from: data),
                  health.data.scan.completed else { return nil as Bool? }
            return true
        }
    }

    private static func sendStop(
        using command: String,
        sessionID: String,
        cwd: String,
        lastAssistantMessage: String
    ) throws {
        let payload = try JSONSerialization.data(withJSONObject: [
            "hook_event_name": "Stop",
            "session_id": sessionID,
            "cwd": cwd,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "last_assistant_message": lastAssistantMessage
        ])
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-c", command]
        let input = Pipe()
        process.standardInput = input.fileHandleForReading
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.standardError
        try process.run()
        input.fileHandleForReading.closeFile()
        input.fileHandleForWriting.write(payload)
        input.fileHandleForWriting.closeFile()
        process.waitUntilExit()
        try expect(process.terminationStatus == 0, "installed lifecycle hook command failed")
    }

    private static func waitForValue<Value>(
        _ description: String,
        timeoutSeconds: TimeInterval = 10,
        operation: () async -> Value?
    ) async throws -> Value {
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while Date() < deadline {
            if let value = await operation() { return value }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw CheckFailure.failed("timed out waiting for \(description)")
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
        let unrelatedTask = LedgerTask(title: "Unrelated task", status: .active)
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-1",
            sessionID: "runtime-session-1",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .manuallyLinked
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task, unrelatedTask], agentTaskLinks: [link]),
            failingSaveAttempt: 2
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        do {
            try await coordinator.reviewCompletion(
                link: link,
                session: try sessionFixture(),
                task: unrelatedTask,
                accepted: true
            )
            throw CheckFailure.failed("mismatched completion context reached Keepline")
        } catch StashKeeplineCoordinatorError.invalidCompletionContext {
            // Expected: public mutation boundary rejects mismatched task/link/session input.
        }
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
    private static func checkCompletionReviewResponseIdentity() async throws {
        let task = LedgerTask(title: "Completion response identity", status: .active)
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
            failingSaveAttempt: 999
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(completionReviewEvidenceID: "wrong-evidence")
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        do {
            try await coordinator.reviewCompletion(
                link: link,
                session: try sessionFixture(),
                task: task,
                accepted: true
            )
            throw CheckFailure.failed("mismatched completion review response was accepted")
        } catch StashKeeplineCoordinatorError.invalidCompletionResponse {
            // Expected: a remote response cannot mutate local truth unless all identities match.
        }

        try expect(store.task(id: task.id)?.status == .active,
                   "mismatched completion response completed the Stash task")
        try expect(store.agentLink(for: task.id)?.completionDecision == .undecided,
                   "mismatched completion response persisted a local decision")
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
    private static func checkResumeDispatchFailureIsIsolated() async throws {
        let pendingTask = LedgerTask(title: "Pending dispatch resume")
        let recoveredTask = LedgerTask(title: "Already recoverable session")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-pending",
            dispatchID: "dispatch-bad",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let recoveredLink = AgentTaskLink(
            taskID: recoveredTask.id,
            keeplineWorkItemID: "work-recovered",
            sessionID: "runtime-session-1",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .manuallyLinked
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask, recoveredTask],
                agentTaskLinks: [pendingLink, recoveredLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(dispatchLookupError: ForcedDispatchLookupFailure())
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(outcome.notices.count == 1, "resume failure did not surface exactly one task notice")
        try expect(outcome.notices[0].taskID == pendingTask.id, "resume failure notice targeted the wrong task")
        try expect(outcome.notices[0].linkID == pendingLink.id, "resume failure notice lost the originating link id")
        try expect(
            outcome.notices[0].message == "forced dispatch lookup failure",
            "resume failure notice lost the dispatch error"
        )
        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "failed resume should not mark the pending task as recovered"
        )
        try expect(
            store.agentLink(for: recoveredTask.id)?.sessionID == "runtime-session-1",
            "resume failure mutated a healthy recoverable session link"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchID == "dispatch-bad",
            "failed resume should leave the pending dispatch link in place"
        )
    }

    @MainActor
    private static func checkResumeSkipsLaunchWithoutCapabilityButPollsExisting() async throws {
        let launchTask = LedgerTask(title: "Needs launch retry")
        let pollTask = LedgerTask(title: "Needs status poll")
        let launchLink = AgentTaskLink(
            taskID: launchTask.id,
            keeplineWorkItemID: "work-launch",
            dispatchState: .pending,
            idempotencyKey: "stash:\(launchTask.id.uuidString):retry",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let pollLink = AgentTaskLink(
            taskID: pollTask.id,
            keeplineWorkItemID: "work-poll",
            dispatchID: "dispatch-existing",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [launchTask, pollTask],
                agentTaskLinks: [launchLink, pollLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts(capabilities: [])

        let lookups = await transport.dispatchLookupIDs
        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "launch retry escaped the dispatch capability gate")
        try expect(lookups == ["dispatch-existing"], "existing dispatch was not polled without launch caps")
        try expect(outcome.notices.isEmpty, "status poll without launch caps produced notices")
        try expect(
            outcome.recoveredTaskIDs == [pollTask.id],
            "successful existing-dispatch poll did not mark the task recovered"
        )
        try expect(
            store.agentLink(for: launchTask.id)?.dispatchID == nil,
            "launch-pending link should remain unlaunched without dispatch caps"
        )
    }

    @MainActor
    private static func checkResumeGatesLaunchRetriesPerRuntimeCapability() async throws {
        let codexTask = LedgerTask(title: "Codex launch pending")
        let claudeTask = LedgerTask(title: "Claude launch pending")
        let pollTask = LedgerTask(title: "Claude existing dispatch")
        let codexLink = AgentTaskLink(
            taskID: codexTask.id,
            keeplineWorkItemID: "work-codex-launch",
            dispatchState: .pending,
            idempotencyKey: "stash:\(codexTask.id.uuidString):retry",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let claudeLink = AgentTaskLink(
            taskID: claudeTask.id,
            keeplineWorkItemID: "work-claude-launch",
            dispatchState: .pending,
            idempotencyKey: "stash:\(claudeTask.id.uuidString):retry",
            projectRoot: "/tmp",
            runtimeID: "claude-code",
            source: .dispatched
        )
        let pollLink = AgentTaskLink(
            taskID: pollTask.id,
            keeplineWorkItemID: "work-claude-poll",
            dispatchID: "dispatch-claude-existing",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "claude-code",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [codexTask, claudeTask, pollTask],
                agentTaskLinks: [codexLink, claudeLink, pollLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        // Only codex launch is advertised — claude-code must stay pending, while
        // an existing claude-code dispatch ID is still reconciled via status poll.
        let outcome = try await coordinator.resumePendingAttempts(
            capabilities: ["dispatch.codex"]
        )

        let lookups = await transport.dispatchLookupIDs
        let launches = await transport.count(.launchDispatch)
        let keys = await transport.dispatchKeys
        try expect(launches == 1, "exact-runtime gate should allow only the supported launch")
        try expect(
            keys == ["stash:\(codexTask.id.uuidString):retry"],
            "unsupported runtime launch escaped the per-link capability gate"
        )
        try expect(
            lookups == ["dispatch-claude-existing"],
            "existing unsupported-runtime dispatch should still be polled"
        )
        try expect(
            store.agentLink(for: codexTask.id)?.dispatchID == "dispatch-1",
            "supported runtime launch retry did not persist a dispatch ID"
        )
        try expect(
            store.agentLink(for: claudeTask.id)?.dispatchID == nil,
            "unsupported runtime launch should remain pending until its capability appears"
        )
        try expect(
            outcome.recoveredTaskIDs.contains(pollTask.id),
            "existing-dispatch poll should still mark the polled task recovered"
        )
        try expect(
            !outcome.recoveredTaskIDs.contains(claudeTask.id),
            "unsupported launch-pending task must not be marked recovered"
        )
    }

    @MainActor
    private static func checkResumeUpsertsWorkItemWithoutCapability() async throws {
        // Interrupted launches may lack keeplineWorkItemID. When the runtime
        // capability is absent, still persist work-item identity so manualLink
        // can recover — gate only the launch mutation.
        let launchTask = LedgerTask(title: "Needs work-item without launch cap")
        let launchLink = AgentTaskLink(
            taskID: launchTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(launchTask.id.uuidString):no-cap-upsert",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [launchTask],
                agentTaskLinks: [launchLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts(capabilities: [])

        let upserts = await transport.count(.upsert)
        let launches = await transport.count(.launchDispatch)
        try expect(upserts == 1, "missing work-item was not upserted without launch capability")
        try expect(launches == 0, "launch retry escaped the dispatch capability gate")
        try expect(
            store.agentLink(for: launchTask.id)?.keeplineWorkItemID == "work-1",
            "work-item identity was not persisted when launch capability was absent"
        )
        try expect(
            store.agentLink(for: launchTask.id)?.dispatchID == nil,
            "unsupported launch should remain unlaunched after work-item upsert"
        )
        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "capability-gated launch must not be classified as recovered"
        )
    }

    @MainActor
    private static func checkManualLinkEstablishesMissingWorkItemIdentity() async throws {
        // Pending dispatched links without a work-item ID must still accept a
        // manual session choice — do not require the missing identity up front.
        let task = LedgerTask(title: "Manual link missing work item")
        let link = AgentTaskLink(
            taskID: task.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(task.id.uuidString):manual-missing-work",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(tasks: [task], agentTaskLinks: [link]),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        try await coordinator.manualLink(session, to: task)

        try expect(
            store.agentLink(for: task.id)?.keeplineWorkItemID == "work-1",
            "manualLink did not establish missing work-item identity"
        )
        try expect(
            store.agentLink(for: task.id)?.sessionID == "runtime-session-1",
            "manualLink did not attach the chosen session"
        )
        let upserts = await transport.count(.upsert)
        let links = await transport.count(.manualSessionLink)
        try expect(upserts == 1, "manualLink skipped work-item upsert for missing identity")
        try expect(links == 1, "manualLink skipped session link after establishing identity")
    }

    @MainActor
    private static func checkResumePropagatesCancellation() async throws {
        let first = LedgerTask(title: "Cancelled mid-resume")
        let second = LedgerTask(title: "Must not resume after cancel")
        let firstLink = AgentTaskLink(
            taskID: first.id,
            keeplineWorkItemID: "work-cancel-1",
            dispatchID: "dispatch-cancel-1",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let secondLink = AgentTaskLink(
            taskID: second.id,
            keeplineWorkItemID: "work-cancel-2",
            dispatchID: "dispatch-cancel-2",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [first, second],
                agentTaskLinks: [firstLink, secondLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(dispatchLookupError: CancellationError())
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        do {
            _ = try await coordinator.resumePendingAttempts()
            throw CheckFailure.failed("resumePendingAttempts swallowed CancellationError")
        } catch is CancellationError {
            // expected
        }

        let lookups = await transport.dispatchLookupIDs
        try expect(
            lookups == ["dispatch-cancel-1"],
            "cancellation continued iterating remaining pending links"
        )
    }

    @MainActor
    private static func checkResumePreservesPartialOutcomesOnCancellation() async throws {
        let recoveredTask = LedgerTask(title: "Already classified before cancel")
        let cancelledTask = LedgerTask(title: "Cancelled on second poll")
        let recoveredLink = AgentTaskLink(
            taskID: recoveredTask.id,
            keeplineWorkItemID: "work-partial-1",
            dispatchID: "dispatch-partial-ok",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let cancelledLink = AgentTaskLink(
            taskID: cancelledTask.id,
            keeplineWorkItemID: "work-partial-2",
            dispatchID: "dispatch-partial-cancel",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [recoveredTask, cancelledTask],
                agentTaskLinks: [recoveredLink, cancelledLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(
            dispatchLookupErrorsByID: ["dispatch-partial-cancel": CancellationError()]
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        do {
            _ = try await coordinator.resumePendingAttempts()
            throw CheckFailure.failed("resumePendingAttempts swallowed CancellationError with partial outcomes")
        } catch let cancelled as StashPendingResumeCancellation {
            try expect(
                cancelled.partial.recoveredTaskIDs == [recoveredTask.id],
                "cancellation discarded the already-recovered task outcome"
            )
            try expect(
                cancelled.partial.notices.isEmpty,
                "partial cancellation unexpectedly included notices"
            )
        } catch is CancellationError {
            throw CheckFailure.failed("cancellation with partial outcomes did not preserve the resume result")
        }
    }

    @MainActor
    private static func checkResumeClearsRecoveredTaskIDs() async throws {
        let pendingTask = LedgerTask(title: "Recovered after transient failure")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-recovered-poll",
            dispatchID: "dispatch-ok",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(outcome.notices.isEmpty, "successful poll produced an unexpected notice")
        try expect(
            outcome.recoveredTaskIDs == [pendingTask.id],
            "successful poll did not expose recovered task IDs for error clearing"
        )
    }

    @MainActor
    private static func checkResumeDoesNotOverwriteManualLinkDuringPoll() async throws {
        let pendingTask = LedgerTask(title: "Manual link during poll")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-race",
            dispatchID: "dispatch-race",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onDispatchLookup: {
            await MainActor.run {
                guard var current = store.agentLink(for: pendingTask.id) else { return }
                current.sessionID = "runtime-session-manual"
                _ = store.persistAgentLink(current)
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-manual",
            "stale awaiting_session poll overwrote a concurrent manual session link"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchState == .awaitingSession,
            "stale poll mutated dispatch state after manual link"
        )
        try expect(
            outcome.recoveredTaskIDs == [pendingTask.id],
            "manual link during poll should count as recovered, not a wipe"
        )
        try expect(outcome.notices.isEmpty, "manual link during poll produced unexpected notices")
    }

    @MainActor
    private static func checkResumeSuppressesLookupFailureAfterManualLink() async throws {
        let pendingTask = LedgerTask(title: "Manual link during failing poll")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-race-fail",
            dispatchID: "dispatch-race-fail",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(
            dispatchLookupError: ForcedDispatchLookupFailure(),
            onDispatchLookup: {
                await MainActor.run {
                    guard var current = store.agentLink(for: pendingTask.id) else { return }
                    current.sessionID = "runtime-session-manual-during-fail"
                    _ = store.persistAgentLink(current)
                }
            }
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            outcome.notices.isEmpty,
            "lookup failure after concurrent manual link published a stale notice"
        )
        try expect(
            outcome.recoveredTaskIDs == [pendingTask.id],
            "manual link during failing poll should count as recovered"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-manual-during-fail",
            "failing poll path mutated the concurrent manual session link"
        )
    }

    @MainActor
    private static func checkResumeDropsBufferedNoticeAfterLaterManualLink() async throws {
        // Catch-path validates link A while still pending and buffers a notice, then a
        // later slow poll awaits. Concurrent manualLink attaches a session to A before
        // publication — the buffered notice must be dropped on revalidation.
        let failedTask = LedgerTask(title: "Buffered resume notice")
        let slowTask = LedgerTask(title: "Later slow poll")
        let failedLink = AgentTaskLink(
            taskID: failedTask.id,
            keeplineWorkItemID: "work-buffered-fail",
            dispatchID: "dispatch-buffered-fail",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let slowLink = AgentTaskLink(
            taskID: slowTask.id,
            keeplineWorkItemID: "work-buffered-slow",
            dispatchID: "dispatch-buffered-slow",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [failedTask, slowTask],
                agentTaskLinks: [failedLink, slowLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        final class LookupCounter: @unchecked Sendable {
            var count = 0
        }
        let lookups = LookupCounter()
        let transport = RecordingTransport(
            dispatchLookupErrorsByID: [
                "dispatch-buffered-fail": ForcedDispatchLookupFailure()
            ],
            onDispatchLookup: {
                lookups.count += 1
                // Second lookup is the slow sibling; attach a session to the
                // already-buffered failure link before the batch returns.
                guard lookups.count >= 2 else { return }
                await MainActor.run {
                    guard var current = store.agentLink(for: failedTask.id),
                          current.id == failedLink.id,
                          current.sessionID == nil else { return }
                    current.sessionID = "runtime-session-after-buffer"
                    _ = store.persistAgentLink(current)
                }
            }
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            outcome.notices.isEmpty,
            "buffered resume notice published after concurrent manual link"
        )
        try expect(
            outcome.recoveredTaskIDs.contains(failedTask.id),
            "session-linked buffered failure was not classified as recovered"
        )
        try expect(
            store.agentLink(for: failedTask.id)?.sessionID == "runtime-session-after-buffer",
            "later poll path mutated the concurrent manual session on the buffered link"
        )

        let stale = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: failedTask.id,
                    linkID: failedLink.id,
                    message: "stale buffered failure",
                    observedDispatchState: failedLink.dispatchState
                )
            ]
        )
        let revalidated = stale.revalidated(against: store.workspace.agentTaskLinks)
        try expect(
            revalidated.notices.isEmpty,
            "revalidated(against:) kept a notice for a session-linked link"
        )
    }

    @MainActor
    private static func checkRevalidatedDropsNoticeSupersededByNewerTaskLink() async throws {
        // Terminal failed/cancelled links stay session-less. After a newer manual
        // link for the same task, revalidation must drop the old notice — the
        // originating link is no longer current, and future resume batches skip
        // the session-linked replacement.
        let task = LedgerTask(title: "Superseded terminal notice")
        let terminalLink = AgentTaskLink(
            id: UUID(),
            taskID: task.id,
            keeplineWorkItemID: "work-terminal-old",
            dispatchID: "dispatch-terminal-old",
            dispatchState: .failed,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched,
            linkedAt: Date(timeIntervalSince1970: 1_000)
        )
        let newerLink = AgentTaskLink(
            id: UUID(),
            taskID: task.id,
            keeplineWorkItemID: "work-manual-new",
            sessionID: "runtime-session-newer",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .manuallyLinked,
            linkedAt: Date(timeIntervalSince1970: 2_000)
        )
        let links = [terminalLink, newerLink]
        let stale = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: terminalLink.id,
                    message: "stale terminal failure for superseded link",
                    observedDispatchState: .failed
                )
            ]
        )
        let revalidated = stale.revalidated(against: links)
        try expect(
            revalidated.notices.isEmpty,
            "revalidated(against:) kept a notice for a superseded terminal link"
        )
        try expect(
            revalidated.recoveredTaskIDs.contains(task.id),
            "superseded terminal notice was not classified as recovered"
        )
        // Originating terminal link still present and session-less must publish
        // when it remains the task's current link.
        let stillCurrent = stale.revalidated(against: [terminalLink])
        try expect(
            stillCurrent.notices.count == 1,
            "revalidated(against:) dropped a still-current terminal notice"
        )
        try expect(
            stillCurrent.recoveredTaskIDs.isEmpty,
            "still-current terminal notice must not be recovered"
        )
    }

    private static func checkRevalidatedKeepsCurrentFailureWhenOlderLinkSuperseded() throws {
        // Imported workspaces may retain two nonterminal links for one task.
        // When both polls fail, dropping the older superseded notice must not
        // recover the shared task ID — that would bump generation and suppress
        // the current link's resume failure on every refresh.
        let task = LedgerTask(title: "Two active links both fail")
        let older = AgentTaskLink(
            id: UUID(),
            taskID: task.id,
            keeplineWorkItemID: "work-older",
            dispatchID: "dispatch-older",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched,
            linkedAt: Date(timeIntervalSince1970: 1_000)
        )
        let current = AgentTaskLink(
            id: UUID(),
            taskID: task.id,
            keeplineWorkItemID: "work-current",
            dispatchID: "dispatch-current",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched,
            linkedAt: Date(timeIntervalSince1970: 2_000)
        )
        let buffered = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: older.id,
                    message: "older link lookup failed",
                    observedDispatchState: .awaitingSession
                ),
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: current.id,
                    message: "current link lookup failed",
                    observedDispatchState: .awaitingSession
                )
            ]
        )
        let revalidated = buffered.revalidated(against: [older, current])
        try expect(
            revalidated.notices.count == 1,
            "revalidated did not keep exactly the current link's failure notice"
        )
        try expect(
            revalidated.notices[0].linkID == current.id,
            "revalidated kept the wrong link's failure notice"
        )
        try expect(
            revalidated.recoveredTaskIDs.isEmpty,
            "superseded older failure recovered the task and would suppress the current notice"
        )
    }

    private static func checkRevalidatedToleratesDuplicateImportedLinkIDs() throws {
        // Corrupt backups may decode two AgentTaskLink rows with the same UUID.
        // revalidated must not trap via Dictionary(uniqueKeysWithValues:).
        let task = LedgerTask(title: "Duplicate imported link IDs")
        let sharedID = UUID()
        let older = AgentTaskLink(
            id: sharedID,
            taskID: task.id,
            keeplineWorkItemID: "work-dup-old",
            dispatchID: "dispatch-dup-old",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched,
            linkedAt: Date(timeIntervalSince1970: 1_000)
        )
        var newer = older
        newer.dispatchState = .failed
        newer.linkedAt = Date(timeIntervalSince1970: 2_000)
        let buffered = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: sharedID,
                    message: "stale awaiting notice",
                    observedDispatchState: .awaitingSession
                )
            ]
        )
        let revalidated = buffered.revalidated(against: [older, newer])
        try expect(
            revalidated.notices.isEmpty,
            "revalidated trapped or kept a stamp-mismatched notice for duplicate link IDs"
        )
        try expect(
            revalidated.recoveredTaskIDs.isEmpty,
            "stamp mismatch on duplicate IDs must not recover the task"
        )
    }

    @MainActor
    private static func checkRevalidatedDropsNoticeSupersededByNewerTerminalPoll() async throws {
        // Overlapping refreshes: an older refresh buffers a transient lookup
        // failure while the link is still awaiting_session. A newer refresh then
        // polls the same link, persists failed/cancelled, and publishes the
        // actionable dispatch error. Revalidation must drop the older notice so
        // it cannot overwrite the terminal message; do not recover (that would
        // clear the newer published error).
        let task = LedgerTask(title: "Superseded by terminal poll")
        let awaiting = AgentTaskLink(
            id: UUID(),
            taskID: task.id,
            keeplineWorkItemID: "work-terminal-race",
            dispatchID: "dispatch-terminal-race",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        var terminal = awaiting
        terminal.dispatchState = .failed
        let stale = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: awaiting.id,
                    message: "forced dispatch lookup failure",
                    observedDispatchState: .awaitingSession
                )
            ]
        )
        let revalidated = stale.revalidated(against: [terminal])
        try expect(
            revalidated.notices.isEmpty,
            "revalidated(against:) kept a transient notice after terminal poll"
        )
        try expect(
            revalidated.recoveredTaskIDs.isEmpty,
            "dispatch-state stamp mismatch must not recover (would clear terminal publish)"
        )
        // Matching stamp for a still-current terminal notice must publish.
        let terminalNotice = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: terminal.id,
                    message: "authentication required",
                    observedDispatchState: .failed
                )
            ]
        )
        let kept = terminalNotice.revalidated(against: [terminal])
        try expect(
            kept.notices.count == 1,
            "revalidated(against:) dropped a stamp-matching terminal notice"
        )
    }

    @MainActor
    private static func checkResumeDropsBufferedNoticeAfterOverlappingTerminalPoll() async throws {
        // Catch-path buffers a transient lookup failure for link A, then awaits
        // sibling B. While B is in flight, an overlapping refresh persists
        // failed/cancelled on A. Final revalidation must drop A's stale notice
        // (state stamp mismatch) without recovering — a newer terminal publish
        // for A must remain.
        let failedTask = LedgerTask(title: "Transient then terminal")
        let slowTask = LedgerTask(title: "Sibling slow poll")
        let failedLink = AgentTaskLink(
            taskID: failedTask.id,
            keeplineWorkItemID: "work-overlap-fail",
            dispatchID: "dispatch-overlap-fail",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let slowLink = AgentTaskLink(
            taskID: slowTask.id,
            keeplineWorkItemID: "work-overlap-slow",
            dispatchID: "dispatch-overlap-slow",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [failedTask, slowTask],
                agentTaskLinks: [failedLink, slowLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        final class LookupCounter: @unchecked Sendable {
            var count = 0
        }
        let lookups = LookupCounter()
        let transport = RecordingTransport(
            dispatchLookupErrorsByID: [
                "dispatch-overlap-fail": ForcedDispatchLookupFailure()
            ],
            onDispatchLookup: {
                lookups.count += 1
                guard lookups.count >= 2 else { return }
                await MainActor.run {
                    guard var current = store.agentLink(for: failedTask.id),
                          current.id == failedLink.id,
                          !current.isTerminal else { return }
                    current.dispatchState = .failed
                    _ = store.persistAgentLink(current)
                }
            }
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            !outcome.notices.contains(where: { $0.taskID == failedTask.id }),
            "buffered transient notice published after overlapping terminal poll"
        )
        try expect(
            !outcome.recoveredTaskIDs.contains(failedTask.id),
            "state-stamp mismatch recovered and would clear a newer terminal publish"
        )
        try expect(
            store.agentLink(for: failedTask.id)?.dispatchState == .failed,
            "overlapping terminal poll did not persist failed on the buffered link"
        )
    }

    @MainActor
    private static func checkResumeRejectsNoticeAfterNewerSuccessfulPollGeneration() async throws {
        // Older refresh buffers a transient lookup failure for an awaiting_session
        // link, then awaits a sibling. A newer overlapping refresh successfully
        // polls the same unchanged link and stamps a recovery generation. Final
        // publication must drop the buffered notice — dispatch-state revalidation
        // alone still matches awaiting_session.
        let failedTask = LedgerTask(title: "Transient then recovered")
        let failedLink = AgentTaskLink(
            taskID: failedTask.id,
            keeplineWorkItemID: "work-gen-fail",
            dispatchID: "dispatch-gen-fail",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let buffered = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: failedTask.id,
                    linkID: failedLink.id,
                    message: "stale lookup failure after newer recovery",
                    observedDispatchState: .awaitingSession
                )
            ]
        )
        // Link state unchanged — stamp revalidation alone would keep the notice.
        let revalidated = buffered.revalidated(against: [failedLink])
        try expect(
            revalidated.notices.count == 1,
            "unchanged awaiting_session stamp should keep the buffered notice before generation gate"
        )
        let observed: [UUID: UInt64] = [:]
        let afterRecovery: [UUID: UInt64] = [failedTask.id: 7]
        let rejected = revalidated.rejectingNoticesSupersededByGeneration(
            observed: observed,
            current: afterRecovery
        )
        try expect(
            rejected.notices.isEmpty,
            "generation gate kept a notice after a newer successful recovery stamp"
        )
        let sameGeneration = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [failedTask.id: 7],
            current: [failedTask.id: 7]
        )
        try expect(
            sameGeneration.notices.count == 1,
            "generation gate dropped a notice whose snapshot still matches"
        )
    }

    @MainActor
    private static func checkResumeKeepsTerminalNoticeDespiteRecoveryGeneration() async throws {
        // Two refreshes observe the same generation. The first successfully polls
        // awaiting_session and stamps a recovery generation; the second later
        // persists failed/cancelled. Generation gating must not drop that terminal
        // notice — terminal links leave future resume batches.
        let task = LedgerTask(title: "Terminal after sibling recovery")
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-terminal-gen",
            dispatchID: "dispatch-terminal-gen",
            dispatchState: .failed,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let terminal = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: link.id,
                    message: "authentication required",
                    observedDispatchState: .failed
                )
            ]
        )
        let revalidated = terminal.revalidated(against: [link])
        try expect(
            revalidated.notices.count == 1,
            "stamp-matching terminal notice should survive revalidation"
        )
        let kept = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [:],
            current: [task.id: 3]
        )
        try expect(
            kept.notices.count == 1,
            "generation gate dropped a terminal notice after a sibling recovery stamp"
        )
        let cancelledLink = AgentTaskLink(
            id: link.id,
            taskID: task.id,
            keeplineWorkItemID: "work-terminal-gen",
            dispatchID: "dispatch-terminal-gen",
            dispatchState: .cancelled,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let cancelledNotice = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: cancelledLink.id,
                    message: "dispatch cancelled",
                    observedDispatchState: .cancelled
                )
            ]
        )
        let cancelledKept = cancelledNotice
            .revalidated(against: [cancelledLink])
            .rejectingNoticesSupersededByGeneration(
                observed: [:],
                current: [task.id: 9]
            )
        try expect(
            cancelledKept.notices.count == 1,
            "generation gate dropped a cancelled terminal notice after recovery stamp"
        )
    }

    @MainActor
    private static func checkResumeKeepsAmbiguousNoticeDespiteRecoveryGeneration() async throws {
        // Two refreshes observe the same generation. The first recovers another
        // link and stamps a recovery generation; the second later persists
        // .ambiguous. Generation gating must not drop that notice — ambiguous
        // links leave future resume batches, same as failed/cancelled.
        let task = LedgerTask(title: "Ambiguous after sibling recovery")
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-ambiguous-gen",
            dispatchID: "dispatch-ambiguous-gen",
            dispatchState: .ambiguous,
            candidateSessionIDs: ["session-a", "session-b"],
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let ambiguous = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: link.id,
                    message: "More than one Agent session matched. Choose the correct session.",
                    observedDispatchState: .ambiguous
                )
            ]
        )
        let revalidated = ambiguous.revalidated(against: [link])
        try expect(
            revalidated.notices.count == 1,
            "stamp-matching ambiguous notice should survive revalidation"
        )
        let kept = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [:],
            current: [task.id: 3]
        )
        try expect(
            kept.notices.count == 1,
            "generation gate dropped an ambiguous notice after a sibling recovery stamp"
        )
        // Foreground publishTaskError after the snapshot must still reject it.
        let afterForeground = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [:],
            current: [task.id: 5],
            foreground: [task.id: 5]
        )
        try expect(
            afterForeground.notices.isEmpty,
            "ambiguous notice overwrote a newer foreground error"
        )
    }

    @MainActor
    private static func checkRevalidatedRecoversWhenOriginatingLinkMissing() async throws {
        // Import removes the pending link while a notice is still buffered. Dropping
        // the notice alone leaves a sticky resume-owned taskErrors entry because the
        // removed link never re-enters a pending-resume batch.
        let task = LedgerTask(title: "Missing originating link")
        let removedLinkID = UUID()
        let buffered = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: removedLinkID,
                    message: "stale resume error after import removed link",
                    observedDispatchState: .awaitingSession
                )
            ]
        )
        let revalidated = buffered.revalidated(against: [])
        try expect(
            revalidated.notices.isEmpty,
            "revalidated kept a notice whose originating link is gone"
        )
        try expect(
            revalidated.recoveredTaskIDs.contains(task.id),
            "missing originating link was not classified as recovered"
        )
    }

    @MainActor
    private static func checkForegroundErrorGenerationRejectsBufferedResumeNotice() async throws {
        // A refresh observes an absent generation, buffers a resume lookup failure,
        // then awaits. Concurrent foreground publishTaskError must advance generation
        // (not nil it) so the buffered notice fails the generation gate and cannot
        // overwrite the actionable manual-link error.
        let task = LedgerTask(title: "Foreground then buffered resume")
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-fg-gen",
            dispatchID: "dispatch-fg-gen",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let buffered = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: link.id,
                    message: "stale resume lookup after foreground error",
                    observedDispatchState: .awaitingSession
                )
            ]
        )
        let revalidated = buffered.revalidated(against: [link])
        // Mirror publishTaskError: drop resume ownership by advancing generation
        // rather than resetting to the absent value the refresh observed.
        let afterForeground: [UUID: UInt64] = [task.id: 1]
        let rejected = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [:],
            current: afterForeground
        )
        try expect(
            rejected.notices.isEmpty,
            "buffered resume notice overwrote foreground error after generation was only cleared"
        )
        // Regression: nilling generation back to absent must not be treated as a fix.
        let clearedToAbsent = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [:],
            current: [:]
        )
        try expect(
            clearedToAbsent.notices.count == 1,
            "absent-generation baseline should still match an un-advanced snapshot"
        )
    }

    @MainActor
    private static func checkForegroundErrorGenerationRejectsBufferedTerminalNotice() async throws {
        // A refresh buffers a terminal failed notice, then awaits another link.
        // Concurrent foreground publishTaskError (retry with invalid directory /
        // failed upsert) advances generation while the old terminal link remains
        // current and stamp-matching. The endsAttempt path must still reject the
        // buffered notice when a foreground stamp is past the observed snapshot;
        // unconditional terminal exemption would overwrite the actionable error.
        let task = LedgerTask(title: "Foreground then buffered terminal")
        let link = AgentTaskLink(
            taskID: task.id,
            keeplineWorkItemID: "work-fg-terminal",
            dispatchID: "dispatch-fg-terminal",
            dispatchState: .failed,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let buffered = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: link.id,
                    message: "stale dispatch.error after foreground retry failure",
                    observedDispatchState: .failed
                )
            ]
        )
        let revalidated = buffered.revalidated(against: [link])
        try expect(
            revalidated.notices.count == 1,
            "stamp-matching terminal notice should survive revalidation"
        )
        // Sibling recovery alone (no foreground stamp) must still keep the notice.
        let afterSiblingRecovery = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [:],
            current: [task.id: 3],
            foreground: [:]
        )
        try expect(
            afterSiblingRecovery.notices.count == 1,
            "terminal notice dropped after sibling recovery without a foreground stamp"
        )
        // Newer terminal outcome after an older foreground error: observed snapshot
        // already includes the foreground stamp, so the generation gate keeps the
        // notice. publishResumeTaskError must then allow terminal replacement of
        // the foreground-owned taskErrors entry (see KeeplineIntegrationStore).
        let afterOlderForeground = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [task.id: 2],
            current: [task.id: 2],
            foreground: [task.id: 2]
        )
        try expect(
            afterOlderForeground.notices.count == 1,
            "newer terminal notice rejected when foreground stamp matched the snapshot"
        )
        // Foreground error stamp past observed snapshot must reject it.
        let afterForeground = revalidated.rejectingNoticesSupersededByGeneration(
            observed: [:],
            current: [task.id: 4],
            foreground: [task.id: 4]
        )
        try expect(
            afterForeground.notices.isEmpty,
            "buffered terminal notice overwrote foreground error despite generation advance"
        )
        let cancelledLink = AgentTaskLink(
            id: link.id,
            taskID: task.id,
            keeplineWorkItemID: "work-fg-terminal",
            dispatchID: "dispatch-fg-terminal",
            dispatchState: .cancelled,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let cancelledBuffered = StashPendingResumeResult(
            notices: [
                StashIntegrationNotice(
                    taskID: task.id,
                    linkID: cancelledLink.id,
                    message: "stale cancelled notice after foreground error",
                    observedDispatchState: .cancelled
                )
            ]
        )
        let cancelledRejected = cancelledBuffered
            .revalidated(against: [cancelledLink])
            .rejectingNoticesSupersededByGeneration(
                observed: [task.id: 1],
                current: [task.id: 8],
                foreground: [task.id: 8]
            )
        try expect(
            cancelledRejected.notices.isEmpty,
            "buffered cancelled terminal notice overwrote foreground error"
        )
    }

    @MainActor
    private static func checkLaunchRetryTerminalFailurePublishesNotice() async throws {
        let pendingTask = LedgerTask(title: "Launch retry returns failed")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-terminal-retry",
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):retry",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(
            launchDispatchState: "failed",
            launchDispatchError: "authentication required for launch retry"
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(outcome.notices.count == 1, "terminal launch retry did not surface a notice")
        try expect(outcome.notices[0].taskID == pendingTask.id, "terminal launch notice targeted the wrong task")
        try expect(outcome.notices[0].linkID == pendingLink.id, "terminal launch notice lost the originating link id")
        try expect(
            outcome.notices[0].message == "authentication required for launch retry",
            "terminal launch retry dropped the dispatch.error guidance"
        )
        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "terminal launch retry must not be classified as recovered"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchState == .failed,
            "terminal launch retry did not persist the failed dispatch state"
        )
    }

    @MainActor
    private static func checkResumePropagatesSaveFailureAfterLinkedPoll() async throws {
        let pendingTask = LedgerTask(title: "Linked poll save failure")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-linked-save",
            dispatchID: "dispatch-linked-save",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        await repository.armNextSaveFailure()
        let transport = RecordingTransport(
            dispatchLookupState: "linked",
            dispatchLookupLinkedSessionID: "runtime-session-linked"
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "save failure after linked poll was misclassified as recovered"
        )
        try expect(outcome.notices.count == 1, "save failure after linked poll did not surface a notice")
        try expect(outcome.notices[0].taskID == pendingTask.id, "save-failure notice targeted the wrong task")
        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == nil,
            "unsaved linked poll left an in-memory session that blocks future resume"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchState == .awaitingSession,
            "unsaved linked poll did not restore the prior pending dispatch snapshot"
        )
    }

    @MainActor
    private static func checkResumeDoesNotRollbackConcurrentManualLinkOnSaveFailure() async throws {
        let pendingTask = LedgerTask(title: "Manual link during save failure")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-concurrent-save",
            dispatchID: "dispatch-concurrent-save",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        await repository.armNextSaveFailure {
            await MainActor.run {
                guard var current = store.agentLink(for: pendingTask.id) else { return }
                current.sessionID = "runtime-session-manual-during-save"
                current.source = .manuallyLinked
                _ = store.persistAgentLink(current)
            }
        }
        let transport = RecordingTransport(
            dispatchLookupState: "linked",
            dispatchLookupLinkedSessionID: "runtime-session-poll-linked"
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-manual-during-save",
            "save-failure rollback erased a concurrent manual session link"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.source == .manuallyLinked,
            "save-failure rollback restored the stale poll snapshot over a concurrent manual link"
        )
        try expect(
            outcome.notices.isEmpty,
            "poll save failure must not sticky-warn after a concurrent manual link"
        )
        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "unsaved poll apply must not count as recovered even when a concurrent manual link wins"
        )
    }

    @MainActor
    private static func checkResumeRollsBackToReloadedWorkItemOnSaveFailure() async throws {
        // Sibling refresh persists a work-item ID while this no-dispatch retry's
        // upsert awaits. On flush failure, rollback must restore that reloaded
        // snapshot — not the original call-site link that lacked a work-item ID.
        let pendingTask = LedgerTask(title: "Rollback to reloaded work item")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):rollback-reloaded",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onUpsert: {
            await MainActor.run {
                guard var current = store.agentLink(for: pendingTask.id),
                      current.id == pendingLink.id,
                      current.keeplineWorkItemID == nil else { return }
                // Same identity the upsert will return — compatible with
                // requireCompatibleWorkItemIdentity; still proves rollback restores
                // the reloaded snapshot rather than the original nil-ID link.
                current.keeplineWorkItemID = "work-1"
                _ = store.persistAgentLink(current)
            }
            await repository.armNextSaveFailure()
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            store.agentLink(for: pendingTask.id)?.keeplineWorkItemID == "work-1",
            "flush-failure rollback erased a sibling-persisted work-item ID"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchID == nil,
            "failed work-item persist unexpectedly advanced to a dispatch ID"
        )
        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "launchDispatch fired after work-item persist failure")
        try expect(
            outcome.notices.contains(where: { $0.taskID == pendingTask.id }),
            "work-item persist failure did not surface a resume notice"
        )
        try expect(
            !outcome.recoveredTaskIDs.contains(pendingTask.id),
            "failed work-item persist was misclassified as recovered"
        )
    }

    @MainActor
    private static func checkResumeRejectsStalePollAfterAmbiguousTransition() async throws {
        // Overlapping refreshes poll the same awaiting_session link. A sibling
        // persists .ambiguous with candidates while this lookup is in flight; the
        // older awaiting_session response must not erase that transition.
        let pendingTask = LedgerTask(title: "Stale poll after ambiguous")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-stale-ambiguous",
            dispatchID: "dispatch-stale-ambiguous",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(
            onDispatchLookup: {
                await MainActor.run {
                    guard var current = store.agentLink(for: pendingTask.id),
                          current.id == pendingLink.id,
                          current.dispatchState == .awaitingSession else { return }
                    current.dispatchState = .ambiguous
                    current.candidateSessionIDs = ["candidate-a", "candidate-b"]
                    _ = store.persistAgentLink(current)
                }
            },
            dispatchLookupState: "awaiting_session"
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchState == .ambiguous,
            "stale awaiting_session poll erased a sibling ambiguous transition"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.candidateSessionIDs == ["candidate-a", "candidate-b"],
            "stale awaiting_session poll cleared sibling ambiguous candidates"
        )
        try expect(
            !outcome.recoveredTaskIDs.contains(pendingTask.id),
            "stale poll over ambiguous was misclassified as recovered"
        )
        try expect(
            outcome.notices.isEmpty,
            "stale poll over ambiguous published a recovery notice"
        )
    }

    @MainActor
    private static func checkResumeRejectsStaleLaunchAfterAmbiguousTransition() async throws {
        // Overlapping refreshes retry the same no-dispatch link. A sibling
        // persists .ambiguous with candidates while this launch is in flight; the
        // older awaiting_session response must not erase that transition.
        let pendingTask = LedgerTask(title: "Stale launch after ambiguous")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-stale-launch-ambiguous",
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):stale-launch-ambiguous",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(
            onLaunchDispatch: {
                await MainActor.run {
                    guard var current = store.agentLink(for: pendingTask.id),
                          current.id == pendingLink.id,
                          current.dispatchState == .pending else { return }
                    current.dispatchID = "dispatch-sibling-ambiguous"
                    current.dispatchState = .ambiguous
                    current.candidateSessionIDs = ["candidate-a", "candidate-b"]
                    _ = store.persistAgentLink(current)
                }
            },
            launchDispatchState: "awaiting_session"
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchState == .ambiguous,
            "stale awaiting_session launch erased a sibling ambiguous transition"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.candidateSessionIDs == ["candidate-a", "candidate-b"],
            "stale awaiting_session launch cleared sibling ambiguous candidates"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchID == "dispatch-sibling-ambiguous",
            "stale launch response replaced the sibling ambiguous dispatch ID"
        )
        try expect(
            !outcome.recoveredTaskIDs.contains(pendingTask.id),
            "stale launch over ambiguous was misclassified as recovered"
        )
        try expect(
            outcome.notices.isEmpty,
            "stale launch over ambiguous published a recovery notice"
        )
    }

    @MainActor
    private static func checkResumeCancelsBeforeLaunchMutation() async throws {
        let pendingTask = LedgerTask(title: "Cancel mid launch retry")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):cancel-mid",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()

        let gate = UpsertCancellationGate()
        let transport = RecordingTransport(onUpsert: {
            await gate.waitUntilCancelled()
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let resumeTask = Task { @MainActor in
            try await coordinator.resumePendingAttempts()
        }
        await gate.waitUntilUpsertStarted()
        resumeTask.cancel()
        await gate.releaseUpsert()

        do {
            _ = try await resumeTask.value
            throw CheckFailure.failed("resumePendingAttempts ignored mid-attempt cancellation")
        } catch is CancellationError {
            // expected
        }

        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "cancelled resume still performed launch-dispatch mutation")
    }

    @MainActor
    private static func checkResumeCancelsAfterFinalLookupReturnsNormally() async throws {
        // Cancellation-unaware dispatch lookup returns after the task is cancelled.
        // Without a post-batch cancellation check, resume would return normally and
        // refresh would continue into syncTaskProjections.
        let recoveredTask = LedgerTask(title: "Classified before final cancel")
        let finalTask = LedgerTask(title: "Final lookup ignores cancel")
        let recoveredLink = AgentTaskLink(
            taskID: recoveredTask.id,
            keeplineWorkItemID: "work-final-cancel-ok",
            dispatchID: "dispatch-final-cancel-ok",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let finalLink = AgentTaskLink(
            taskID: finalTask.id,
            keeplineWorkItemID: "work-final-cancel-last",
            dispatchID: "dispatch-final-cancel-last",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [recoveredTask, finalTask],
                agentTaskLinks: [recoveredLink, finalLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()

        let gate = UpsertCancellationGate()
        final class LookupCounter: @unchecked Sendable {
            var count = 0
        }
        let lookups = LookupCounter()
        let transport = RecordingTransport(
            onDispatchLookup: {
                lookups.count += 1
                // First lookup classifies recovery; cancel on the final lookup and
                // still return a normal linked dispatch payload afterward.
                guard lookups.count >= 2 else { return }
                await gate.waitUntilCancelled()
            },
            dispatchLookupState: "linked",
            dispatchLookupLinkedSessionID: "runtime-session-final-cancel"
        )
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let resumeTask = Task { @MainActor in
            try await coordinator.resumePendingAttempts()
        }
        await gate.waitUntilUpsertStarted()
        resumeTask.cancel()
        await gate.releaseUpsert()

        do {
            _ = try await resumeTask.value
            throw CheckFailure.failed("resumePendingAttempts returned normally after post-lookup cancellation")
        } catch let cancelled as StashPendingResumeCancellation {
            try expect(
                cancelled.partial.recoveredTaskIDs.contains(recoveredTask.id),
                "final-return cancellation discarded the already-recovered task outcome"
            )
        } catch is CancellationError {
            // Empty partial may collapse to CancellationError; still proves we did
            // not return a normal success result after the unaware lookup.
        }
    }

    @MainActor
    private static func checkResumeSkipsLaunchAfterManualLinkDuringUpsert() async throws {
        // manualLink attaches a session while the no-dispatch upsert awaits. The
        // retry must invalidate before launchDispatch so no unsolicited Agent starts.
        let pendingTask = LedgerTask(title: "Manual link during launch upsert")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-during-upsert",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()

        let gate = UpsertCancellationGate()
        let transport = RecordingTransport(onUpsert: {
            await gate.waitUntilCancelled()
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let resumeTask = Task { @MainActor in
            try await coordinator.resumePendingAttempts()
        }
        await gate.waitUntilUpsertStarted()
        guard var current = store.agentLink(for: pendingTask.id) else {
            throw CheckFailure.failed("pending launch link disappeared before manual attach")
        }
        current.sessionID = "runtime-session-manual-during-upsert"
        current.source = .manuallyLinked
        _ = store.persistAgentLink(current)
        await gate.releaseUpsert()

        let outcome = try await resumeTask.value
        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "launchDispatch still fired after concurrent manual link")
        try expect(
            outcome.recoveredTaskIDs.contains(pendingTask.id),
            "manual link during upsert was not treated as recovered"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-manual-during-upsert",
            "launch retry mutated the concurrent manual session link"
        )
    }

    @MainActor
    private static func checkResumeSkipsLaunchAfterManualLinkDuringLaunchFlush() async throws {
        // Preflight already passed, but launchDispatch's require(store)/flush still
        // suspends. manualLink must win during that await without a duplicate Agent.
        let pendingTask = LedgerTask(title: "Manual link during launch flush")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-launch-flush",
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-during-launch-flush",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()

        let gate = UpsertCancellationGate()
        await repository.armNextSaveSuspension {
            await gate.waitUntilCancelled()
        }
        let transport = RecordingTransport()
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let resumeTask = Task { @MainActor in
            try await coordinator.resumePendingAttempts()
        }
        await gate.waitUntilUpsertStarted()
        guard var current = store.agentLink(for: pendingTask.id) else {
            throw CheckFailure.failed("pending launch link disappeared before flush-window attach")
        }
        current.sessionID = "runtime-session-manual-during-launch-flush"
        current.source = .manuallyLinked
        _ = store.persistAgentLink(current)
        await gate.releaseUpsert()

        let outcome = try await resumeTask.value
        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "launchDispatch still fired after manual link during launch flush")
        try expect(
            outcome.recoveredTaskIDs.contains(pendingTask.id),
            "manual link during launch flush was not treated as recovered"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-manual-during-launch-flush",
            "launch retry mutated the concurrent manual session link after flush race"
        )
    }

    @MainActor
    private static func checkResumeSkipsPersistingLinkRemovedDuringImport() async throws {
        // Import replaces the workspace while the no-dispatch upsert awaits. The
        // replacement keeps the task UUID but drops the pending link; resume must
        // not re-add the discarded link or launch an Agent into the imported copy.
        let pendingTask = LedgerTask(title: "Import removes pending link")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):import-removes-link",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onUpsert: {
            await MainActor.run {
                let imported = LedgerWorkspace(
                    tasks: [pendingTask],
                    agentTaskLinks: []
                )
                do {
                    try store.importData(try WorkspaceCodec.encode(imported))
                } catch {
                    assertionFailure("import during upsert fixture failed: \(error)")
                }
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "launchDispatch fired after import removed the pending link")
        try expect(
            store.workspace.agentTaskLinks.isEmpty,
            "resume re-persisted a link discarded by import"
        )
        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "import-removed link was misclassified as recovered"
        )
        try expect(
            outcome.notices.isEmpty,
            "import-removed link should not surface a launch notice"
        )
    }

    @MainActor
    private static func checkManualLinkReservesMissingIdentityAgainstResume() async throws {
        // manualLink awaits missing-identity upsert on a pending dispatched link.
        // Concurrent resume must not persist identity and launchDispatch first.
        let pendingTask = LedgerTask(title: "Manual reserve missing identity")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-reserve",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()

        let gate = UpsertCancellationGate()
        let transport = RecordingTransport(onUpsert: {
            await gate.waitUntilCancelled()
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        let manualTask = Task { @MainActor in
            try await coordinator.manualLink(session, to: pendingTask)
        }
        await gate.waitUntilUpsertStarted()
        let outcome = try await coordinator.resumePendingAttempts()
        await gate.releaseUpsert()
        try await manualTask.value

        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "resume launched while manualLink reserved missing-identity upsert")
        try expect(
            outcome.recoveredTaskIDs.isEmpty && outcome.notices.isEmpty,
            "reserved resume should skip without classifying the link"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-1",
            "manualLink did not attach after reserving missing-identity upsert"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchID == nil,
            "resume still applied a dispatch onto the manual recovery link"
        )
    }

    @MainActor
    private static func checkManualLinkReservesKnownIdentityAgainstResume() async throws {
        // manualLink awaits known-identity upsert/session-link on a pending
        // no-dispatch link. Concurrent resume must not launchDispatch first.
        let pendingTask = LedgerTask(title: "Manual reserve known identity")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-1",
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-reserve-known",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()

        let gate = UpsertCancellationGate()
        let transport = RecordingTransport(onUpsert: {
            await gate.waitUntilCancelled()
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        let manualTask = Task { @MainActor in
            try await coordinator.manualLink(session, to: pendingTask)
        }
        await gate.waitUntilUpsertStarted()
        let outcome = try await coordinator.resumePendingAttempts()
        await gate.releaseUpsert()
        try await manualTask.value

        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "resume launched while manualLink reserved known-identity upsert")
        try expect(
            outcome.recoveredTaskIDs.isEmpty && outcome.notices.isEmpty,
            "reserved known-identity resume should skip without classifying the link"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-1",
            "manualLink did not attach after reserving known-identity upsert"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchID == nil,
            "resume still applied a dispatch onto the known-identity manual recovery link"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.keeplineWorkItemID == "work-1",
            "known-identity manualLink changed the reserved work-item id"
        )
    }

    @MainActor
    private static func checkManualLinkRejectsAmbiguousDuringReservedUpsert() async throws {
        // An in-flight resume poll can flip a reserved known-identity link to
        // .ambiguous while manualLink awaits upsert. requireReserved must reject
        // so we do not persist a session without resolveAmbiguous.
        let pendingTask = LedgerTask(title: "Manual reject ambiguous during upsert")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-1",
            dispatchID: "dispatch-ambiguous-during-manual",
            dispatchState: .awaitingSession,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-reject-ambiguous",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()

        let gate = UpsertCancellationGate()
        let transport = RecordingTransport(onUpsert: {
            await gate.waitUntilCancelled()
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        let manualTask = Task { @MainActor in
            try await coordinator.manualLink(session, to: pendingTask)
        }
        await gate.waitUntilUpsertStarted()
        guard var current = store.agentLink(for: pendingTask.id) else {
            throw CheckFailure.failed("reserved link disappeared before ambiguous promotion")
        }
        current.dispatchState = .ambiguous
        current.candidateSessionIDs = ["candidate-a", "runtime-session-1"]
        _ = store.persistAgentLink(current)
        await gate.releaseUpsert()

        do {
            try await manualTask.value
            throw CheckFailure.failed("manualLink succeeded after reserved link became ambiguous")
        } catch StashKeeplineCoordinatorError.invalidDispatchCandidate {
            // expected — caller should retry via resolveAmbiguous
        }

        let links = await transport.count(.manualSessionLink)
        let resolves = await transport.count(.ambiguousResolution)
        try expect(links == 0, "session link ran after reserved link became ambiguous")
        try expect(resolves == 0, "manualLink resolved ambiguity instead of rejecting for resolveAmbiguous")
        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == nil,
            "manualLink persisted a session onto an ambiguous reserved link"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.dispatchState == .ambiguous,
            "manualLink cleared the ambiguous state discovered during upsert"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.candidateSessionIDs == ["candidate-a", "runtime-session-1"],
            "manualLink cleared ambiguous candidates discovered during upsert"
        )
    }

    @MainActor
    private static func checkResumeSkipsLaunchAfterImportReplacesSameIDAttempt() async throws {
        // Import preserves the link UUID but swaps attempt identity while the
        // no-dispatch upsert awaits. Resume must not launch with the pre-import
        // idempotencyKey/projectRoot against the replacement attempt.
        let pendingTask = LedgerTask(title: "Import replaces same-ID attempt")
        let sharedID = UUID()
        let pendingLink = AgentTaskLink(
            id: sharedID,
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):pre-import",
            projectRoot: "/tmp/pre-import",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onUpsert: {
            await MainActor.run {
                let replacement = AgentTaskLink(
                    id: sharedID,
                    taskID: pendingTask.id,
                    dispatchState: .pending,
                    idempotencyKey: "stash:\(pendingTask.id.uuidString):post-import",
                    projectRoot: "/tmp/post-import",
                    runtimeID: "codex",
                    source: .dispatched
                )
                let imported = LedgerWorkspace(
                    tasks: [pendingTask],
                    agentTaskLinks: [replacement]
                )
                do {
                    try store.importData(try WorkspaceCodec.encode(imported))
                } catch {
                    assertionFailure("import during upsert fixture failed: \(error)")
                }
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "launchDispatch fired after same-ID import replaced the attempt")
        try expect(
            store.agentLink(for: pendingTask.id)?.idempotencyKey
                == "stash:\(pendingTask.id.uuidString):post-import",
            "resume mutated the imported replacement attempt identity"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.keeplineWorkItemID == nil,
            "resume persisted work-item identity onto the imported replacement"
        )
        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "same-ID import replacement was misclassified as recovered"
        )
        try expect(
            outcome.notices.isEmpty,
            "same-ID import replacement should not surface a launch notice"
        )
    }

    @MainActor
    private static func checkManualLinkRejectsImportRemovalDuringMissingIdentityUpsert() async throws {
        // Import removes the reserved pending link while missing-identity upsert
        // awaits. manualLink must not re-add the pre-import snapshot after persist.
        let pendingTask = LedgerTask(title: "Manual import removes reserved link")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-import-remove",
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onUpsert: {
            await MainActor.run {
                let imported = LedgerWorkspace(
                    tasks: [pendingTask],
                    agentTaskLinks: []
                )
                do {
                    try store.importData(try WorkspaceCodec.encode(imported))
                } catch {
                    assertionFailure("import during manual upsert fixture failed: \(error)")
                }
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        do {
            try await coordinator.manualLink(session, to: pendingTask)
            throw CheckFailure.failed("manualLink succeeded after import removed the reserved link")
        } catch StashKeeplineCoordinatorError.linkNotFound {
            // expected
        }

        try expect(
            store.agentLink(for: pendingTask.id) == nil,
            "manualLink re-added a reserved link removed by import"
        )
        let links = await transport.count(.manualSessionLink)
        try expect(links == 0, "session link ran after reserved link disappeared during upsert")
    }

    @MainActor
    private static func checkManualLinkRejectsSameIDImportDuringMissingIdentitySessionLink() async throws {
        // Import keeps the reserved UUID but swaps attempt identity while the
        // session-link await runs. Persist must not overwrite the replacement.
        let pendingTask = LedgerTask(title: "Manual import replaces during session link")
        let sharedID = UUID()
        let pendingLink = AgentTaskLink(
            id: sharedID,
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):pre-import-manual",
            projectRoot: "/tmp/pre-import",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onLinkSession: {
            await MainActor.run {
                let replacement = AgentTaskLink(
                    id: sharedID,
                    taskID: pendingTask.id,
                    dispatchState: .pending,
                    idempotencyKey: "stash:\(pendingTask.id.uuidString):post-import-manual",
                    projectRoot: "/tmp/post-import",
                    runtimeID: "codex",
                    source: .dispatched
                )
                let imported = LedgerWorkspace(
                    tasks: [pendingTask],
                    agentTaskLinks: [replacement]
                )
                do {
                    try store.importData(try WorkspaceCodec.encode(imported))
                } catch {
                    assertionFailure("import during manual session-link fixture failed: \(error)")
                }
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        do {
            try await coordinator.manualLink(session, to: pendingTask)
            throw CheckFailure.failed("manualLink succeeded after same-ID import replaced the attempt")
        } catch StashKeeplineCoordinatorError.linkNotFound {
            // expected
        }

        let current = store.agentLink(for: pendingTask.id)
        try expect(
            current?.idempotencyKey == "stash:\(pendingTask.id.uuidString):post-import-manual",
            "manualLink overwrote the imported same-ID replacement attempt"
        )
        try expect(
            current?.sessionID == nil,
            "manualLink attached a session onto the imported replacement attempt"
        )
        try expect(
            current?.keeplineWorkItemID == nil,
            "manualLink persisted work-item identity onto the imported replacement"
        )
        let links = await transport.count(.manualSessionLink)
        try expect(links == 1, "session link should still have been issued before revalidation")
    }

    @MainActor
    private static func checkManualLinkRejectsImportedWorkItemIdentityDuringMissingIdentitySessionLink() async throws {
        // Import keeps the reserved UUID and launch-attempt fields while filling in
        // a newer keeplineWorkItemID during session-link. Persist must not overwrite
        // that imported identity with the earlier upsert result.
        let pendingTask = LedgerTask(title: "Manual import supplies newer work-item id")
        let sharedID = UUID()
        let pendingLink = AgentTaskLink(
            id: sharedID,
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-import-work-item",
            projectRoot: "/tmp/shared-root",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onLinkSession: {
            await MainActor.run {
                let replacement = AgentTaskLink(
                    id: sharedID,
                    taskID: pendingTask.id,
                    keeplineWorkItemID: "work-imported-newer",
                    dispatchState: .pending,
                    idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-import-work-item",
                    projectRoot: "/tmp/shared-root",
                    runtimeID: "codex",
                    source: .dispatched
                )
                let imported = LedgerWorkspace(
                    tasks: [pendingTask],
                    agentTaskLinks: [replacement]
                )
                do {
                    try store.importData(try WorkspaceCodec.encode(imported))
                } catch {
                    assertionFailure("import during manual session-link fixture failed: \(error)")
                }
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        do {
            try await coordinator.manualLink(session, to: pendingTask)
            throw CheckFailure.failed(
                "manualLink succeeded after import supplied a newer work-item identity"
            )
        } catch StashKeeplineCoordinatorError.workItemIdentityChanged {
            // expected
        }

        let current = store.agentLink(for: pendingTask.id)
        try expect(
            current?.keeplineWorkItemID == "work-imported-newer",
            "manualLink overwrote the imported newer work-item identity"
        )
        try expect(
            current?.sessionID == nil,
            "manualLink attached a session after imported work-item identity diverged"
        )
        let links = await transport.count(.manualSessionLink)
        try expect(links == 1, "session link should still have been issued before revalidation")
    }

    @MainActor
    private static func checkManualLinkRejectsImportedWorkItemIdentityDuringKnownIdentityUpsert() async throws {
        // Import preserves the reserved known-identity launch attempt while swapping
        // keeplineWorkItemID during upsert. Reject before linkSession so the old
        // upsert identity is not applied remotely (mirror missing-identity guard).
        let pendingTask = LedgerTask(title: "Manual known-identity import swaps work-item id")
        let sharedID = UUID()
        let pendingLink = AgentTaskLink(
            id: sharedID,
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-1",
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-known-import-work-item",
            projectRoot: "/tmp/shared-root",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onUpsert: {
            await MainActor.run {
                let replacement = AgentTaskLink(
                    id: sharedID,
                    taskID: pendingTask.id,
                    keeplineWorkItemID: "work-imported-newer",
                    dispatchState: .pending,
                    idempotencyKey: "stash:\(pendingTask.id.uuidString):manual-known-import-work-item",
                    projectRoot: "/tmp/shared-root",
                    runtimeID: "codex",
                    source: .dispatched
                )
                let imported = LedgerWorkspace(
                    tasks: [pendingTask],
                    agentTaskLinks: [replacement]
                )
                do {
                    try store.importData(try WorkspaceCodec.encode(imported))
                } catch {
                    assertionFailure("import during known-identity upsert fixture failed: \(error)")
                }
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        do {
            try await coordinator.manualLink(session, to: pendingTask)
            throw CheckFailure.failed(
                "manualLink succeeded after known-identity import swapped work-item identity"
            )
        } catch StashKeeplineCoordinatorError.workItemIdentityChanged {
            // expected
        }

        let current = store.agentLink(for: pendingTask.id)
        try expect(
            current?.keeplineWorkItemID == "work-imported-newer",
            "manualLink overwrote the imported newer work-item identity on known-identity path"
        )
        try expect(
            current?.sessionID == nil,
            "manualLink attached a session after known-identity import swapped work-item identity"
        )
        let links = await transport.count(.manualSessionLink)
        try expect(
            links == 0,
            "session link must not run after known-identity import swapped work-item identity"
        )
    }

    @MainActor
    private static func checkResumePreservesImportedWorkItemIdentityDuringMissingIdentityUpsert() async throws {
        // Import preserves launch-attempt fields while filling in a newer
        // keeplineWorkItemID during missing-identity upsert. Resume must not
        // overwrite that imported identity before launch.
        let pendingTask = LedgerTask(title: "Resume preserves imported work-item id")
        let sharedID = UUID()
        let pendingLink = AgentTaskLink(
            id: sharedID,
            taskID: pendingTask.id,
            dispatchState: .pending,
            idempotencyKey: "stash:\(pendingTask.id.uuidString):resume-import-work-item",
            projectRoot: "/tmp/shared-root",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onUpsert: {
            await MainActor.run {
                let replacement = AgentTaskLink(
                    id: sharedID,
                    taskID: pendingTask.id,
                    keeplineWorkItemID: "work-imported-newer",
                    dispatchState: .pending,
                    idempotencyKey: "stash:\(pendingTask.id.uuidString):resume-import-work-item",
                    projectRoot: "/tmp/shared-root",
                    runtimeID: "codex",
                    source: .dispatched
                )
                let imported = LedgerWorkspace(
                    tasks: [pendingTask],
                    agentTaskLinks: [replacement]
                )
                do {
                    try store.importData(try WorkspaceCodec.encode(imported))
                } catch {
                    assertionFailure("import during resume upsert fixture failed: \(error)")
                }
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)

        let outcome = try await coordinator.resumePendingAttempts()

        let launches = await transport.count(.launchDispatch)
        try expect(launches == 0, "launchDispatch fired after imported work-item identity diverged")
        try expect(
            store.agentLink(for: pendingTask.id)?.keeplineWorkItemID == "work-imported-newer",
            "resume overwrote the imported newer work-item identity"
        )
        try expect(
            outcome.recoveredTaskIDs.isEmpty,
            "imported work-item identity divergence was misclassified as recovered"
        )
        try expect(
            outcome.notices.isEmpty,
            "imported work-item identity divergence should not surface a launch notice"
        )
    }

    @MainActor
    private static func checkManualLinkAcceptsConcurrentPollAttachedRequestedSession() async throws {
        // Existing-dispatch poll attaches the requested session while known-identity
        // manualLink awaits session-link. requireReserved must treat that completed
        // recovery as success instead of sticky linkNotFound.
        let pendingTask = LedgerTask(title: "Manual accepts concurrent poll session")
        let pendingLink = AgentTaskLink(
            taskID: pendingTask.id,
            keeplineWorkItemID: "work-1",
            dispatchID: "dispatch-poll-attach",
            dispatchState: .awaitingSession,
            projectRoot: "/tmp",
            runtimeID: "codex",
            source: .dispatched
        )
        let repository = FailAtSaveRepository(
            workspace: LedgerWorkspace(
                tasks: [pendingTask],
                agentTaskLinks: [pendingLink]
            ),
            failingSaveAttempt: 99
        )
        let store = LedgerStore(repository: repository, initialWorkspace: LedgerWorkspace())
        await store.bootstrap()
        let transport = RecordingTransport(onLinkSession: {
            await MainActor.run {
                guard var current = store.agentLink(for: pendingTask.id) else { return }
                current.sessionID = "runtime-session-1"
                _ = store.persistAgentLink(current)
            }
        })
        let coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        let session = try sessionFixture()

        try await coordinator.manualLink(session, to: pendingTask)

        try expect(
            store.agentLink(for: pendingTask.id)?.sessionID == "runtime-session-1",
            "manualLink lost the concurrently attached requested session"
        )
        try expect(
            store.agentLink(for: pendingTask.id)?.keeplineWorkItemID == "work-1",
            "manualLink changed work-item identity after concurrent poll attach"
        )
        let links = await transport.count(.manualSessionLink)
        try expect(links == 1, "manualLink skipped session link before concurrent poll attach")
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
      "completionEvidenceId":"evidence-1","completionEvidenceWorkItemId":"work-1",
      "completionEvidenceSource":"agent_completion_claim","processRunning":true
    }
    """)
}

private func scannedSessionFixture(sessionID: String, directory: String) throws -> KeeplineSession {
    try fixture("""
    {
      "id":"claude-code:\(sessionID)","sessionId":"\(sessionID)","runtimeId":"claude-code",
      "title":"Verify packaged Stash completion flow","directory":"\(directory)","status":"lost",
      "lastActiveAt":"2026-08-30T00:00:00Z","evidenceSummary":null,
      "completionEvidenceId":null,"processRunning":false
    }
    """)
}

private func recoveryPreviewFixture(sessionID: String) throws -> KeeplineRecoveryPreview {
    try fixture("""
    {
      "sessionId":"\(sessionID)","runtimeId":"codex","method":"resume",
      "executable":"codex","arguments":["resume","\(sessionID)"],
      "directory":"/tmp/project","createsNewSession":false,
      "confirmationId":"\(String(repeating: "a", count: 64))"
    }
    """)
}

private func attentionSessionFixture(
    id: String,
    status: String,
    evidenceID: String? = nil
) throws -> KeeplineSession {
    let evidence = evidenceID.map { "\"\($0)\"" } ?? "null"
    return try fixture("""
    {
      "id":"row-\(id)","sessionId":"\(id)","runtimeId":"codex",
      "title":"Attention fixture","directory":"/tmp","status":"\(status)",
      "lastActiveAt":"2026-08-30T00:00:00Z","evidenceSummary":null,
      "completionEvidenceId":\(evidence),"processRunning":true
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
    linkedSessionID: String? = nil,
    error: String? = nil
) throws -> KeeplineDispatch {
    let linkedSession = linkedSessionID.map { "\"\($0)\"" } ?? "null"
    let errorJSON = error.map { "\"\($0.replacingOccurrences(of: "\"", with: "\\\""))\"" } ?? "null"
    return try fixture("""
    {
      "id":"\(id)","workItemId":"\(workItemID)","runtimeId":"\(runtimeID)",
      "cwd":"\(cwd)","state":"\(state)","candidateSessionIds":[],
      "linkedAgentSessionId":null,"linkedSessionId":\(linkedSession),"error":\(errorJSON),
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
