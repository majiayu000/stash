import Combine
import Foundation

public struct PlannedTaskRow: Identifiable, Equatable, Sendable {
    public var id: UUID { task.id }
    public let task: LedgerTask
    public let reason: String
    public let score: Int
}

public enum PersistenceState: Equatable, Sendable {
    case idle
    case saving
    case saved(Date)
    case failed(String)
}

@MainActor
public final class LedgerStore: ObservableObject {
    @Published public private(set) var workspace: LedgerWorkspace
    @Published public private(set) var todayRows: [PlannedTaskRow] = []
    @Published public private(set) var inboxTasks: [LedgerTask] = []
    @Published public private(set) var upcomingTasks: [LedgerTask] = []
    @Published public private(set) var shortTermTasks: [LedgerTask] = []
    @Published public private(set) var longTermTasks: [LedgerTask] = []
    @Published public private(set) var completedToday: [LedgerTask] = []
    @Published public private(set) var persistenceState: PersistenceState = .idle
    @Published public private(set) var isLoaded = false

    public let repository: any WorkspaceRepository
    public var calendar: Calendar
    private let planner: DailyPlanner
    private let parser: CaptureParser
    private let now: @Sendable () -> Date
    private var saveTask: Task<Void, Never>?
    private var saveGeneration = 0

    public init(
        repository: any WorkspaceRepository,
        initialWorkspace: LedgerWorkspace = .preview(),
        calendar: Calendar = .current,
        now: @escaping @Sendable () -> Date = { .now }
    ) {
        self.repository = repository
        self.workspace = initialWorkspace
        self.calendar = calendar
        self.planner = DailyPlanner(calendar: calendar)
        self.parser = CaptureParser(calendar: calendar)
        self.now = now
        normalizePlan(allowLockedPlan: true)
        rebuildSnapshot()
    }

    public static func live() -> LedgerStore {
        LedgerStore(repository: JSONWorkspaceRepository())
    }

    public func bootstrap() async {
        do {
            if let loaded = try await repository.load() {
                workspace = loaded
            }
            normalizePlan(allowLockedPlan: true)
            rebuildSnapshot()
            isLoaded = true
            try await repository.save(workspace)
            persistenceState = .saved(now())
        } catch {
            isLoaded = true
            persistenceState = .failed("Could not open local data: \(error.localizedDescription)")
        }
    }

    public var planIsLocked: Bool { workspace.dailyPlan?.isLocked ?? false }
    public var todayEstimateMinutes: Int { todayRows.reduce(0) { $0 + $1.task.estimateMinutes } }
    public var todayCompletedCount: Int { todayRows.filter { $0.task.status == .completed }.count }
    public var openTaskCount: Int { workspace.tasks.lazy.filter(\.isOpen).count }

    public func project(for task: LedgerTask) -> LedgerProject? {
        guard let projectID = task.projectID else { return nil }
        return workspace.projects.first { $0.id == projectID }
    }

    public func task(id: UUID?) -> LedgerTask? {
        guard let id else { return nil }
        return workspace.tasks.first { $0.id == id }
    }

    public func tasks(in project: LedgerProject) -> [LedgerTask] {
        workspace.tasks
            .filter { $0.projectID == project.id && $0.isOpen }
            .sorted(by: taskComesFirst)
    }

    public func search(_ query: String) -> [LedgerTask] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return [] }
        return workspace.tasks.filter { task in
            task.title.localizedCaseInsensitiveContains(needle)
                || task.notes.localizedCaseInsensitiveContains(needle)
                || (project(for: task)?.name.localizedCaseInsensitiveContains(needle) ?? false)
        }
        .sorted(by: taskComesFirst)
    }

    @discardableResult
    public func capture(_ raw: String) -> LedgerTask? {
        guard let parsed = parser.parse(raw, now: now()) else { return nil }
        let projectID = resolveProject(named: parsed.projectName)
        let isToday = parsed.scheduledFor.map { calendar.isDate($0, inSameDayAs: now()) } ?? false
        let task = LedgerTask(
            title: parsed.title,
            projectID: projectID,
            status: isToday ? .planned : .inbox,
            priority: parsed.priority,
            estimateMinutes: parsed.estimateMinutes,
            scheduledFor: parsed.scheduledFor,
            isPinnedToday: isToday,
            createdAt: now(),
            updatedAt: now()
        )
        workspace.tasks.append(task)
        commit(replanIfUnlocked: true)
        return task
    }

    public func replanToday() {
        guard workspace.dailyPlan?.isLocked != true else { return }
        workspace.dailyPlan = planner.makePlan(tasks: workspace.tasks, for: now())
        commit(replanIfUnlocked: false)
    }

    public func togglePlanLock() {
        normalizePlan(allowLockedPlan: true)
        workspace.dailyPlan?.isLocked.toggle()
        commit(replanIfUnlocked: false)
    }

    public func toggleCompletion(id: UUID) {
        mutateTask(id: id) { task in
            if task.status == .completed {
                task.status = .planned
                task.completedAt = nil
            } else {
                task.status = .completed
                task.completedAt = now()
            }
        }
    }

    public func start(id: UUID) {
        for index in workspace.tasks.indices where workspace.tasks[index].status == .active {
            workspace.tasks[index].status = .planned
            workspace.tasks[index].updatedAt = now()
        }
        mutateTask(id: id) { task in
            task.status = .active
            task.isPinnedToday = true
            task.scheduledFor = calendar.startOfDay(for: now())
            task.deferredUntil = nil
        }
    }

    public func moveToToday(id: UUID) {
        mutateTask(id: id) { task in
            task.status = .planned
            task.isPinnedToday = true
            task.scheduledFor = calendar.startOfDay(for: now())
            task.deferredUntil = nil
        }
    }

    public func moveToTomorrow(id: UUID) {
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now()))
        mutateTask(id: id, removeFromLockedPlan: true) { task in
            task.status = .planned
            task.isPinnedToday = false
            task.scheduledFor = tomorrow
            task.deferredUntil = nil
        }
    }

    public func deferTask(id: UUID, days: Int = 3) {
        let deferred = calendar.date(byAdding: .day, value: days, to: calendar.startOfDay(for: now()))
        mutateTask(id: id, removeFromLockedPlan: true) { task in
            task.status = .deferred
            task.isPinnedToday = false
            task.deferredUntil = deferred
        }
    }

    public func moveToLongTerm(id: UUID) {
        mutateTask(id: id, removeFromLockedPlan: true) { task in
            task.status = .planned
            task.horizon = .longTerm
            task.isPinnedToday = false
            task.scheduledFor = nil
            task.deferredUntil = nil
        }
    }

    public func updateTask(
        id: UUID,
        title: String,
        notes: String,
        projectID: UUID?,
        priority: TaskPriority,
        estimateMinutes: Int,
        horizon: TaskHorizon
    ) {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { return }
        mutateTask(id: id) { task in
            task.title = cleanTitle
            task.notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
            task.projectID = projectID
            task.priority = priority
            task.estimateMinutes = max(5, estimateMinutes)
            task.horizon = horizon
        }
    }

    public func delete(id: UUID) {
        workspace.tasks.removeAll { $0.id == id }
        workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
        commit(replanIfUnlocked: true)
    }

    public func flush() async {
        saveTask?.cancel()
        do {
            try await repository.save(workspace)
            persistenceState = .saved(now())
        } catch {
            persistenceState = .failed("Could not save: \(error.localizedDescription)")
        }
    }

    private func mutateTask(
        id: UUID,
        removeFromLockedPlan: Bool = false,
        mutation: (inout LedgerTask) -> Void
    ) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id }) else { return }
        mutation(&workspace.tasks[index])
        workspace.tasks[index].updatedAt = now()
        if removeFromLockedPlan && workspace.dailyPlan?.isLocked == true {
            workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
        }
        commit(replanIfUnlocked: true)
    }

    private func resolveProject(named name: String?) -> UUID? {
        guard let name, !name.isEmpty else { return nil }
        if let existing = workspace.projects.first(where: {
            $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame
        }) {
            return existing.id
        }
        let project = LedgerProject(name: name)
        workspace.projects.append(project)
        return project.id
    }

    private func normalizePlan(allowLockedPlan: Bool) {
        let currentDay = calendar.startOfDay(for: now())
        if let plan = workspace.dailyPlan,
           calendar.isDate(plan.day, inSameDayAs: currentDay),
           (allowLockedPlan || !plan.isLocked) {
            return
        }
        workspace.dailyPlan = planner.makePlan(tasks: workspace.tasks, for: currentDay)
    }

    private func commit(replanIfUnlocked: Bool) {
        normalizePlan(allowLockedPlan: true)
        if replanIfUnlocked, workspace.dailyPlan?.isLocked != true {
            workspace.dailyPlan = planner.makePlan(tasks: workspace.tasks, for: now())
        }
        rebuildSnapshot()
        scheduleSave()
    }

    private func rebuildSnapshot() {
        let tasksByID = Dictionary(uniqueKeysWithValues: workspace.tasks.map { ($0.id, $0) })
        todayRows = (workspace.dailyPlan?.entries ?? []).compactMap { entry in
            guard let task = tasksByID[entry.taskID] else { return nil }
            return PlannedTaskRow(task: task, reason: entry.reason, score: entry.score)
        }

        let today = calendar.startOfDay(for: now())
        let weekEnd = calendar.date(byAdding: .day, value: 7, to: today) ?? today

        inboxTasks = workspace.tasks
            .filter { $0.status == .inbox && $0.isOpen }
            .sorted { $0.createdAt > $1.createdAt }

        upcomingTasks = workspace.tasks
            .filter { task in
                guard task.isOpen else { return false }
                let nextDate = task.scheduledFor ?? task.dueAt
                return nextDate.map { calendar.startOfDay(for: $0) > today } ?? false
            }
            .sorted(by: taskComesFirst)

        let todayIDs = Set(todayRows.map(\.id))
        shortTermTasks = workspace.tasks
            .filter { task in
                guard task.isOpen, task.horizon == .shortTerm, !todayIDs.contains(task.id) else { return false }
                let nextDate = task.dueAt ?? task.scheduledFor
                guard let nextDate else { return false }
                let day = calendar.startOfDay(for: nextDate)
                return day > today && day <= weekEnd
            }
            .sorted(by: taskComesFirst)

        longTermTasks = workspace.tasks
            .filter { $0.isOpen && $0.horizon == .longTerm }
            .sorted(by: taskComesFirst)

        completedToday = workspace.tasks
            .filter { task in
                guard task.status == .completed, let completedAt = task.completedAt else { return false }
                return calendar.isDate(completedAt, inSameDayAs: today)
            }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveGeneration += 1
        let generation = saveGeneration
        let snapshot = workspace
        persistenceState = .saving

        saveTask = Task { [weak self, repository, now] in
            do {
                try await Task.sleep(for: .milliseconds(120))
                try Task.checkCancellation()
                try await repository.save(snapshot)
                guard !Task.isCancelled, let self, generation == self.saveGeneration else { return }
                self.persistenceState = .saved(now())
            } catch is CancellationError {
                return
            } catch {
                guard let self, generation == self.saveGeneration else { return }
                self.persistenceState = .failed("Could not save: \(error.localizedDescription)")
            }
        }
    }

    private func taskComesFirst(_ lhs: LedgerTask, _ rhs: LedgerTask) -> Bool {
        let lhsDate = lhs.dueAt ?? lhs.scheduledFor ?? .distantFuture
        let rhsDate = rhs.dueAt ?? rhs.scheduledFor ?? .distantFuture
        if lhsDate != rhsDate { return lhsDate < rhsDate }
        if lhs.priority != rhs.priority { return lhs.priority < rhs.priority }
        return lhs.createdAt < rhs.createdAt
    }
}
