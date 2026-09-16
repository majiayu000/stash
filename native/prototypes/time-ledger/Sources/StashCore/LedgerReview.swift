import Foundation

public struct LedgerActionError: LocalizedError {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}

public struct ReviewProjectGroup: Identifiable, Sendable {
    public let id: UUID?
    public let name: String
    public let tasks: [LedgerTask]
}

/// Completion facts are filtered by week; open/waiting tasks reflect current state.
public struct LedgerWeekReview: Sendable {
    public let interval: DateInterval
    public let nextWeek: DateInterval
    public let completedGroups: [ReviewProjectGroup]
    public let openTasks: [LedgerTask]
    public let waitingTasks: [LedgerTask]
    public let scheduledNextWeek: [LedgerTask]
    public let calendar: Calendar

    public init(workspace: LedgerWorkspace, anchor: Date, calendar: Calendar) throws {
        guard let interval = calendar.dateInterval(of: .weekOfYear, for: anchor),
              let nextWeek = calendar.dateInterval(of: .weekOfYear, for: interval.end) else {
            throw LedgerActionError("Could not determine the selected week.")
        }
        self.interval = interval
        self.nextWeek = nextWeek
        self.calendar = calendar
        let completed = workspace.tasks.filter {
            $0.status == .completed && $0.completedAt.map { $0 >= interval.start && $0 < interval.end } == true
        }.sorted {
            if $0.completedAt != $1.completedAt { return ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
            return $0.id.uuidString < $1.id.uuidString
        }
        let projectNames = Dictionary(uniqueKeysWithValues: workspace.projects.map { ($0.id, $0.name) })
        completedGroups = Dictionary(grouping: completed, by: \.projectID).map { id, tasks in
            ReviewProjectGroup(id: id, name: id.flatMap { projectNames[$0] } ?? "No project", tasks: tasks)
        }.sorted {
            if $0.name != $1.name { return $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            return ($0.id?.uuidString ?? "") < ($1.id?.uuidString ?? "")
        }
        openTasks = workspace.tasks.filter { $0.isOpen && $0.status != .waiting }.sorted {
            if $0.priority != $1.priority { return $0.priority < $1.priority }
            if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
            return $0.id.uuidString < $1.id.uuidString
        }
        waitingTasks = workspace.tasks.filter { $0.status == .waiting }.sorted {
            if $0.reviewAt != $1.reviewAt { return ($0.reviewAt ?? .distantFuture) < ($1.reviewAt ?? .distantFuture) }
            return $0.id.uuidString < $1.id.uuidString
        }
        scheduledNextWeek = workspace.tasks.filter {
            $0.isOpen && $0.status != .waiting && $0.scheduledFor.map { $0 >= nextWeek.start && $0 < nextWeek.end } == true
        }.sorted {
            if $0.scheduledFor != $1.scheduledFor { return ($0.scheduledFor ?? .distantFuture) < ($1.scheduledFor ?? .distantFuture) }
            return $0.id.uuidString < $1.id.uuidString
        }
    }

    public var rangeLabel: String { rangeLabel(for: interval) }
    public var nextWeekLabel: String { rangeLabel(for: nextWeek) }

    public func dateLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func rangeLabel(for range: DateInterval) -> String {
        // End is exclusive; one instant before it is still on the final calendar day.
        "\(dateLabel(range.start)) – \(dateLabel(range.end.addingTimeInterval(-1)))"
    }

    public var markdown: String {
        var lines = ["# Stash weekly review", "", rangeLabel, "", "## Completed in selected week", ""]
        if completedGroups.isEmpty { lines.append("No completed tasks in this week.") }
        for group in completedGroups {
            lines += ["### \(Self.markdownText(group.name))", ""]
            lines += group.tasks.map { "- [x] \(Self.markdownText($0.title))" }
            lines.append("")
        }
        lines += ["", "## Currently waiting", "", "Current task state, not a historical snapshot.", ""]
        if waitingTasks.isEmpty { lines.append("Nothing is waiting.") }
        for task in waitingTasks {
            let revisit = task.reviewAt.map { " · review \(dateLabel($0))" } ?? " · no review date"
            lines.append("- \(Self.markdownText(task.title)): \(Self.markdownText(task.waitingOn ?? ""))\(revisit)")
        }
        lines += ["", "## Scheduled for \(nextWeekLabel)", "", "Current schedule for the week after the selected week.", ""]
        if scheduledNextWeek.isEmpty { lines.append("No tasks scheduled.") }
        for task in scheduledNextWeek {
            if let date = task.scheduledFor { lines.append("- [ ] \(dateLabel(date)) · \(Self.markdownText(task.title))") }
        }
        return lines.joined(separator: "\n") + "\n"
    }

    private static func markdownText(_ text: String) -> String {
        let singleLine = text.components(separatedBy: .newlines).joined(separator: " ")
        return singleLine.reduce(into: "") { result, character in
            if "\\`*_{}[]<>#|".contains(character) { result.append("\\") }
            result.append(character)
        }
    }
}
