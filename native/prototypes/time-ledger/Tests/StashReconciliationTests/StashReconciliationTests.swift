import Foundation
import XCTest
import KeeplineKit
import StashCore
import StashKeeplineIntegration
@testable import StashTimeLedger

@MainActor
final class StashReconciliationTests: XCTestCase {
    func testProjectionFailureRetainsTaskIdentityAndUnderlyingError() async throws {
        for failure in [ProjectionFailure.transport, .identity] {
            let task = LedgerTask(title: "Projection error contract")
            let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                     sessionID: "linked-session", runtimeID: "codex", source: .manuallyLinked)
            let (store, transport, ledger) = try await makeStore(tasks: [task], links: [link])
            defer { store.shutdown() }
            await transport.failProjection(taskID: task.id, with: failure)
            let coordinator = StashKeeplineCoordinator(store: ledger, transport: transport)

            do {
                try await coordinator.syncTaskProjections()
                XCTFail("A failed projection returned success")
            } catch let error as StashTaskProjectionError {
                XCTAssertEqual(error.taskID, task.id)
                XCTAssertEqual(error.localizedDescription, failure.message)
                switch failure {
                case .transport: XCTAssertEqual(error.underlyingError as? FixtureError, .projection)
                case .identity:
                    XCTAssertEqual(error.underlyingError as? StashKeeplineCoordinatorError, .workItemIdentityChanged)
                }
            }
        }
    }

    func testProjectionFailureIsIsolatedAndClearsAfterRetry() async throws {
        for state in [AgentDispatchState.failed, .cancelled] {
            for failure in [ProjectionFailure.transport, .identity] {
                let failedTask = LedgerTask(title: "Failed projection")
                let otherTask = LedgerTask(title: "Unrelated finished attempt")
                let links = [
                    AgentTaskLink(taskID: failedTask.id,
                                  keeplineWorkItemID: "work-\(failedTask.id)",
                                  dispatchState: state, runtimeID: "codex", source: .dispatched),
                    AgentTaskLink(taskID: otherTask.id,
                                  dispatchState: state, runtimeID: "codex", source: .dispatched)
                ]
                let (store, transport, _) = try await makeStore(tasks: [failedTask, otherTask], links: links)
                defer { store.shutdown() }
                _ = await store.recoveryPreview(sessionID: "unrelated", taskID: otherTask.id)
                let otherError = store.taskErrors[otherTask.id]
                XCTAssertEqual(otherError, FixtureError.unrelated.localizedDescription)
                await transport.failProjection(taskID: failedTask.id, with: failure)

                await store.refreshNow()

                XCTAssertEqual(store.taskErrors[failedTask.id], failure.message)
                XCTAssertEqual(store.taskErrors[otherTask.id], otherError,
                               "A projection failure replaced another task's operation error")
                assertReady(store)
                await transport.failProjection(taskID: nil, with: failure)

                await store.refreshNow()

                XCTAssertNil(store.taskErrors[failedTask.id],
                             "A successful retry left a reconciliation error on a finished attempt")
                XCTAssertEqual(store.taskErrors[otherTask.id], otherError)
                assertReady(store)
            }
        }
    }

    func testResumeNoticeSurvivesAnotherTaskProjectionFailure() async throws {
        let pendingTask = LedgerTask(title: "Unavailable dispatch")
        let projectedTask = LedgerTask(title: "Failed projection")
        let links = [
            AgentTaskLink(taskID: pendingTask.id, dispatchID: "unavailable",
                          runtimeID: "codex", source: .dispatched),
            AgentTaskLink(taskID: projectedTask.id,
                          keeplineWorkItemID: "work-\(projectedTask.id)",
                          sessionID: "linked-session", runtimeID: "codex", source: .manuallyLinked)
        ]
        let (store, transport, _) = try await makeStore(tasks: [pendingTask, projectedTask], links: links)
        defer { store.shutdown() }
        await transport.failProjection(taskID: projectedTask.id, with: .transport)

        await store.refreshNow()

        XCTAssertEqual(store.taskErrors[pendingTask.id], FixtureError.resume.localizedDescription)
        XCTAssertEqual(store.taskErrors[projectedTask.id], ProjectionFailure.transport.message)
        assertReady(store)
        await transport.failProjection(taskID: nil, with: .transport)

        await store.refreshNow()

        XCTAssertEqual(store.taskErrors[pendingTask.id], FixtureError.resume.localizedDescription)
        XCTAssertNil(store.taskErrors[projectedTask.id])
    }

    private func makeStore(
        tasks: [LedgerTask], links: [AgentTaskLink]
    ) async throws -> (KeeplineIntegrationStore, ProjectionTransport, LedgerStore) {
        let workspace = LedgerWorkspace(tasks: tasks, agentTaskLinks: links)
        let ledger = LedgerStore(repository: MemoryRepository(workspace: workspace), initialWorkspace: workspace)
        await ledger.bootstrap()
        let transport = ProjectionTransport()
        let store = KeeplineIntegrationStore(transport: transport, serviceController: nil)
        store.start(afterFirstFrameWith: ledger)
        store.setSceneActive(false)
        return (store, transport, ledger)
    }

    private func assertReady(_ store: KeeplineIntegrationStore, file: StaticString = #filePath, line: UInt = #line) {
        guard case .ready = store.state else {
            XCTFail("A task reconciliation failure invalidated the service snapshot", file: file, line: line)
            return
        }
    }
}

private actor MemoryRepository: WorkspaceRepository {
    var workspace: LedgerWorkspace
    init(workspace: LedgerWorkspace) { self.workspace = workspace }
    func load() async throws -> LedgerWorkspace? { workspace }
    func save(_ workspace: LedgerWorkspace) async throws { self.workspace = workspace }
}

private enum FixtureError: LocalizedError, Equatable {
    case projection, resume, unrelated, unexpected
    var errorDescription: String? {
        switch self {
        case .projection: "projection transport failure"
        case .resume: "specific pending dispatch notice"
        case .unrelated: "unrelated task operation error"
        case .unexpected: "unexpected fixture operation"
        }
    }
}

private enum ProjectionFailure {
    case transport, identity
    var message: String {
        switch self {
        case .transport: FixtureError.projection.localizedDescription
        case .identity: StashKeeplineCoordinatorError.workItemIdentityChanged.localizedDescription
        }
    }
}

private actor ProjectionTransport: KeeplineTransport {
    private var failedTaskID: UUID?
    private var failure = ProjectionFailure.transport

    func failProjection(taskID: UUID?, with failure: ProjectionFailure) {
        failedTaskID = taskID
        self.failure = failure
    }

    func metadata() async throws -> KeeplineMetadata {
        try fixture("""
        {"apiVersion":"1.0","serviceVersion":"test","instanceId":"test","mode":"service",
         "capabilities":["sessions.list","sessions.recovery.preview","sessions.recovery.execute",
          "work-items.external-upsert","work-items.session-link","work-items.completion-review"],"runtimes":[]}
        """)
    }

    func listSessions() async throws -> [KeeplineSession] { [] }

    func upsertExternalWorkItem(
        source: String, externalID: String, input: ExternalWorkItemInput
    ) async throws -> KeeplineWorkItem {
        var id = "work-\(externalID)"
        if externalID == failedTaskID?.uuidString {
            switch failure {
            case .transport: throw FixtureError.projection
            case .identity: id = "wrong-work-item"
            }
        }
        return try fixture("""
        {"id":"\(id)","title":"fixture","kind":"todo","status":"planned",
         "body":null,"projectRoot":null,"externalSource":"stash","externalId":"\(externalID)",
         "createdAt":"2026-08-30T00:00:00Z","updatedAt":"2026-08-30T00:00:00Z"}
        """)
    }

    func dispatch(id: String) async throws -> KeeplineDispatch { throw FixtureError.resume }
    func recoveryPreview(sessionID: String) async throws -> KeeplineRecoveryPreview { throw FixtureError.unrelated }
    func executeRecovery(sessionID: String, request: RecoveryExecutionRequest) async throws -> KeeplineRecoveryExecution {
        throw FixtureError.unexpected
    }
    func linkSession(workItemID: String, sessionID: String) async throws -> KeeplineSessionLink {
        throw FixtureError.unexpected
    }
    func dispatch(workItemID: String, request: DispatchRequest) async throws -> KeeplineDispatch {
        throw FixtureError.unexpected
    }
    func resolveDispatchSession(id: String, sessionID: String) async throws -> KeeplineDispatch {
        throw FixtureError.unexpected
    }
    func reviewCompletion(workItemID: String, request: CompletionReviewRequest) async throws -> CompletionReviewResult {
        throw FixtureError.unexpected
    }

    private func fixture<Value: Decodable>(_ json: String) throws -> Value {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Value.self, from: Data(json.utf8))
    }
}
