import Foundation
import KeeplineKit
import StashCore
import StashKeeplineIntegration

enum KeeplineConnectionState: Equatable {
    case idle
    case connecting
    case ready(Date)
    case stale(lastUpdated: Date, message: String)
    case offline
    case incompatible(String)
    case failedToStart(String)
    case failed(String)
}

enum TaskAgentState: Equatable {
    case unlinked
    case launching
    case working
    case waiting
    case finished
    case lost
    case offline
    case ambiguous
    case failed
    case other(String)
}

private struct KeeplineIntegrationConfiguration {
    let transport: any KeeplineTransport
    let serviceController: KeeplineServiceController

    @MainActor
    static func live() throws -> KeeplineIntegrationConfiguration {
        let values = try integrationValues()
        let rawBaseURL = ProcessInfo.processInfo.environment["STASH_KEEPLINE_BASE_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty ?? values["BaseURL"]
        guard let rawBaseURL, let baseURL = URL(string: rawBaseURL) else {
            throw KeeplineError.invalidBaseURL
        }

        let clientConfiguration = try KeeplineClientConfiguration(
            baseURL: baseURL,
            requestTimeout: 2
        )
        let rawExecutable = ProcessInfo.processInfo.environment["STASH_KEEPLINE_EXECUTABLE"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty ?? values["ExecutablePath"]
        let executableURL: URL?
        if let rawExecutable = rawExecutable?.nonEmpty {
            executableURL = URL(fileURLWithPath: rawExecutable).standardizedFileURL
        } else if let bundledName = values["BundledExecutableName"]?.nonEmpty {
            executableURL = [Bundle.main, Bundle.module]
                .compactMap { $0.url(forResource: bundledName, withExtension: nil) }
                .first
        } else {
            executableURL = nil
        }

        return KeeplineIntegrationConfiguration(
            transport: OfficialKeeplineTransport(
                client: KeeplineClient(configuration: clientConfiguration)
            ),
            serviceController: KeeplineServiceController(
                executableURL: executableURL,
                port: baseURL.port
            )
        )
    }

    private static func integrationValues() throws -> [String: String] {
        for bundle in [Bundle.main, Bundle.module] {
            guard let url = bundle.url(forResource: "KeeplineIntegration", withExtension: "plist") else {
                continue
            }
            let data = try Data(contentsOf: url)
            let plist = try PropertyListSerialization.propertyList(from: data, format: nil)
            guard let values = plist as? [String: String] else {
                throw IntegrationConfigurationError.invalidResource
            }
            return values
        }
        return [:]
    }
}

@MainActor
final class KeeplineIntegrationStore: ObservableObject {
    @Published private(set) var sessions: [KeeplineSession] = []
    @Published private(set) var state: KeeplineConnectionState = .idle
    @Published private(set) var metadata: KeeplineMetadata?
    @Published private(set) var busyTaskIDs: Set<UUID> = []
    @Published private(set) var taskErrors: [UUID: String] = [:]

    private let transport: (any KeeplineTransport)?
    private let serviceController: KeeplineServiceController?
    private let configurationError: String?
    private weak var ledgerStore: LedgerStore?
    private var coordinator: StashKeeplineCoordinator?
    private var refreshTask: Task<Void, Never>?
    private var failureCount = 0
    private var didAttemptServiceLaunch = false
    private var sceneIsActive = true
    private var lastSuccessfulRefreshAt: Date?

    init(
        transport: (any KeeplineTransport)?,
        serviceController: KeeplineServiceController?,
        configurationError: String? = nil
    ) {
        self.transport = transport
        self.serviceController = serviceController
        self.configurationError = configurationError
    }

    static func live() -> KeeplineIntegrationStore {
        do {
            let configuration = try KeeplineIntegrationConfiguration.live()
            return KeeplineIntegrationStore(
                transport: configuration.transport,
                serviceController: configuration.serviceController
            )
        } catch {
            return KeeplineIntegrationStore(
                transport: nil,
                serviceController: nil,
                configurationError: error.localizedDescription
            )
        }
    }

    func start(afterFirstFrameWith store: LedgerStore) {
        ledgerStore = store
        guard let transport else {
            publishState(.failed(configurationError ?? "Keepline integration is not configured."))
            return
        }
        coordinator = StashKeeplineCoordinator(store: store, transport: transport)
        guard refreshTask == nil else { return }
        refreshTask = Task { [weak self] in
            await Task.yield()
            try? await Task.sleep(for: .milliseconds(120))
            guard let self else { return }
            await self.refreshLoop()
        }
    }

    func setSceneActive(_ isActive: Bool) {
        sceneIsActive = isActive
        if isActive {
            startRefreshLoopIfNeeded()
        } else {
            refreshTask?.cancel()
            refreshTask = nil
        }
    }

    func shutdown() {
        refreshTask?.cancel()
        refreshTask = nil
        serviceController?.stopOwnedChild()
    }

    func refreshNow() async {
        await refresh(allowServiceLaunch: true)
    }

    func session(for link: AgentTaskLink) -> KeeplineSession? {
        guard let sessionID = link.sessionID else { return nil }
        return sessions.first { $0.id == sessionID || $0.sessionID == sessionID }
    }

    func taskAgentState(for link: AgentTaskLink?) -> TaskAgentState {
        guard let link else { return .unlinked }
        guard isLive else { return .offline }
        if link.dispatchState == .ambiguous { return .ambiguous }
        if link.dispatchState?.endsAttempt == true { return .failed }
        guard let session = session(for: link) else {
            return link.dispatchID == nil ? .lost : .launching
        }
        switch session.status.rawValue {
        case "running": return .working
        case "waiting": return .waiting
        case "completed": return .finished
        case "lost": return .lost
        case "idle": return .other("Idle")
        default: return .other(session.status.rawValue.capitalized)
        }
    }

    func clearError(for taskID: UUID) {
        taskErrors[taskID] = nil
    }

    func link(_ session: KeeplineSession, to task: LedgerTask) async {
        guard let coordinator else { return }
        await performTaskOperation(task.id) {
            try await coordinator.manualLink(session, to: task)
            await self.refresh(allowServiceLaunch: false)
        }
    }

    func launch(
        runtimeID: KeeplineRuntimeID,
        directory: URL,
        task: LedgerTask
    ) async {
        guard let coordinator else { return }
        await performTaskOperation(task.id) {
            try await coordinator.launch(runtimeID: runtimeID, directory: directory, task: task)
            await self.refresh(allowServiceLaunch: false)
        }
    }

    func resolveAmbiguous(
        link: AgentTaskLink,
        with session: KeeplineSession,
        task: LedgerTask
    ) async {
        guard let coordinator else { return }
        await performTaskOperation(task.id) {
            try await coordinator.resolveAmbiguous(link: link, with: session, task: task)
            await self.refresh(allowServiceLaunch: false)
        }
    }

    func reviewCompletion(
        link: AgentTaskLink,
        task: LedgerTask,
        accepted: Bool
    ) async {
        guard let coordinator, let session = session(for: link) else { return }
        await performTaskOperation(task.id) {
            try await coordinator.reviewCompletion(
                link: link,
                session: session,
                task: task,
                accepted: accepted
            )
        }
    }

    private var isLive: Bool {
        if case .ready = state { return true }
        return false
    }

    private func startRefreshLoopIfNeeded() {
        guard sceneIsActive, refreshTask == nil, let ledgerStore else { return }
        start(afterFirstFrameWith: ledgerStore)
    }

    private func refreshLoop() async {
        while !Task.isCancelled, sceneIsActive {
            await refresh(allowServiceLaunch: true)
            let delay = failureCount == 0 ? 2.0 : min(30.0, pow(2.0, Double(failureCount)))
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
        }
    }

    private func refresh(allowServiceLaunch: Bool) async {
        guard let transport, let coordinator else {
            publishState(.failed(configurationError ?? "Keepline integration is not configured."))
            return
        }
        if lastSuccessfulRefreshAt == nil { publishState(.connecting) }

        do {
            let nextMetadata = try await transport.metadata()
            guard nextMetadata.apiVersion.hasPrefix("1."), nextMetadata.mode == "service" else {
                publishState(.incompatible(
                    "Keepline Local API \(nextMetadata.apiVersion) in \(nextMetadata.mode) mode is not compatible."
                ))
                failureCount += 1
                return
            }
            let required = Set([
                "sessions.list",
                "work-items.external-upsert",
                "work-items.session-link",
                "work-items.completion-review"
            ])
            let missing = required.subtracting(nextMetadata.capabilities)
            guard missing.isEmpty else {
                publishState(.incompatible("Keepline is missing: \(missing.sorted().joined(separator: ", "))."))
                failureCount += 1
                return
            }

            let nextSessions = try await transport.listSessions().sorted(by: Self.sessionComesFirst)
            let notices = try await coordinator.resumePendingAttempts()
            for notice in notices {
                publishTaskError(notice.message, for: notice.taskID)
            }
            try await coordinator.syncTaskProjections()
            if metadata != nextMetadata { metadata = nextMetadata }
            if sessions != nextSessions { sessions = nextSessions }
            failureCount = 0
            let refreshedAt = Date.now
            lastSuccessfulRefreshAt = refreshedAt
            if case .ready = state {
                // Keep the published state stable while refreshing identical values.
            } else {
                publishState(.ready(refreshedAt))
            }
        } catch {
            if didAttemptServiceLaunch, serviceController?.ownsRunningChild != true {
                didAttemptServiceLaunch = false
            }
            if allowServiceLaunch, !didAttemptServiceLaunch, shouldLaunchService(for: error) {
                didAttemptServiceLaunch = true
                do {
                    if try serviceController?.startIfConfigured() == true {
                        for _ in 0..<6 {
                            try? await Task.sleep(for: .milliseconds(250))
                            if await probe(transport) {
                                await refresh(allowServiceLaunch: false)
                                return
                            }
                        }
                        let detail = serviceController?.failureSummary
                            ?? "Keepline Service did not become ready in time."
                        publishState(.failedToStart(detail))
                        failureCount += 1
                        return
                    }
                } catch {
                    publishState(.failedToStart(error.localizedDescription))
                    failureCount += 1
                    return
                }
            }

            failureCount += 1
            if let lastUpdated = lastSuccessfulRefreshAt {
                publishState(.stale(lastUpdated: lastUpdated, message: error.localizedDescription))
            } else {
                publishState(connectionFailureState(for: error))
            }
        }
    }

    private func probe(_ transport: any KeeplineTransport) async -> Bool {
        do {
            let value = try await transport.metadata()
            return value.apiVersion.hasPrefix("1.") && value.mode == "service"
        } catch {
            return false
        }
    }

    private func performTaskOperation(
        _ taskID: UUID,
        operation: () async throws -> Void
    ) async {
        guard !busyTaskIDs.contains(taskID) else { return }
        busyTaskIDs.insert(taskID)
        taskErrors[taskID] = nil
        defer { busyTaskIDs.remove(taskID) }
        do {
            try await operation()
        } catch {
            publishTaskError(error.localizedDescription, for: taskID)
        }
    }


    private static func sessionComesFirst(_ lhs: KeeplineSession, _ rhs: KeeplineSession) -> Bool {
        let priorities = ["waiting": 0, "running": 1, "idle": 2, "lost": 3, "completed": 4]
        let left = priorities[lhs.status.rawValue, default: 5]
        let right = priorities[rhs.status.rawValue, default: 5]
        if left != right { return left < right }
        return lhs.lastActiveAt > rhs.lastActiveAt
    }

    private func shouldLaunchService(for error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        return urlError.code == .cannotConnectToHost || urlError.code == .cannotFindHost
    }

    private func connectionFailureState(for error: Error) -> KeeplineConnectionState {
        if shouldLaunchService(for: error) { return .offline }
        if case let KeeplineError.service(status, message) = error {
            if status == 404 {
                return .incompatible("Keepline does not provide Local API v1 Service Mode.")
            }
            return .failed(message)
        }
        if case KeeplineError.unauthorized = error {
            return .failed("Keepline local authentication failed.")
        }
        if case KeeplineError.invalidResponse = error {
            return .incompatible("Keepline returned an invalid Local API response.")
        }
        return .failed(error.localizedDescription)
    }

    private func publishState(_ next: KeeplineConnectionState) {
        if state != next { state = next }
    }

    private func publishTaskError(_ message: String, for taskID: UUID) {
        if taskErrors[taskID] != message { taskErrors[taskID] = message }
    }
}

private enum IntegrationConfigurationError: LocalizedError {
    case invalidResource

    var errorDescription: String? {
        "KeeplineIntegration.plist is malformed."
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
