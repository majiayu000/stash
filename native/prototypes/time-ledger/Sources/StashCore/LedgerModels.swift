import Foundation

public enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case inbox
    case planned
    case active
    case completed
    case deferred
    case cancelled
}

public enum TaskPriority: Int, Codable, CaseIterable, Comparable, Sendable {
    case p0 = 0
    case p1 = 1
    case p2 = 2
    case p3 = 3

    public static func < (lhs: TaskPriority, rhs: TaskPriority) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    public var label: String { "P\(rawValue)" }
}

public enum TaskHorizon: String, Codable, CaseIterable, Sendable {
    case shortTerm
    case longTerm

    public var label: String {
        switch self {
        case .shortTerm: "Short term"
        case .longTerm: "Long term"
        }
    }
}

public struct LedgerProject: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var name: String
    public var symbol: String
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        symbol: String = "folder",
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.symbol = symbol
        self.createdAt = createdAt
    }
}

public struct LedgerTask: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var title: String
    public var notes: String
    public var projectID: UUID?
    public var status: TaskStatus
    public var priority: TaskPriority
    public var horizon: TaskHorizon
    public var estimateMinutes: Int
    public var scheduledFor: Date?
    public var dueAt: Date?
    public var deferredUntil: Date?
    public var isPinnedToday: Bool
    public var createdAt: Date
    public var updatedAt: Date
    public var completedAt: Date?

    public init(
        id: UUID = UUID(),
        title: String,
        notes: String = "",
        projectID: UUID? = nil,
        status: TaskStatus = .inbox,
        priority: TaskPriority = .p2,
        horizon: TaskHorizon = .shortTerm,
        estimateMinutes: Int = 30,
        scheduledFor: Date? = nil,
        dueAt: Date? = nil,
        deferredUntil: Date? = nil,
        isPinnedToday: Bool = false,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.notes = notes
        self.projectID = projectID
        self.status = status
        self.priority = priority
        self.horizon = horizon
        self.estimateMinutes = max(5, estimateMinutes)
        self.scheduledFor = scheduledFor
        self.dueAt = dueAt
        self.deferredUntil = deferredUntil
        self.isPinnedToday = isPinnedToday
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.completedAt = completedAt
    }

    public var isOpen: Bool {
        status != .completed && status != .cancelled
    }
}

public struct PlanEntry: Identifiable, Codable, Equatable, Sendable {
    public var id: UUID { taskID }
    public let taskID: UUID
    public let reason: String
    public let score: Int

    public init(taskID: UUID, reason: String, score: Int) {
        self.taskID = taskID
        self.reason = reason
        self.score = score
    }
}

public struct DailyPlan: Codable, Equatable, Sendable {
    public var day: Date
    public var entries: [PlanEntry]
    public var isLocked: Bool
    public var generatedAt: Date

    public init(
        day: Date,
        entries: [PlanEntry],
        isLocked: Bool = false,
        generatedAt: Date = .now
    ) {
        self.day = day
        self.entries = entries
        self.isLocked = isLocked
        self.generatedAt = generatedAt
    }
}

public struct LedgerWorkspace: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var projects: [LedgerProject]
    public var tasks: [LedgerTask]
    public var dailyPlan: DailyPlan?

    public init(
        schemaVersion: Int = 1,
        projects: [LedgerProject] = [],
        tasks: [LedgerTask] = [],
        dailyPlan: DailyPlan? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.projects = projects
        self.tasks = tasks
        self.dailyPlan = dailyPlan
    }
}

public extension Calendar {
    func stashStartOfDay(for date: Date) -> Date {
        startOfDay(for: date)
    }

    func stashIsSameDay(_ lhs: Date, _ rhs: Date) -> Bool {
        isDate(lhs, inSameDayAs: rhs)
    }
}
