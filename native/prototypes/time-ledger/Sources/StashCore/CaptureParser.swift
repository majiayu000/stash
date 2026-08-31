import Foundation

public struct ParsedCapture: Equatable, Sendable {
    public var title: String
    public var projectName: String?
    public var priority: TaskPriority
    public var scheduledFor: Date?
    public var estimateMinutes: Int

    public init(
        title: String,
        projectName: String? = nil,
        priority: TaskPriority = .p2,
        scheduledFor: Date? = nil,
        estimateMinutes: Int = 30
    ) {
        self.title = title
        self.projectName = projectName
        self.priority = priority
        self.scheduledFor = scheduledFor
        self.estimateMinutes = estimateMinutes
    }
}

public struct CaptureParser: Sendable {
    public var calendar: Calendar

    public init(calendar: Calendar = .current) {
        self.calendar = calendar
    }

    public func parse(_ raw: String, now: Date = .now) -> ParsedCapture? {
        let pieces = raw.split(whereSeparator: \Character.isWhitespace).map(String.init)
        guard !pieces.isEmpty else { return nil }

        var titleWords: [String] = []
        var projectName: String?
        var priority: TaskPriority = .p2
        var scheduledFor: Date?
        var estimateMinutes = 30

        for piece in pieces {
            let lower = piece.lowercased()
            if lower.hasPrefix("#"), piece.count > 1 {
                projectName = String(piece.dropFirst())
            } else if let parsedPriority = parsePriority(lower) {
                priority = parsedPriority
            } else if lower == "!today" {
                scheduledFor = calendar.startOfDay(for: now)
            } else if lower == "!tomorrow" {
                scheduledFor = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
            } else if let parsedEstimate = parseEstimate(lower) {
                estimateMinutes = parsedEstimate
            } else {
                titleWords.append(piece)
            }
        }

        let title = titleWords.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return nil }

        return ParsedCapture(
            title: title,
            projectName: projectName,
            priority: priority,
            scheduledFor: scheduledFor,
            estimateMinutes: estimateMinutes
        )
    }

    private func parsePriority(_ token: String) -> TaskPriority? {
        guard token.count == 3, token.hasPrefix("^p"), let value = Int(token.dropFirst(2)) else {
            return nil
        }
        return TaskPriority(rawValue: value)
    }

    private func parseEstimate(_ token: String) -> Int? {
        guard token.hasPrefix("*"), token.count > 2 else { return nil }
        let payload = token.dropFirst()
        guard let suffix = payload.last else { return nil }
        guard let value = Int(payload.dropLast()), value > 0 else { return nil }
        switch suffix {
        case "m": return value
        case "h": return value * 60
        default: return nil
        }
    }
}
