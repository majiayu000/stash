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

    init(workspace: LedgerWorkspace, failingSaveAttempt: Int) {
        self.workspace = workspace
        self.failingSaveAttempt = failingSaveAttempt
    }

    func armNextSaveFailure(onFailingSave: (@Sendable () async -> Void)? = nil) {
        failNextSave = true
        self.onFailingSave = onFailingSave
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
        try await checkResumeGatesLaunchRetriesPerRuntimeCapability()
        try await checkResumePropagatesCancellation()
        try await checkResumePreservesPartialOutcomesOnCancellation()
        try await checkResumeClearsRecoveredTaskIDs()
        try await checkResumeDoesNotOverwriteManualLinkDuringPoll()
        try await checkResumeSuppressesLookupFailureAfterManualLink()
        try await checkLaunchRetryTerminalFailurePublishesNotice()
        try await checkResumePropagatesSaveFailureAfterLinkedPoll()
        try await checkResumeDoesNotRollbackConcurrentManualLinkOnSaveFailure()
        try await checkResumeCancelsBeforeLaunchMutation()
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
