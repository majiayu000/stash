import Foundation

public enum InboxDestination: Sendable {
    case today
    case date(Date)
    case longTerm
    case project
}

/// A projection of existing tasks; choosing a next step never duplicates work.
public struct ProjectWorkflow: Sendable {
    public let ready: [LedgerTask]
    public let waiting: [LedgerTask]
    public let later: [LedgerTask]
    public let inbox: [LedgerTask]
    public let completedCount: Int

    public init(tasks: [LedgerTask], now: Date, calendar: Calendar) {
        let today = calendar.startOfDay(for: now)
        var ready: [LedgerTask] = []
        var waiting: [LedgerTask] = []
        var later: [LedgerTask] = []
        var inbox: [LedgerTask] = []
        for task in tasks where task.isOpen {
            if task.status == .waiting { waiting.append(task) }
            else if task.status == .inbox { inbox.append(task) }
            else if task.status == .active || task.isPinnedToday { ready.append(task) }
            else if task.scheduledFor.map({ calendar.startOfDay(for: $0) > today }) == true
                || task.deferredUntil.map({ calendar.startOfDay(for: $0) > today }) == true
                || (task.horizon == .longTerm && task.scheduledFor == nil) {
                later.append(task)
            } else { ready.append(task) }
        }
        self.ready = ready
        self.waiting = waiting
        self.later = later
        self.inbox = inbox
        completedCount = tasks.filter { $0.status == .completed }.count
    }

    public var guidance: String {
        if !ready.isEmpty { return "Choose a task below as your next step." }
        if !inbox.isEmpty { return "Decide when to work on the captured tasks below." }
        if !later.isEmpty { return "Nothing ready now. Review a later task to choose your next step." }
        if !waiting.isEmpty { return "All open work is waiting. Review what you are waiting for." }
        return completedCount > 0 ? "No open tasks. \(completedCount) completed." : "No open tasks. Capture the first step for this project."
    }
}
