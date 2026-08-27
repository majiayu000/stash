import Combine
import Foundation
import StashCore

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

private actor MemoryRepository: WorkspaceRepository {
    var workspace: LedgerWorkspace?

    init(workspace: LedgerWorkspace? = nil) {
        self.workspace = workspace
    }

    func load() async throws -> LedgerWorkspace? { workspace }
    func save(_ workspace: LedgerWorkspace) async throws { self.workspace = workspace }
}

@main
struct StashCoreChecks {
    static func main() async throws {
        try checkCaptureParser()
        try checkPlanner()
        try await checkPersistence()
        try await checkLockedPlan()
        try await checkStoreInteractionPerformance()
        try checkPlannerPerformance()
        print("StashCoreChecks: all checks passed")
    }

    private static func checkCaptureParser() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let formatter = ISO8601DateFormatter()
        guard let now = formatter.date(from: "2026-08-28T09:00:00Z") else {
            throw CheckFailure.failed("fixture date could not be created")
        }
        guard let parsed = CaptureParser(calendar: calendar).parse(
            "Finish native flow #Stash ^p1 !tomorrow *2h",
            now: now
        ) else {
            throw CheckFailure.failed("capture parser rejected valid input")
        }

        try expect(parsed.title == "Finish native flow", "capture title was not preserved")
        try expect(parsed.projectName == "Stash", "project token was not parsed")
        try expect(parsed.priority == .p1, "priority token was not parsed")
        try expect(parsed.estimateMinutes == 120, "duration token was not parsed")
        try expect(
            parsed.scheduledFor == calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)),
            "tomorrow token was not parsed"
        )
        try expect(CaptureParser().parse("#Stash ^p1 !today *30m") == nil, "token-only capture must fail")
    }

    private static func checkPlanner() throws {
        let now = Date(timeIntervalSince1970: 1_777_000_000)
        let workspace = LedgerWorkspace.preview(now: now)
        let plan = DailyPlanner().makePlan(tasks: workspace.tasks, for: now)

        try expect((5...8).contains(plan.entries.count), "planner must return five to eight tasks")
        try expect(plan.entries.allSatisfy { !$0.reason.isEmpty }, "every planned task needs a reason")
        guard let firstID = plan.entries.first?.taskID,
              let firstTask = workspace.tasks.first(where: { $0.id == firstID }) else {
            throw CheckFailure.failed("planner returned no first task")
        }
        try expect(firstTask.status == .active, "active work must rank first")
        try expect(plan.entries.first?.reason == "Already in progress", "active work reason is wrong")

        let future = now.addingTimeInterval(86_400 * 5)
        let filteredTasks = [
            LedgerTask(title: "Long", status: .planned, priority: .p0, horizon: .longTerm),
            LedgerTask(title: "Deferred", status: .deferred, priority: .p0, deferredUntil: future),
            LedgerTask(title: "Eligible", status: .active, priority: .p1)
        ]
        let filteredPlan = DailyPlanner().makePlan(tasks: filteredTasks, for: now)
        try expect(filteredPlan.entries.map(\.taskID) == [filteredTasks[2].id], "planner included unavailable work")
    }

    private static func checkPersistence() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("stash-core-checks-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let fileURL = directory.appendingPathComponent("workspace.json")
        let repository = JSONWorkspaceRepository(fileURL: fileURL)
        let workspace = LedgerWorkspace.preview(now: Date(timeIntervalSince1970: 1_777_000_000))

        try await repository.save(workspace)
        let firstEncoding = try Data(contentsOf: fileURL)
        guard let restored = try await repository.load() else {
            throw CheckFailure.failed("JSON repository returned no saved workspace")
        }
        try expect(restored.projects.count == workspace.projects.count, "project count changed after JSON round-trip")
        try expect(restored.tasks.map(\.id) == workspace.tasks.map(\.id), "task identity changed after JSON round-trip")
        try await repository.save(restored)
        let secondEncoding = try Data(contentsOf: fileURL)
        try expect(firstEncoding == secondEncoding, "JSON representation was not stable after round-trip")

        let large = LedgerWorkspace.benchmark(taskCount: 10_000)
        let clock = ContinuousClock()
        let elapsed = try await clock.measure {
            try await repository.save(large)
            _ = try await repository.load()
        }
        try expect(elapsed < .seconds(2), "10,000-task JSON round-trip exceeded two seconds: \(elapsed)")
        print("Persistence 10k round-trip: \(elapsed)")
    }

    @MainActor
    private static func checkLockedPlan() async throws {
        let now = Date(timeIntervalSince1970: 1_777_000_000)
        let store = LedgerStore(
            repository: MemoryRepository(),
            initialWorkspace: .preview(now: now),
            now: { now }
        )
        await store.bootstrap()
        store.togglePlanLock()
        let before = store.todayRows.map(\.id)
        _ = store.capture("Unexpected critical task ^p0 !today")
        try expect(store.planIsLocked, "plan did not remain locked")
        try expect(store.todayRows.map(\.id) == before, "locked plan reordered after capture")

        guard let firstID = store.todayRows.first?.id else {
            throw CheckFailure.failed("locked plan had no task")
        }
        store.moveToTomorrow(id: firstID)
        try expect(!store.todayRows.contains { $0.id == firstID }, "tomorrow task remained in locked plan")
        try expect(store.upcomingTasks.contains { $0.id == firstID }, "tomorrow task did not reach Upcoming")
    }

    private static func checkPlannerPerformance() throws {
        let now = Date(timeIntervalSince1970: 1_777_000_000)
        let tasks = LedgerWorkspace.benchmark(taskCount: 10_000, now: now).tasks
        let planner = DailyPlanner()
        let clock = ContinuousClock()
        let elapsed = clock.measure {
            for _ in 0..<10 {
                _ = planner.makePlan(tasks: tasks, for: now)
            }
        }
        try expect(elapsed < .seconds(1), "ten 10,000-task plans exceeded one second: \(elapsed)")
        print("Planner 10 × 10k: \(elapsed)")
    }

    @MainActor
    private static func checkStoreInteractionPerformance() async throws {
        let now = Date(timeIntervalSince1970: 1_777_000_000)
        let store = LedgerStore(
            repository: MemoryRepository(),
            initialWorkspace: .benchmark(taskCount: 10_000, now: now),
            now: { now }
        )
        guard let taskID = store.todayRows.first?.id else {
            throw CheckFailure.failed("benchmark workspace produced no Today task")
        }

        var invalidations = 0
        let observer = store.objectWillChange.sink { invalidations += 1 }
        let clock = ContinuousClock()
        let elapsed = clock.measure {
            store.toggleCompletion(id: taskID)
        }
        withExtendedLifetime(observer) {}

        try expect(
            elapsed < .milliseconds(250),
            "10,000-task mutation exceeded 250 ms: \(elapsed)"
        )
        try expect(
            invalidations <= 3,
            "one mutation emitted \(invalidations) store invalidations"
        )
        print("Store 10k mutation: \(elapsed), \(invalidations) invalidations")
    }
}
