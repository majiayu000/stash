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
        try await checkLegacyPreviewCleanup()
        try await checkCompletionAndRecurrence()
        try await checkTrashAndProjects()
        try await checkChecklist()
        try await checkStoreInteractionPerformance()
        try checkPlannerPerformance()
        print("StashCoreChecks: all checks passed")
    }

    @MainActor
    private static func checkLegacyPreviewCleanup() async throws {
        let now = Date(timeIntervalSince1970: 1_777_000_000)
        var seeded = LedgerWorkspace.preview(now: now)
        let personalProject = seeded.projects.first { $0.name == "Personal" }
        let realTask = LedgerTask(
            title: "My actual task",
            projectID: personalProject?.id,
            status: .inbox,
            createdAt: now
        )
        seeded.tasks.append(realTask)

        let store = LedgerStore(
            repository: MemoryRepository(workspace: seeded),
            initialWorkspace: LedgerWorkspace(),
            now: { now }
        )
        await store.bootstrap()

        try expect(store.workspace.tasks.map(\.id) == [realTask.id], "legacy preview tasks were not cleaned up")
        try expect(
            store.workspace.projects.map(\.name) == ["Personal"],
            "cleanup removed a preview project still used by a real task"
        )
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
            LedgerTask(title: "Undecided", status: .inbox, priority: .p0),
            LedgerTask(title: "Eligible", status: .active, priority: .p1)
        ]
        let filteredPlan = DailyPlanner(includeInbox: false).makePlan(tasks: filteredTasks, for: now)
        try expect(filteredPlan.entries.map(\.taskID) == [filteredTasks[3].id], "planner included unavailable work")
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

        var legacyObject = try JSONSerialization.jsonObject(with: firstEncoding) as? [String: Any] ?? [:]
        legacyObject.removeValue(forKey: "planningPreferences")
        if var tasks = legacyObject["tasks"] as? [[String: Any]] {
            for index in tasks.indices {
                tasks[index].removeValue(forKey: "recurrence")
                tasks[index].removeValue(forKey: "reminderAt")
                tasks[index].removeValue(forKey: "statusBeforeTrash")
                tasks[index].removeValue(forKey: "recurrenceSourceID")
                tasks[index].removeValue(forKey: "checklistItems")
            }
            legacyObject["tasks"] = tasks
        }
        let legacyData = try JSONSerialization.data(withJSONObject: legacyObject)
        let legacyWorkspace = try WorkspaceCodec.decode(legacyData)
        try expect(legacyWorkspace.tasks.count == workspace.tasks.count, "legacy workspace no longer decodes")

        try await repository.save(restored)
        let secondEncoding = try Data(contentsOf: fileURL)
        try expect(firstEncoding == secondEncoding, "JSON representation was not stable after round-trip")
        let backupURL = fileURL.deletingPathExtension().appendingPathExtension("backup.json")
        try expect(
            FileManager.default.fileExists(atPath: backupURL.path),
            "repository did not preserve the previous workspace backup"
        )

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
    private static func checkCompletionAndRecurrence() async throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = Date(timeIntervalSince1970: 1_777_000_000)
        let today = calendar.startOfDay(for: now)
        let task = LedgerTask(
            title: "Daily review",
            status: .planned,
            scheduledFor: today,
            isPinnedToday: true,
            recurrence: .daily,
            reminderAt: now.addingTimeInterval(3_600),
            checklistItems: [
                LedgerChecklistItem(title: "Review inbox", isCompleted: true),
                LedgerChecklistItem(title: "Choose focus")
            ]
        )
        let workspace = LedgerWorkspace(
            tasks: [task],
            dailyPlan: DailyPlan(
                day: today,
                entries: [PlanEntry(taskID: task.id, reason: "Scheduled for today", score: 720)]
            )
        )
        let store = LedgerStore(
            repository: MemoryRepository(),
            initialWorkspace: workspace,
            calendar: calendar,
            now: { now }
        )

        store.toggleCompletion(id: task.id)
        try expect(store.todayCompletedCount == 1, "completing an unlocked plan lost Today progress")
        try expect(store.todayRows.first?.task.status == .completed, "completed task left the active daily plan")

        _ = store.capture("Unscheduled thought")
        try expect(store.todayCompletedCount == 1, "a later capture erased completed Today progress")

        let nextDay = calendar.date(byAdding: .day, value: 1, to: today)
        let nextTask = store.workspace.tasks.first { $0.id != task.id }
        try expect(nextTask?.scheduledFor == nextDay, "recurring task did not create the next occurrence")
        try expect(nextTask?.recurrence == .daily, "next occurrence lost its recurrence rule")
        try expect(
            nextTask?.reminderAt == task.reminderAt?.addingTimeInterval(86_400),
            "next occurrence lost its advanced reminder"
        )
        try expect(
            nextTask?.checklistItems?.map(\.title) == task.checklistItems?.map(\.title),
            "next occurrence lost its checklist"
        )
        try expect(
            nextTask?.checklistItems?.allSatisfy { !$0.isCompleted } == true,
            "next occurrence did not reset checklist completion"
        )

        store.toggleCompletion(id: task.id)
        try expect(
            !store.workspace.tasks.contains { $0.recurrenceSourceID == task.id && $0.isOpen },
            "reopening a recurring task left a duplicate future occurrence"
        )
    }

    @MainActor
    private static func checkTrashAndProjects() async throws {
        let now = Date(timeIntervalSince1970: 1_777_000_000)
        let project = LedgerProject(name: "Original")
        let task = LedgerTask(title: "Recover me", projectID: project.id, status: .planned)
        let store = LedgerStore(
            repository: MemoryRepository(),
            initialWorkspace: LedgerWorkspace(projects: [project], tasks: [task]),
            now: { now }
        )

        store.delete(id: task.id)
        try expect(store.trashedTasks.map(\.id) == [task.id], "deleted task did not enter Trash")
        store.restore(id: task.id)
        try expect(store.task(id: task.id)?.status == .planned, "restored task lost its previous status")

        store.updateProject(id: project.id, name: "Renamed", symbol: "hammer")
        try expect(store.workspace.projects.first?.name == "Renamed", "project rename did not persist")
        store.deleteProject(id: project.id)
        try expect(store.task(id: task.id)?.projectID == nil, "deleting a project also stranded its task")

        store.updatePlanningPreferences(
            PlanningPreferences(
                minimumTasks: 2,
                maximumTasks: 4,
                minuteBudget: 120,
                includeInbox: false
            )
        )
        try expect(store.planningPreferences.maximumTasks == 4, "planning preferences did not update")
        try expect(!store.planningPreferences.includeInbox, "Inbox planning preference did not update")
    }

    @MainActor
    private static func checkChecklist() async throws {
        let task = LedgerTask(title: "Ship the release")
        let store = LedgerStore(
            repository: MemoryRepository(),
            initialWorkspace: LedgerWorkspace(tasks: [task])
        )

        guard let first = store.addChecklistItem(taskID: task.id, title: "  Run checks  ") else {
            throw CheckFailure.failed("valid checklist item was rejected")
        }
        try expect(first.title == "Run checks", "checklist title was not normalized")
        try expect(store.task(id: task.id)?.checklistItems == [first], "checklist item did not persist")
        try expect(
            store.addChecklistItem(taskID: task.id, title: "   ") == nil,
            "empty checklist item was accepted"
        )

        store.toggleChecklistItem(taskID: task.id, itemID: first.id)
        try expect(
            store.task(id: task.id)?.checklistItems?.first?.isCompleted == true,
            "checklist completion did not toggle"
        )

        store.deleteChecklistItem(taskID: task.id, itemID: first.id)
        try expect(
            store.task(id: task.id)?.checklistItems == nil,
            "deleting the final checklist item did not clear the checklist"
        )
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
