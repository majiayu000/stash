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

    func testTerminalDispatchNoticeSurvivesUntilRecovery() async throws {
        for state in [AgentDispatchState.failed, .cancelled] {
            let task = LedgerTask(title: "Terminal dispatch notice")
            let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                     dispatchID: "terminal", runtimeID: "codex", source: .dispatched)
            let (store, transport, ledger) = try await makeStore(tasks: [task], links: [link])
            defer { store.shutdown() }
            await transport.finishDispatch(taskID: task.id, state: state)

            await store.refreshNow()
            XCTAssertEqual(store.taskErrors[task.id], FixtureError.resume.localizedDescription)
            await store.refreshNow()
            XCTAssertEqual(store.taskErrors[task.id], FixtureError.resume.localizedDescription,
                           "A terminal dispatch reason disappeared without recovery")
            await transport.failProjection(taskID: task.id, with: .transport)
            ledger.toggleCompletion(id: task.id)
            await store.refreshNow()
            XCTAssertEqual(store.taskErrors[task.id], FixtureError.resume.localizedDescription,
                           "A projection failure replaced the terminal dispatch reason")

            var recovered = try XCTUnwrap(ledger.agentLink(for: task.id))
            recovered.dispatchState = .linked
            recovered.sessionID = "recovered-session"
            XCTAssertEqual(ledger.persistAgentLink(recovered), true)
            await transport.failProjection(taskID: nil, with: .transport)
            await store.refreshNow()
            XCTAssertNil(store.taskErrors[task.id], "A recovered dispatch retained its old notice")
            assertReady(store)
        }
    }

    func testSameTaskPendingNoticeSurvivesProjectionFailure() async throws {
        let task = LedgerTask(title: "Pending dispatch and projection")
        let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                 dispatchID: "unavailable", runtimeID: "codex", source: .dispatched)
        let (store, transport, ledger) = try await makeStore(tasks: [task], links: [link])
        defer { store.shutdown() }
        await transport.failProjection(taskID: task.id, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[task.id], FixtureError.resume.localizedDescription)
        assertReady(store)

        await transport.failProjection(taskID: nil, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[task.id], FixtureError.resume.localizedDescription,
                       "Successful projection cleared an unresolved dispatch notice")
        var recovered = try XCTUnwrap(ledger.agentLink(for: task.id))
        recovered.dispatchState = .linked
        recovered.sessionID = "recovered-session"
        XCTAssertEqual(ledger.persistAgentLink(recovered), true)
        await store.refreshNow()
        XCTAssertNil(store.taskErrors[task.id])
    }

    func testProjectionWarningsSurviveFailFastUntilRetry() async throws {
        let tasks = (0..<4).map { LedgerTask(title: "Failed projection \($0)") }
        let links = tasks.map {
            AgentTaskLink(taskID: $0.id, keeplineWorkItemID: "work-\($0.id)",
                          dispatchState: .failed, runtimeID: "codex", source: .dispatched)
        }
        let (store, transport, ledger) = try await makeStore(tasks: tasks, links: links)
        defer { store.shutdown() }
        await store.refreshNow()
        let initialOrder = await transport.projectionAttempts()
        let warningTaskID = try XCTUnwrap(initialOrder.last)
        for task in tasks { ledger.toggleCompletion(id: task.id) }
        await transport.failProjection(taskID: warningTaskID, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[warningTaskID], ProjectionFailure.transport.message)
        for task in tasks where task.id != warningTaskID { ledger.toggleCompletion(id: task.id) }
        await transport.failAllProjections(true)
        var warnedTaskIDs: Set<UUID> = [warningTaskID]
        for _ in 0..<12 {
            await transport.resetProjectionAttempts()
            await store.refreshNow()
            let attempted = await transport.projectionAttempts()
            XCTAssertEqual(attempted.count, 1, "Projection sync stopped being fail-fast")
            warnedTaskIDs.formUnion(attempted)
            for taskID in warnedTaskIDs {
                XCTAssertEqual(store.taskErrors[taskID], ProjectionFailure.transport.message,
                               "An unresolved projection warning disappeared before its own retry")
            }
            assertReady(store)
        }
        await transport.failAllProjections(false)
        await transport.failProjection(taskID: nil, with: .transport)
        await transport.resetProjectionAttempts()
        await store.refreshNow()
        let recoveredAttempts = await transport.projectionAttempts()
        XCTAssertEqual(Set(recoveredAttempts), Set(tasks.map(\.id)))
        for taskID in warnedTaskIDs { XCTAssertNil(store.taskErrors[taskID]) }
        assertReady(store)
    }

    func testProjectionFailurePreservesSameTaskOperationError() async throws {
        let task = LedgerTask(title: "Task operation error")
        let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                 sessionID: "linked-session", runtimeID: "codex", source: .manuallyLinked)
        let (store, transport, _) = try await makeStore(tasks: [task], links: [link])
        defer { store.shutdown() }
        _ = await store.recoveryPreview(sessionID: "unrelated", taskID: task.id)
        await transport.failProjection(taskID: task.id, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[task.id], FixtureError.unrelated.localizedDescription)
        await transport.failProjection(taskID: nil, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[task.id], FixtureError.unrelated.localizedDescription)
        assertReady(store)
    }

    func testSkippedProjectionWarningIsNotRecovery() async throws {
        let task = LedgerTask(title: "Projection skipped without recovery")
        let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                 dispatchState: .failed, runtimeID: "codex", source: .dispatched)
        let (store, transport, ledger) = try await makeStore(tasks: [task], links: [link])
        defer { store.shutdown() }
        await transport.failProjection(taskID: task.id, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[task.id], ProjectionFailure.transport.message)
        var skipped = try XCTUnwrap(ledger.agentLink(for: task.id))
        skipped.keeplineWorkItemID = nil
        XCTAssertEqual(ledger.persistAgentLink(skipped), true)
        await transport.failProjection(taskID: nil, with: .transport)
        await transport.resetProjectionAttempts()
        await store.refreshNow()
        let skippedAttempts = await transport.projectionAttempts()
        XCTAssertEqual(skippedAttempts, [])
        XCTAssertEqual(store.taskErrors[task.id], ProjectionFailure.transport.message,
                       "A skipped projection was treated as a successful retry")
        skipped.keeplineWorkItemID = "work-\(task.id)"
        XCTAssertEqual(ledger.persistAgentLink(skipped), true)
        await store.refreshNow()
        let recoveredAttempts = await transport.projectionAttempts()
        XCTAssertEqual(recoveredAttempts, [task.id])
        XCTAssertNil(store.taskErrors[task.id])
        assertReady(store)
    }

    func testCachedProjectionIsNotNewRecovery() async throws {
        let task = LedgerTask(title: "Cached projection is not a retry", status: .planned)
        let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                 dispatchState: .failed, runtimeID: "codex", source: .dispatched)
        let (store, transport, ledger) = try await makeStore(tasks: [task], links: [link])
        defer { store.shutdown() }
        await store.refreshNow()
        ledger.toggleCompletion(id: task.id)
        await transport.failProjection(taskID: task.id, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[task.id], ProjectionFailure.transport.message)
        ledger.toggleCompletion(id: task.id)
        await transport.failProjection(taskID: nil, with: .transport)
        await transport.resetProjectionAttempts()
        await store.refreshNow()
        let skippedAttempts = await transport.projectionAttempts()
        XCTAssertEqual(skippedAttempts, [])
        XCTAssertEqual(store.taskErrors[task.id], ProjectionFailure.transport.message,
                       "An unchanged cached projection was treated as a new successful retry")
        ledger.toggleCompletion(id: task.id)
        await store.refreshNow()
        let recoveredAttempts = await transport.projectionAttempts()
        XCTAssertEqual(recoveredAttempts, [task.id])
        XCTAssertNil(store.taskErrors[task.id])
        assertReady(store)
    }

    func testSuccessfulRetryClearsWarningBeforeLaterFailure() async throws {
        let tasks = (0..<4).map { LedgerTask(title: "Partial projection \($0)", status: .planned) }
        let links = tasks.map {
            AgentTaskLink(taskID: $0.id, keeplineWorkItemID: "work-\($0.id)",
                          dispatchState: .failed, runtimeID: "codex", source: .dispatched)
        }
        let (store, transport, ledger) = try await makeStore(tasks: tasks, links: links)
        defer { store.shutdown() }
        await store.refreshNow()
        let order = await transport.projectionAttempts()
        let warningTaskID = try XCTUnwrap(order.first)
        let laterTaskID = order[1]
        for task in tasks { ledger.toggleCompletion(id: task.id) }
        await transport.failProjection(taskID: warningTaskID, with: .transport)
        await store.refreshNow()
        XCTAssertEqual(store.taskErrors[warningTaskID], ProjectionFailure.transport.message)

        await transport.failProjection(taskID: laterTaskID, with: .transport)
        await transport.resetProjectionAttempts()
        await store.refreshNow()
        let partialAttempts = await transport.projectionAttempts()
        XCTAssertEqual(partialAttempts.first, warningTaskID)
        XCTAssertEqual(partialAttempts.last, laterTaskID)
        XCTAssertNil(store.taskErrors[warningTaskID],
                     "A successful task retry lost its recovery evidence when another task failed")
        XCTAssertEqual(store.taskErrors[laterTaskID], ProjectionFailure.transport.message)
        assertReady(store)

        await transport.failProjection(taskID: nil, with: .transport)
        await transport.resetProjectionAttempts()
        await store.refreshNow()
        let nextAttempts = await transport.projectionAttempts()
        XCTAssertEqual(nextAttempts.contains(warningTaskID), false,
                       "The already-successful projection should be cached on the next refresh")
        XCTAssertNil(store.taskErrors[warningTaskID])
        XCTAssertNil(store.taskErrors[laterTaskID])
        assertReady(store)
    }

    func testOverlappingRefreshRetriesAfterProjectionFailure() async throws {
        for cancelled in [false, true] {
            let task = LedgerTask(title: "Overlapping refresh projection")
            let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                     sessionID: "linked-session", runtimeID: "codex", source: .manuallyLinked)
            let (store, transport, _) = try await makeStore(tasks: [task], links: [link])
            defer { store.shutdown() }
            await transport.pauseNextProjection()
            let first = Task { await store.refreshNow() }
            await transport.waitForPausedProjection()
            let second = Task { await store.refreshNow() }
            for _ in 0..<20 { await Task.yield() }
            let beforeRelease = await transport.projectionAttempts()
            XCTAssertEqual(beforeRelease, [task.id], "Concurrent refreshes issued overlapping projections")
            if cancelled { first.cancel() }
            await transport.releasePausedProjection(failingWith: cancelled ? CancellationError() : FixtureError.projection)
            await first.value
            await second.value
            let afterRetry = await transport.projectionAttempts()
            XCTAssertEqual(afterRetry, [task.id, task.id])
            XCTAssertNil(store.taskErrors[task.id], "The queued successful retry left a stale warning")
            await transport.resetProjectionAttempts()
            await store.refreshNow()
            let cached = await transport.projectionAttempts()
            XCTAssertEqual(cached, [])
            XCTAssertNil(store.taskErrors[task.id])
            assertReady(store)
        }
    }

    func testQueuedRefreshSeesChangedTaskAndPreservesOperationError() async throws {
        let tasks = (0..<2).map { LedgerTask(title: "Queued refresh task \($0)", status: .planned) }
        let links = tasks.map {
            AgentTaskLink(taskID: $0.id, keeplineWorkItemID: "work-\($0.id)",
                          sessionID: "linked-\($0.id)", runtimeID: "codex", source: .manuallyLinked)
        }
        let (store, transport, ledger) = try await makeStore(tasks: tasks, links: links)
        defer { store.shutdown() }
        await store.refreshNow()
        await transport.resetProjectionAttempts()
        ledger.toggleCompletion(id: tasks[0].id)
        await transport.pauseNextProjection()
        let first = Task { await store.refreshNow() }
        await transport.waitForPausedProjection()
        ledger.toggleCompletion(id: tasks[1].id)
        _ = await store.recoveryPreview(sessionID: "unrelated", taskID: tasks[1].id)
        let second = Task { await store.refreshNow() }
        for _ in 0..<20 { await Task.yield() }
        let beforeRelease = await transport.projectionAttempts()
        XCTAssertEqual(beforeRelease, [tasks[0].id])
        await transport.releasePausedProjection(failingWith: nil)
        await first.value
        await second.value
        let afterRefresh = await transport.projectionAttempts()
        XCTAssertEqual(afterRefresh, tasks.map(\.id), "The queued refresh ignored a different task's new projection")
        XCTAssertEqual(store.taskErrors[tasks[1].id], FixtureError.unrelated.localizedDescription)
        assertReady(store)
    }

    func testCancelledQueuedRefreshDoesNotProject() async throws {
        let task = LedgerTask(title: "Cancelled queued refresh")
        let link = AgentTaskLink(taskID: task.id, keeplineWorkItemID: "work-\(task.id)",
                                 sessionID: "linked-session", runtimeID: "codex", source: .manuallyLinked)
        let (store, transport, ledger) = try await makeStore(tasks: [task], links: [link])
        defer { store.shutdown() }
        await transport.pauseNextProjection()
        let first = Task { await store.refreshNow() }
        await transport.waitForPausedProjection()
        ledger.toggleCompletion(id: task.id)
        let second = Task { await store.refreshNow() }
        for _ in 0..<20 { await Task.yield() }
        second.cancel()
        await transport.releasePausedProjection(failingWith: nil)
        await first.value
        await second.value
        let afterCancellation = await transport.projectionAttempts()
        XCTAssertEqual(afterCancellation, [task.id], "A cancelled queued refresh sent a projection")
        await store.refreshNow()
        let afterRetry = await transport.projectionAttempts()
        XCTAssertEqual(afterRetry, [task.id, task.id], "Cancellation blocked a later normal refresh")
        XCTAssertNil(store.taskErrors[task.id])
        assertReady(store)
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
    private var pauseNext = false
    private var paused: CheckedContinuation<Void, Error>?
    private var pauseWaiter: CheckedContinuation<Void, Never>?
    func pauseNextProjection() { pauseNext = true }
    func waitForPausedProjection() async {
        if paused != nil { return }
        await withCheckedContinuation { pauseWaiter = $0 }
    }
    func releasePausedProjection(failingWith error: Error?) {
        let continuation = paused
        paused = nil
        if let error { continuation?.resume(throwing: error) }
        else { continuation?.resume() }
    }
    private var failedTaskID: UUID?
    private var failure = ProjectionFailure.transport
    private var failEveryProjection = false
    private var attemptedTaskIDs: [UUID] = []

    func failAllProjections(_ fail: Bool) { failEveryProjection = fail }
    func resetProjectionAttempts() { attemptedTaskIDs = [] }
    func projectionAttempts() -> [UUID] { attemptedTaskIDs }
    private var finishedDispatch: (UUID, AgentDispatchState)?

    func finishDispatch(taskID: UUID, state: AgentDispatchState) {
        finishedDispatch = (taskID, state)
    }

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
        if let taskID = UUID(uuidString: externalID) { attemptedTaskIDs.append(taskID) }
        if pauseNext {
            pauseNext = false
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                paused = continuation
                pauseWaiter?.resume()
                pauseWaiter = nil
            }
        }
        if failEveryProjection { throw FixtureError.projection }
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

    func dispatch(id: String) async throws -> KeeplineDispatch {
        guard let (taskID, state) = finishedDispatch else { throw FixtureError.resume }
        return try fixture("""
        {"id":"\(id)","workItemId":"work-\(taskID)","runtimeId":"codex","cwd":"/tmp",
         "state":"\(state.rawValue)","candidateSessionIds":[],"linkedAgentSessionId":null,
         "linkedSessionId":null,"error":"specific pending dispatch notice",
         "launchedAt":"2026-08-30T00:00:00Z","correlationDeadlineAt":"2026-08-30T00:01:00Z",
         "createdAt":"2026-08-30T00:00:00Z","updatedAt":"2026-08-30T00:00:00Z"}
        """)
    }
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
