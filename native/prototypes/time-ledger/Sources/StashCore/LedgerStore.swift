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

private struct LedgerSnapshot {
    var todayRows: [PlannedTaskRow] = []
    var inboxTasks: [LedgerTask] = []
    var upcomingTasks: [LedgerTask] = []
    var shortTermTasks: [LedgerTask] = []
    var longTermTasks: [LedgerTask] = []
    var completedToday: [LedgerTask] = []
    var trashedTasks: [LedgerTask] = []
}

private let legacyPreviewTaskTitles: Set<String> = [
    "Finish the native Stash daily flow",
    "Review local session handoff",
    "Send VSR upload notes",
    "Prepare August infra handoff",
    "Book dentist follow-up",
    "Write the first-run empty state",
    "Read the local-first sync RFC",
    "Reply to the release thread",
    "Check the migration rehearsal",
    "Write v0.4 release notes",
    "Design a weekly review ritual",
    "Build one local work history",
    "Create a personal knowledge index",
    "Capture keyboard navigation ideas",
    "Look at notification permission wording"
]

private let legacyPreviewProjectSignatures: Set<String> = [
    "Stash|tray.full",
    "AtlasCloud|cloud",
    "Work|briefcase",
    "Personal|person"
]

@MainActor
public final class LedgerStore: ObservableObject {
    public private(set) var workspace: LedgerWorkspace
    @Published private var snapshot = LedgerSnapshot()
    @Published public private(set) var persistenceState: PersistenceState = .idle
    @Published public private(set) var isLoaded = false
    @Published public private(set) var reminderRevision = 0

    public let repository: any WorkspaceRepository
    public var calendar: Calendar
    private let parser: CaptureParser
    private let now: @Sendable () -> Date
    private var saveTask: Task<Void, Never>?
    private var saveGeneration = 0
    private var persistenceEnabled = true

    public init(
        repository: any WorkspaceRepository,
        initialWorkspace: LedgerWorkspace = .preview(),
        calendar: Calendar = .current,
        now: @escaping @Sendable () -> Date = { .now }
    ) {
        self.repository = repository
        self.workspace = initialWorkspace
        self.calendar = calendar
        self.parser = CaptureParser(calendar: calendar)
        self.now = now
        normalizePlan(allowLockedPlan: true)
        rebuildSnapshot()
    }

    public static func live() -> LedgerStore {
        LedgerStore(
            repository: JSONWorkspaceRepository(),
            initialWorkspace: LedgerWorkspace()
        )
    }

    public var todayRows: [PlannedTaskRow] { snapshot.todayRows }
    public var inboxTasks: [LedgerTask] { snapshot.inboxTasks }
    public var upcomingTasks: [LedgerTask] { snapshot.upcomingTasks }
    public var shortTermTasks: [LedgerTask] { snapshot.shortTermTasks }
    public var longTermTasks: [LedgerTask] { snapshot.longTermTasks }
    public var completedToday: [LedgerTask] { snapshot.completedToday }
    public var trashedTasks: [LedgerTask] { snapshot.trashedTasks }
    public var planningPreferences: PlanningPreferences {
        workspace.planningPreferences ?? .default
    }

    public func bootstrap() async {
        do {
            if let loaded = try await repository.load() {
                guard loaded.schemaVersion <= LedgerWorkspace.currentSchemaVersion else {
                    throw WorkspaceError.unsupportedSchema(loaded.schemaVersion)
                }
                workspace = loaded
                removeLegacyPreviewSeedIfNeeded()
            }
        } catch {
            persistenceEnabled = false
            isLoaded = true
            persistenceState = .failed("Could not open local data: \(error.localizedDescription)")
            return
        }

        migrateWorkspaceIfNeeded()
        normalizePlan(allowLockedPlan: true)
        rebuildSnapshot()
        isLoaded = true
        reminderRevision += 1
        do {
            try await repository.save(workspace)
            persistenceState = .saved(now())
        } catch {
            persistenceState = .failed("Could not save local data: \(error.localizedDescription)")
        }
    }

    public var planIsLocked: Bool { workspace.dailyPlan?.isLocked ?? false }
    public var todayEstimateMinutes: Int { todayRows.reduce(0) { $0 + $1.task.estimateMinutes } }
    public var todayRemainingMinutes: Int {
        todayRows.filter { $0.task.isOpen }.reduce(0) { $0 + $1.task.estimateMinutes }
    }
    public var currentDate: Date { now() }

    public func refreshDay() {
        if let day = workspace.dailyPlan?.day, calendar.isDate(day, inSameDayAs: now()) { return }
        commit(replanIfUnlocked: false)
    }
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

    public func agentLink(for taskID: UUID) -> AgentTaskLink? {
        workspace.agentTaskLinks
            .filter { $0.taskID == taskID }
            .sorted { $0.linkedAt > $1.linkedAt }
            .first { !$0.isTerminal }
            ?? workspace.agentTaskLinks
                .filter { $0.taskID == taskID }
                .max { $0.linkedAt < $1.linkedAt }
    }

    @discardableResult
    public func persistAgentLink(_ link: AgentTaskLink) -> Bool {
        guard workspace.tasks.contains(where: { $0.id == link.taskID }) else { return false }

        let hasAnotherActiveLink = workspace.agentTaskLinks.contains {
            $0.id != link.id && $0.taskID == link.taskID && !$0.isTerminal
        }
        guard link.isTerminal || !hasAnotherActiveLink else { return false }

        if let index = workspace.agentTaskLinks.firstIndex(where: { $0.id == link.id }) {
            objectWillChange.send()
            workspace.agentTaskLinks[index] = link
        } else {
            objectWillChange.send()
            workspace.agentTaskLinks.append(link)
        }

        scheduleSave(updateReminders: false)
        return true
    }

    @discardableResult
    public func recordAgentCompletionDecision(
        linkID: UUID,
        decision: AgentCompletionDecision
    ) -> Bool {
        guard decision != .undecided,
              let index = workspace.agentTaskLinks.firstIndex(where: { $0.id == linkID }) else {
            return false
        }
        objectWillChange.send()
        workspace.agentTaskLinks[index].completionDecision = decision
        scheduleSave(updateReminders: false)
        return true
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
        normalizePlan(allowLockedPlan: true)
        guard workspace.dailyPlan?.isLocked != true else { return }
        workspace.dailyPlan = makePlan(for: now())
        commit(replanIfUnlocked: false)
    }

    public func togglePlanLock() {
        normalizePlan(allowLockedPlan: true)
        workspace.dailyPlan?.isLocked.toggle()
        commit(replanIfUnlocked: false)
    }

    public func toggleCompletion(id: UUID) {
        normalizePlan(allowLockedPlan: true)
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id }) else { return }
        if workspace.tasks[index].status == .completed {
            workspace.tasks[index].status = .planned
            workspace.tasks[index].completedAt = nil
            workspace.tasks[index].waitingOn = nil
            workspace.tasks[index].reviewAt = nil
            workspace.tasks[index].updatedAt = now()
            workspace.tasks.removeAll {
                $0.recurrenceSourceID == id && $0.isOpen
            }
        } else {
            workspace.tasks[index].status = .completed
            workspace.tasks[index].completedAt = now()
            let nextTask = nextRecurringTask(after: workspace.tasks[index])
            workspace.tasks[index].reminderAt = nil
            if let nextTask {
                workspace.tasks.append(nextTask)
            }
            workspace.tasks[index].updatedAt = now()
        }
        commit(replanIfUnlocked: false)
    }

    public func start(id: UUID) {
        guard task(id: id)?.isOpen == true else { return }
        normalizePlan(allowLockedPlan: true)
        for index in workspace.tasks.indices where workspace.tasks[index].status == .active {
            workspace.tasks[index].status = .planned
            workspace.tasks[index].updatedAt = now()
        }
        placeInToday(id: id, status: .active)
    }

    public func moveToToday(id: UUID) {
        placeInToday(id: id, status: task(id: id)?.status == .active ? .active : .planned)
    }

    private func placeInToday(id: UUID, status: TaskStatus) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id && $0.isOpen }) else { return }
        normalizePlan(allowLockedPlan: true)
        workspace.tasks[index].status = status
        workspace.tasks[index].isPinnedToday = true
        workspace.tasks[index].scheduledFor = calendar.startOfDay(for: now())
        workspace.tasks[index].deferredUntil = nil
        workspace.tasks[index].waitingOn = nil
        workspace.tasks[index].reviewAt = nil
        workspace.tasks[index].updatedAt = now()
        if workspace.dailyPlan?.entries.contains(where: { $0.taskID == id }) != true {
            workspace.dailyPlan?.entries.append(PlanEntry(taskID: id, reason: "Added to today", score: 640))
        }
        commit(replanIfUnlocked: false)
    }

    /// Replace one commitment in place, changing both tasks in a single workspace save.
    public func replaceTodayTask(id: UUID, with replacementID: UUID, rescheduleFor date: Date, expectedDay: Date) throws {
        let current = now()
        let today = calendar.startOfDay(for: current)
        guard calendar.isDate(expectedDay, inSameDayAs: today),
              let plan = workspace.dailyPlan, calendar.isDate(plan.day, inSameDayAs: today) else {
            throw LedgerActionError("The day changed. Close this sheet and review today's plan again.")
        }
        guard let position = plan.entries.firstIndex(where: { $0.taskID == id }),
              let outgoing = workspace.tasks.firstIndex(where: { $0.id == id && $0.isOpen }),
              workspace.tasks[outgoing].status != .waiting else {
            throw LedgerActionError("This task is no longer available on today's plan.")
        }
        guard replacementID != id,
              !plan.entries.contains(where: { $0.taskID == replacementID }),
              let incoming = workspace.tasks.firstIndex(where: { $0.id == replacementID && $0.isOpen }),
              workspace.tasks[incoming].status != .waiting else {
            throw LedgerActionError("Choose an open task outside today's plan. Resume waiting work before choosing it.")
        }
        let futureDay = calendar.startOfDay(for: date)
        guard futureDay > today else {
            throw LedgerActionError("Schedule the outgoing task for tomorrow or a later date.")
        }
        workspace.tasks[outgoing].status = .planned
        workspace.tasks[outgoing].scheduledFor = futureDay
        workspace.tasks[outgoing].isPinnedToday = false
        workspace.tasks[outgoing].deferredUntil = nil
        workspace.tasks[outgoing].updatedAt = current
        if workspace.tasks[incoming].status != .active { workspace.tasks[incoming].status = .planned }
        workspace.tasks[incoming].scheduledFor = today
        workspace.tasks[incoming].isPinnedToday = true
        workspace.tasks[incoming].deferredUntil = nil
        workspace.tasks[incoming].updatedAt = current
        workspace.dailyPlan?.entries[position] = PlanEntry(taskID: replacementID, reason: "Replaced a task in today's plan", score: 640)
        commit(replanIfUnlocked: false)
    }

    public func scheduleTask(id: UUID, for date: Date) throws {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id && $0.isOpen }) else {
            throw LedgerActionError("This task is no longer open.")
        }
        guard workspace.tasks[index].status != .waiting else {
            throw LedgerActionError("Resume this waiting task before scheduling work.")
        }
        let day = calendar.startOfDay(for: date)
        guard day >= calendar.startOfDay(for: now()) else {
            throw LedgerActionError("Choose today or a future date.")
        }
        normalizePlan(allowLockedPlan: true)
        if calendar.isDate(day, inSameDayAs: now()) {
            moveToToday(id: id)
            return
        }
        workspace.tasks[index].status = .planned
        workspace.tasks[index].scheduledFor = day
        workspace.tasks[index].isPinnedToday = false
        workspace.tasks[index].deferredUntil = nil
        workspace.tasks[index].updatedAt = now()
        workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
        commit(replanIfUnlocked: false)
    }

    public func waitForTask(id: UUID, reason: String, reviewAt: Date?) throws {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id && $0.isOpen }) else {
            throw LedgerActionError("This task is no longer open.")
        }
        let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanReason.isEmpty else { throw LedgerActionError("Describe what you are waiting for.") }
        let reviewDay = reviewAt.map { calendar.startOfDay(for: $0) }
        if let reviewDay, reviewDay < calendar.startOfDay(for: now()),
           reviewDay != workspace.tasks[index].reviewAt {
            throw LedgerActionError("Choose today or a future review date.")
        }
        normalizePlan(allowLockedPlan: true)
        workspace.tasks[index].status = .waiting
        workspace.tasks[index].waitingOn = cleanReason
        workspace.tasks[index].reviewAt = reviewDay
        workspace.tasks[index].isPinnedToday = false
        workspace.tasks[index].updatedAt = now()
        workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
        commit(replanIfUnlocked: false)
    }

    public func resumeTask(id: UUID) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id && $0.status == .waiting }) else { return }
        workspace.tasks[index].status = .planned
        workspace.tasks[index].waitingOn = nil
        workspace.tasks[index].reviewAt = nil
        workspace.tasks[index].deferredUntil = nil
        workspace.tasks[index].updatedAt = now()
        commit(replanIfUnlocked: false)
    }

    public func moveToTomorrow(id: UUID) {
        do {
            guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: now()) else {
                throw LedgerActionError("Could not determine tomorrow's date.")
            }
            try scheduleTask(id: id, for: tomorrow)
        } catch {
            persistenceState = .failed(error.localizedDescription)
        }
    }

    public func deferTask(id: UUID, days: Int = 3) {
        guard task(id: id)?.status != .waiting else { return }
        let deferred = calendar.date(byAdding: .day, value: days, to: calendar.startOfDay(for: now()))
        mutateTask(id: id, removeFromLockedPlan: true) { task in
            task.status = .deferred
            task.isPinnedToday = false
            task.deferredUntil = deferred
        }
    }

    public func moveToLongTerm(id: UUID) {
        mutateTask(id: id, removeFromLockedPlan: true) { task in
            if task.status != .waiting { task.status = .planned }
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
        horizon: TaskHorizon,
        scheduledFor: Date?,
        dueAt: Date?,
        recurrence: TaskRecurrence?,
        reminderAt: Date?
    ) {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { return }
        let movesOut = scheduledFor.map { calendar.startOfDay(for: $0) > calendar.startOfDay(for: now()) } ?? false
        mutateTask(id: id, removeFromLockedPlan: movesOut) { task in
            task.title = cleanTitle
            task.notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
            task.projectID = projectID
            task.priority = priority
            task.estimateMinutes = max(5, estimateMinutes)
            task.horizon = horizon
            task.scheduledFor = scheduledFor.map { calendar.startOfDay(for: $0) }
            if movesOut {
                task.isPinnedToday = false
                if task.status == .active { task.status = .planned }
            }
            task.dueAt = dueAt.map { calendar.startOfDay(for: $0) }
            task.recurrence = recurrence
            task.reminderAt = reminderAt
        }
    }

    @discardableResult
    public func addChecklistItem(taskID: UUID, title: String) -> LedgerChecklistItem? {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { return nil }
        let item = LedgerChecklistItem(title: cleanTitle)
        mutateTask(id: taskID) { task in
            task.checklistItems = (task.checklistItems ?? []) + [item]
        }
        return item
    }

    public func toggleChecklistItem(taskID: UUID, itemID: UUID) {
        mutateTask(id: taskID) { task in
            guard let index = task.checklistItems?.firstIndex(where: { $0.id == itemID }) else { return }
            task.checklistItems?[index].isCompleted.toggle()
        }
    }

    public func deleteChecklistItem(taskID: UUID, itemID: UUID) {
        mutateTask(id: taskID) { task in
            task.checklistItems?.removeAll { $0.id == itemID }
            if task.checklistItems?.isEmpty == true {
                task.checklistItems = nil
            }
        }
    }

    public func delete(id: UUID) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id }) else { return }
        workspace.tasks[index].statusBeforeTrash = workspace.tasks[index].status
        workspace.tasks[index].status = .cancelled
        workspace.tasks[index].updatedAt = now()
        workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
        commit(replanIfUnlocked: true)
    }

    public func restore(id: UUID) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id && $0.status == .cancelled }) else {
            return
        }
        workspace.tasks[index].status = workspace.tasks[index].statusBeforeTrash ?? .inbox
        workspace.tasks[index].statusBeforeTrash = nil
        workspace.tasks[index].updatedAt = now()
        commit(replanIfUnlocked: true)
    }

    public func permanentlyDelete(id: UUID) {
        workspace.tasks.removeAll { $0.id == id && $0.status == .cancelled }
        workspace.agentTaskLinks.removeAll { $0.taskID == id }
        workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
        commit(replanIfUnlocked: true)
    }

    @discardableResult
    public func createProject(name: String, symbol: String = "folder", goal: String? = nil) -> LedgerProject? {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return nil }
        if let existing = workspace.projects.first(where: {
            $0.name.localizedCaseInsensitiveCompare(cleanName) == .orderedSame
        }) {
            return existing
        }
        let project = LedgerProject(name: cleanName, symbol: symbol, goal: goal?.trimmingCharacters(in: .whitespacesAndNewlines))
        workspace.projects.append(project)
        commit(replanIfUnlocked: false)
        return project
    }

    public func updateProject(id: UUID, name: String, symbol: String, goal: String? = nil) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty,
              let index = workspace.projects.firstIndex(where: { $0.id == id }) else { return }
        workspace.projects[index].name = cleanName
        workspace.projects[index].symbol = symbol
        workspace.projects[index].goal = goal?.trimmingCharacters(in: .whitespacesAndNewlines)
        commit(replanIfUnlocked: false)
    }

    public func organizeInboxTask(id: UUID, destination: InboxDestination, projectID: UUID?) throws {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id && $0.isOpen }),
              workspace.tasks[index].status != .waiting else {
            throw LedgerActionError("This task is no longer available for Inbox organization.")
        }
        if let projectID, !workspace.projects.contains(where: { $0.id == projectID }) {
            throw LedgerActionError("This project no longer exists. Choose another project.")
        }
        if case .project = destination, projectID == nil {
            throw LedgerActionError("Choose a project, or give the task a date or long-term horizon.")
        }
        if case let .date(date) = destination,
           calendar.startOfDay(for: date) < calendar.startOfDay(for: now()) {
            throw LedgerActionError("Choose today or a future date.")
        }
        workspace.tasks[index].projectID = projectID
        switch destination {
        case .today:
            moveToToday(id: id)
        case let .date(date):
            try scheduleTask(id: id, for: date)
        case .longTerm:
            moveToLongTerm(id: id)
        case .project:
            workspace.tasks[index].status = .planned
            workspace.tasks[index].scheduledFor = nil
            workspace.tasks[index].deferredUntil = nil
            workspace.tasks[index].isPinnedToday = false
            workspace.tasks[index].horizon = .shortTerm
            workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
            workspace.tasks[index].updatedAt = now()
            // Choosing context alone is not a commitment to work today.
            commit(replanIfUnlocked: false)
        }
    }

    public func deleteProject(id: UUID) {
        workspace.projects.removeAll { $0.id == id }
        for index in workspace.tasks.indices where workspace.tasks[index].projectID == id {
            workspace.tasks[index].projectID = nil
            workspace.tasks[index].updatedAt = now()
        }
        commit(replanIfUnlocked: true)
    }

    public func updatePlanningPreferences(_ preferences: PlanningPreferences) {
        workspace.planningPreferences = preferences
        if workspace.dailyPlan?.isLocked != true {
            workspace.dailyPlan = makePlan(for: now())
        }
        commit(replanIfUnlocked: false)
    }

    public func exportData() throws -> Data {
        try WorkspaceCodec.encode(workspace)
    }

    public func importData(_ data: Data) throws {
        var imported = try WorkspaceCodec.decode(data)
        guard (1...LedgerWorkspace.currentSchemaVersion).contains(imported.schemaVersion) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        imported.schemaVersion = LedgerWorkspace.currentSchemaVersion
        workspace = imported
        persistenceEnabled = true
        if workspace.planningPreferences == nil {
            workspace.planningPreferences = .default
        }
        normalizePlan(allowLockedPlan: true)
        rebuildSnapshot()
        reminderRevision += 1
        scheduleSave()
    }

    @discardableResult
    public func flush() async -> Bool {
        guard persistenceEnabled else { return false }
        saveTask?.cancel()
        do {
            try await repository.save(workspace)
            persistenceState = .saved(now())
            return true
        } catch {
            persistenceState = .failed("Could not save: \(error.localizedDescription)")
            return false
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
        if removeFromLockedPlan {
            workspace.dailyPlan?.entries.removeAll { $0.taskID == id }
        }
        commit(replanIfUnlocked: !removeFromLockedPlan)
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

    private func migrateWorkspaceIfNeeded() {
        guard workspace.schemaVersion <= LedgerWorkspace.currentSchemaVersion else { return }
        workspace.schemaVersion = LedgerWorkspace.currentSchemaVersion
        let taskIDs = Set(workspace.tasks.map(\.id))
        workspace.agentTaskLinks.removeAll { !taskIDs.contains($0.taskID) }

        var activeTaskIDs = Set<UUID>()
        workspace.agentTaskLinks.sort { $0.linkedAt < $1.linkedAt }
        for index in workspace.agentTaskLinks.indices.reversed()
        where !workspace.agentTaskLinks[index].isTerminal {
            let taskID = workspace.agentTaskLinks[index].taskID
            if activeTaskIDs.contains(taskID) {
                workspace.agentTaskLinks.remove(at: index)
            } else {
                activeTaskIDs.insert(taskID)
            }
        }
    }

    private func normalizePlan(allowLockedPlan: Bool) {
        let currentDay = calendar.startOfDay(for: now())
        if let plan = workspace.dailyPlan,
           calendar.isDate(plan.day, inSameDayAs: currentDay),
           (allowLockedPlan || !plan.isLocked) {
            return
        }
        if workspace.dailyPlan != nil {
            for index in workspace.tasks.indices where workspace.tasks[index].isPinnedToday {
                let scheduled = workspace.tasks[index].scheduledFor
                if scheduled.map({ calendar.isDate($0, inSameDayAs: currentDay) }) != true {
                    workspace.tasks[index].isPinnedToday = false
                }
            }
        }
        workspace.dailyPlan = makePlan(for: currentDay)
    }

    private func removeLegacyPreviewSeedIfNeeded() {
        let previewProjects = workspace.projects.filter {
            legacyPreviewProjectSignatures.contains("\($0.name)|\($0.symbol)")
        }
        guard previewProjects.count == legacyPreviewProjectSignatures.count else { return }

        let previewProjectIDs = Set(previewProjects.map(\.id))
        let fixtureTaskIDs = Set(workspace.tasks.compactMap { task -> UUID? in
            guard legacyPreviewTaskTitles.contains(task.title) else { return nil }
            if let projectID = task.projectID {
                return previewProjectIDs.contains(projectID) ? task.id : nil
            }
            return task.title == "Look at notification permission wording" ? task.id : nil
        })
        guard fixtureTaskIDs.count >= 12 else { return }

        workspace.tasks.removeAll { fixtureTaskIDs.contains($0.id) }
        workspace.dailyPlan = nil

        let retainedProjectIDs = Set(workspace.tasks.compactMap(\.projectID))
        workspace.projects.removeAll {
            previewProjectIDs.contains($0.id) && !retainedProjectIDs.contains($0.id)
        }
    }

    private func commit(replanIfUnlocked: Bool) {
        normalizePlan(allowLockedPlan: true)
        if replanIfUnlocked, workspace.dailyPlan?.isLocked != true {
            workspace.dailyPlan = makePlan(for: now())
        }
        rebuildSnapshot()
        scheduleSave()
    }

    private func rebuildSnapshot() {
        let tasksByID = Dictionary(uniqueKeysWithValues: workspace.tasks.map { ($0.id, $0) })
        let nextTodayRows: [PlannedTaskRow] = (workspace.dailyPlan?.entries ?? []).compactMap { entry in
            guard let task = tasksByID[entry.taskID] else { return nil }
            return PlannedTaskRow(task: task, reason: entry.reason, score: entry.score)
        }

        let today = calendar.startOfDay(for: now())
        let weekEnd = calendar.date(byAdding: .day, value: 7, to: today) ?? today

        let nextInboxTasks = workspace.tasks
            .filter { $0.status == .inbox && $0.isOpen }
            .sorted { $0.createdAt > $1.createdAt }

        let nextUpcomingTasks = workspace.tasks
            .filter { task in
                guard task.isOpen else { return false }
                let nextDate = task.scheduledFor ?? task.dueAt
                return nextDate.map { calendar.startOfDay(for: $0) > today } ?? false
            }
            .sorted(by: taskComesFirst)

        let todayIDs = Set(nextTodayRows.map(\.id))
        let nextShortTermTasks = workspace.tasks
            .filter { task in
                guard task.isOpen, task.horizon == .shortTerm, !todayIDs.contains(task.id) else { return false }
                let nextDate = task.dueAt ?? task.scheduledFor
                guard let nextDate else { return false }
                let day = calendar.startOfDay(for: nextDate)
                return day > today && day <= weekEnd
            }
            .sorted(by: taskComesFirst)

        let nextLongTermTasks = workspace.tasks
            .filter { $0.isOpen && $0.horizon == .longTerm }
            .sorted(by: taskComesFirst)

        let nextCompletedToday = workspace.tasks
            .filter { task in
                guard task.status == .completed, let completedAt = task.completedAt else { return false }
                return calendar.isDate(completedAt, inSameDayAs: today)
            }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }

        let nextTrashedTasks = workspace.tasks
            .filter { $0.status == .cancelled }
            .sorted { $0.updatedAt > $1.updatedAt }

        snapshot = LedgerSnapshot(
            todayRows: nextTodayRows,
            inboxTasks: nextInboxTasks,
            upcomingTasks: nextUpcomingTasks,
            shortTermTasks: nextShortTermTasks,
            longTermTasks: nextLongTermTasks,
            completedToday: nextCompletedToday,
            trashedTasks: nextTrashedTasks
        )
    }

    private func scheduleSave(updateReminders: Bool = true) {
        guard persistenceEnabled else { return }
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
        if updateReminders {
            reminderRevision += 1
        }
    }

    private func makePlan(for date: Date) -> DailyPlan {
        let tasksByID = Dictionary(uniqueKeysWithValues: workspace.tasks.map { ($0.id, $0) })
        let existing = workspace.dailyPlan.flatMap { calendar.isDate($0.day, inSameDayAs: date) ? $0 : nil }
        let completed = (existing?.entries ?? []).compactMap { entry in
            tasksByID[entry.taskID].flatMap { $0.status == .completed ? $0 : nil }
        }
        var planner = DailyPlanner(preferences: planningPreferences, calendar: calendar)
        planner.minuteBudget -= completed.reduce(0) { $0 + $1.estimateMinutes }
        planner.maximumTasks = max(0, planner.maximumTasks - completed.count)
        let generated = planner.makePlan(tasks: workspace.tasks, for: date)
        guard let existing else { return generated }
        var generatedByID = Dictionary(uniqueKeysWithValues: generated.entries.map { ($0.taskID, $0) })
        var merged: [PlanEntry] = []

        for entry in existing.entries {
            if tasksByID[entry.taskID]?.status == .completed {
                merged.append(entry)
            } else if let refreshed = generatedByID.removeValue(forKey: entry.taskID) {
                merged.append(refreshed)
            }
        }

        for entry in generated.entries
        where generatedByID[entry.taskID] != nil {
            merged.append(entry)
            generatedByID.removeValue(forKey: entry.taskID)
        }

        return DailyPlan(
            day: generated.day,
            entries: merged,
            isLocked: existing.isLocked,
            generatedAt: generated.generatedAt
        )
    }

    private func nextRecurringTask(after task: LedgerTask) -> LedgerTask? {
        guard let recurrence = task.recurrence else { return nil }
        let anchor = task.scheduledFor ?? task.dueAt ?? calendar.startOfDay(for: now())
        guard let nextAnchor = nextDate(after: anchor, recurrence: recurrence) else { return nil }

        func advanced(_ date: Date?) -> Date? {
            guard let date else { return nil }
            return nextDate(after: date, recurrence: recurrence)
        }

        return LedgerTask(
            title: task.title,
            notes: task.notes,
            projectID: task.projectID,
            status: .planned,
            priority: task.priority,
            horizon: task.horizon,
            estimateMinutes: task.estimateMinutes,
            scheduledFor: task.scheduledFor == nil && task.dueAt == nil
                ? nextAnchor
                : advanced(task.scheduledFor),
            dueAt: advanced(task.dueAt),
            deferredUntil: nil,
            isPinnedToday: false,
            createdAt: now(),
            updatedAt: now(),
            recurrence: recurrence,
            reminderAt: advanced(task.reminderAt),
            recurrenceSourceID: task.id,
            checklistItems: task.checklistItems?.map {
                LedgerChecklistItem(title: $0.title)
            }
        )
    }

    private func nextDate(after date: Date, recurrence: TaskRecurrence) -> Date? {
        switch recurrence {
        case .daily:
            return calendar.date(byAdding: .day, value: 1, to: date)
        case .weekdays:
            var candidate = date
            repeat {
                guard let next = calendar.date(byAdding: .day, value: 1, to: candidate) else { return nil }
                candidate = next
            } while calendar.isDateInWeekend(candidate)
            return candidate
        case .weekly:
            return calendar.date(byAdding: .weekOfYear, value: 1, to: date)
        case .monthly:
            return calendar.date(byAdding: .month, value: 1, to: date)
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
