import Foundation

public struct DailyPlanner: Sendable {
    public var minimumTasks: Int
    public var maximumTasks: Int
    public var minuteBudget: Int
    public var calendar: Calendar

    public init(
        minimumTasks: Int = 5,
        maximumTasks: Int = 8,
        minuteBudget: Int = 360,
        calendar: Calendar = .current
    ) {
        self.minimumTasks = minimumTasks
        self.maximumTasks = maximumTasks
        self.minuteBudget = minuteBudget
        self.calendar = calendar
    }

    public func makePlan(tasks: [LedgerTask], for date: Date) -> DailyPlan {
        let day = calendar.startOfDay(for: date)
        let candidates = tasks.compactMap { candidate(for: $0, day: day) }
            .sorted(by: candidateComesFirst)

        var chosen: [Candidate] = []
        var minutes = 0

        for candidate in candidates {
            guard chosen.count < maximumTasks else { break }
            let estimate = max(5, candidate.task.estimateMinutes)
            let mustFillMinimum = chosen.count < minimumTasks
            if mustFillMinimum || minutes + estimate <= minuteBudget {
                chosen.append(candidate)
                minutes += estimate
            }
        }

        return DailyPlan(
            day: day,
            entries: chosen.map {
                PlanEntry(taskID: $0.task.id, reason: $0.reason, score: $0.score)
            }
        )
    }

    private struct Candidate {
        let task: LedgerTask
        let score: Int
        let reason: String
        let deadline: Date
    }

    private func candidate(for task: LedgerTask, day: Date) -> Candidate? {
        guard task.isOpen else { return nil }
        if let deferredUntil = task.deferredUntil,
           calendar.startOfDay(for: deferredUntil) > day {
            return nil
        }

        let scheduled = task.scheduledFor.map { calendar.startOfDay(for: $0) }
        let due = task.dueAt.map { calendar.startOfDay(for: $0) }
        let dueSoonCutoff = calendar.date(byAdding: .day, value: 7, to: day) ?? day
        let isScheduledNow = scheduled.map { $0 <= day } ?? false
        let isOverdue = due.map { $0 < day } ?? false
        let isDueToday = due.map { $0 == day } ?? false
        let isDueSoon = due.map { $0 <= dueSoonCutoff } ?? false

        if task.horizon == .longTerm,
           task.status != .active,
           !task.isPinnedToday,
           !isScheduledNow,
           !isDueSoon {
            return nil
        }

        var score = 0
        var leadingReason = "Old unfinished work"
        var leadingWeight = 0

        func add(_ weight: Int, reason: String) {
            score += weight
            if weight > leadingWeight {
                leadingWeight = weight
                leadingReason = reason
            }
        }

        if task.status == .active { add(1_000, reason: "Already in progress") }
        if isOverdue { add(850, reason: "Overdue") }
        if isDueToday { add(800, reason: "Due today") }
        if isScheduledNow { add(720, reason: "Scheduled for today") }
        if task.isPinnedToday { add(640, reason: "Pinned to today") }

        switch task.priority {
        case .p0: add(420, reason: "Critical priority")
        case .p1: add(260, reason: "High priority")
        case .p2: add(80, reason: "Normal priority")
        case .p3: break
        }

        if isDueSoon && !isDueToday && !isOverdue {
            add(170, reason: "Due within seven days")
        }

        let ageDays = max(0, calendar.dateComponents([.day], from: task.createdAt, to: day).day ?? 0)
        score += min(ageDays, 90)

        return Candidate(
            task: task,
            score: score,
            reason: leadingReason,
            deadline: due ?? scheduled ?? .distantFuture
        )
    }

    private func candidateComesFirst(_ lhs: Candidate, _ rhs: Candidate) -> Bool {
        if lhs.score != rhs.score { return lhs.score > rhs.score }
        if lhs.deadline != rhs.deadline { return lhs.deadline < rhs.deadline }
        if lhs.task.createdAt != rhs.task.createdAt { return lhs.task.createdAt < rhs.task.createdAt }
        return lhs.task.id.uuidString < rhs.task.id.uuidString
    }
}
