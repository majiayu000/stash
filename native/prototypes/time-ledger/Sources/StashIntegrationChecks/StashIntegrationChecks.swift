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
    private let completionReviewEvidenceID: String?

    init(completionReviewEvidenceID: String? = nil) {
        self.completionReviewEvidenceID = completionReviewEvidenceID
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
        try await checkLaunchUpsertGate()
        try await checkLaunchDispatchGate()
        try await checkManualLinkGates()
        try await checkAmbiguousResolutionGate()
        try await checkCompletionReviewGate()
        try await checkCompletionReviewResponseIdentity()
        try await checkProjectionSyncGate()
        try await checkIdempotentRestartRecovery()
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
            .appendingPathComponent("-tmp-stash-keepline-e2e", isDirectory: true)
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
        let agentProcess = try launchSyntheticClaude(at: root, cwd: project)
        defer { stopProcess(agentProcess) }
        try expect(agentProcess.isRunning, "synthetic Claude process exited during launch")
        try expect(agentProcess.currentDirectoryURL?.standardizedFileURL == project.standardizedFileURL,
                   "synthetic Claude was not configured with the transcript cwd")

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
        try await waitForServiceScan(baseURL: baseURL)
        let recognizedSession = try await waitForValue("recognized active Claude session") {
            try? await client.listSessions().first {
                $0.sessionID == sessionID && $0.status != .completed && $0.status != .lost
            }
        }
        try expect(recognizedSession.directory == project.path, "scanner returned the wrong cwd")
        try expect(
            recognizedSession.title == "Verify packaged Stash completion flow",
            "scanner returned the wrong task title"
        )

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
        try await coordinator.manualLink(recognizedSession, to: task)
        guard let link = store.agentLink(for: task.id) else {
            throw CheckFailure.failed("Stash did not persist the live session link")
        }
        guard let workItemID = link.keeplineWorkItemID else {
            throw CheckFailure.failed("Stash did not persist the Keepline work item ID")
        }

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

    private static func launchSyntheticClaude(at root: URL, cwd: URL) throws -> Process {
        let executable = root.appendingPathComponent("claude")
        try FileManager.default.copyItem(
            at: URL(fileURLWithPath: "/bin/sleep"),
            to: executable
        )
        try runProcess("/usr/bin/codesign", ["--remove-signature", executable.path])
        try runProcess("/usr/bin/codesign", ["--force", "--sign", "-", executable.path])
        let process = Process()
        process.executableURL = executable
        process.arguments = ["30"]
        process.currentDirectoryURL = cwd
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.standardError
        try process.run()
        return process
    }

    private static func runProcess(_ executable: String, _ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.standardError
        try process.run()
        process.waitUntilExit()
        try expect(process.terminationStatus == 0, "failed to prepare synthetic Agent process")
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
