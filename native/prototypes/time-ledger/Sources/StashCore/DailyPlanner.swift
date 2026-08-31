import Foundation

public struct DailyPlanner: Sendable {
    public var minimumTasks: Int
    public var maximumTasks: Int
    public var minuteBudget: Int
    public var includeInbox: Bool
    public var calendar: Calendar

    public init(
        minimumTasks: Int = 5,
        maximumTasks: Int = 8,
        minuteBudget: Int = 360,
        includeInbox: Bool = true,
        calendar: Calendar = .current
    ) {
        self.minimumTasks = minimumTasks
        self.maximumTasks = maximumTasks
        self.minuteBudget = minuteBudget
        self.includeInbox = includeInbox
        self.calendar = calendar
    }

    public init(preferences: PlanningPreferences, calendar: Calendar = .current) {
        self.init(
            minimumTasks: preferences.minimumTasks,
            maximumTasks: preferences.maximumTasks,
            minuteBudget: preferences.minuteBudget,
            includeInbox: preferences.includeInbox,
            calendar: calendar
        )
    }

    public func makePlan(tasks: [LedgerTask], for date: Date) -> DailyPlan {
        let day = calendar.startOfDay(for: date)
        let nextDay = calendar.date(byAdding: .day, value: 1, to: day) ?? day.addingTimeInterval(86_400)
        let dueSoonEnd = calendar.date(byAdding: .day, value: 8, to: day)
            ?? day.addingTimeInterval(8 * 86_400)
        let ageCutoffs = (1...90).compactMap {
            calendar.date(byAdding: .day, value: -$0, to: day)
        }
        var candidates: [Candidate] = []
        candidates.reserveCapacity(tasks.count)
        for task in tasks {
            if let candidate = candidate(
                for: task,
                day: day,
                nextDay: nextDay,
                dueSoonEnd: dueSoonEnd,
                ageCutoffs: ageCutoffs
            ) {
                candidates.append(candidate)
            }
        }
        var chosen: [Candidate] = []
        chosen.reserveCapacity(min(maximumTasks, candidates.count))
        var minutes = 0
        var selectedPrefixCount = 0

        while chosen.count < maximumTasks, selectedPrefixCount < candidates.count {
            let mustFillMinimum = chosen.count < minimumTasks
            var bestIndex: Int?
            for index in selectedPrefixCount..<candidates.count {
                let candidate = candidates[index]
                let estimate = max(5, candidate.task.estimateMinutes)
                guard mustFillMinimum || minutes + estimate <= minuteBudget else { continue }
                if let currentBest = bestIndex {
                    if candidateComesFirst(candidate, candidates[currentBest]) {
                        bestIndex = index
                    }
                } else {
                    bestIndex = index
                }
            }
            guard let bestIndex else { break }
            candidates.swapAt(selectedPrefixCount, bestIndex)
            let candidate = candidates[selectedPrefixCount]
            chosen.append(candidate)
            minutes += max(5, candidate.task.estimateMinutes)
            selectedPrefixCount += 1
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

    private func candidate(
        for task: LedgerTask,
        day: Date,
        nextDay: Date,
        dueSoonEnd: Date,
        ageCutoffs: [Date]
    ) -> Candidate? {
        guard task.isOpen, includeInbox || task.status != .inbox else { return nil }
        if let deferredUntil = task.deferredUntil,
           deferredUntil >= nextDay {
            return nil
        }

        let scheduledDay = task.scheduledFor.map { calendar.startOfDay(for: $0) }
        let dueDay = task.dueAt.map { calendar.startOfDay(for: $0) }
        let isScheduledNow = scheduledDay.map { $0 <= day } ?? false
        let isOverdue = dueDay.map { $0 < day } ?? false
        let isDueToday = dueDay == day
        let isDueSoon = dueDay.map { $0 < dueSoonEnd } ?? false

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

        score += ageInDays(task.createdAt, cutoffs: ageCutoffs)

        return Candidate(
            task: task,
            score: score,
            reason: leadingReason,
            deadline: dueDay ?? scheduledDay ?? .distantFuture
        )
    }

    private func ageInDays(_ createdAt: Date, cutoffs: [Date]) -> Int {
        var lowerBound = 0
        var upperBound = cutoffs.count
        while lowerBound < upperBound {
            let midpoint = (lowerBound + upperBound) / 2
            if createdAt <= cutoffs[midpoint] {
                lowerBound = midpoint + 1
            } else {
                upperBound = midpoint
            }
        }
        return lowerBound
    }

    private func candidateComesFirst(_ lhs: Candidate, _ rhs: Candidate) -> Bool {
        if lhs.score != rhs.score { return lhs.score > rhs.score }
        if lhs.deadline != rhs.deadline { return lhs.deadline < rhs.deadline }
        if lhs.task.createdAt != rhs.task.createdAt { return lhs.task.createdAt < rhs.task.createdAt }
        return lhs.task.id.uuidString < rhs.task.id.uuidString
    }
}
