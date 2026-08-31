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

public enum TaskRecurrence: String, Codable, CaseIterable, Sendable {
    case daily
    case weekdays
    case weekly
    case monthly

    public var label: String {
        switch self {
        case .daily: "Daily"
        case .weekdays: "Weekdays"
        case .weekly: "Weekly"
        case .monthly: "Monthly"
        }
    }
}

public struct PlanningPreferences: Codable, Equatable, Sendable {
    public var minimumTasks: Int
    public var maximumTasks: Int
    public var minuteBudget: Int
    public var includeInbox: Bool

    public init(
        minimumTasks: Int = 5,
        maximumTasks: Int = 8,
        minuteBudget: Int = 360,
        includeInbox: Bool = true
    ) {
        let minimum = min(max(1, minimumTasks), 12)
        self.minimumTasks = minimum
        self.maximumTasks = min(max(minimum, maximumTasks), 12)
        self.minuteBudget = min(max(30, minuteBudget), 960)
        self.includeInbox = includeInbox
    }

    public static let `default` = PlanningPreferences()
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

public struct LedgerChecklistItem: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var title: String
    public var isCompleted: Bool

    public init(
        id: UUID = UUID(),
        title: String,
        isCompleted: Bool = false
    ) {
        self.id = id
        self.title = title
        self.isCompleted = isCompleted
    }
}

public enum AgentLinkSource: String, Codable, Sendable {
    case dispatched
    case manuallyLinked
}

public enum AgentCompletionDecision: String, Codable, Sendable {
    case undecided
    case accepted
    case rejected
}

public struct AgentDispatchState: RawRepresentable, Codable, Equatable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public static let pending = AgentDispatchState(rawValue: "pending")
    public static let queued = AgentDispatchState(rawValue: "queued")
    public static let launching = AgentDispatchState(rawValue: "launching")
    public static let awaitingSession = AgentDispatchState(rawValue: "awaiting_session")
    public static let linked = AgentDispatchState(rawValue: "linked")
    public static let ambiguous = AgentDispatchState(rawValue: "ambiguous")
    public static let failed = AgentDispatchState(rawValue: "failed")
    public static let cancelled = AgentDispatchState(rawValue: "cancelled")

    public var endsAttempt: Bool {
        self == .failed || self == .cancelled
    }
}

public struct AgentTaskLink: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public let taskID: UUID
    public var keeplineWorkItemID: String?
    public var sessionID: String?
    public var dispatchID: String?
    public var dispatchState: AgentDispatchState?
    public var idempotencyKey: String?
    public var candidateSessionIDs: [String]?
    public var projectRoot: String?
    public var runtimeID: String
    public var source: AgentLinkSource
    public var linkedAt: Date
    public var completionDecision: AgentCompletionDecision

    public init(
        id: UUID = UUID(),
        taskID: UUID,
        keeplineWorkItemID: String? = nil,
        sessionID: String? = nil,
        dispatchID: String? = nil,
        dispatchState: AgentDispatchState? = nil,
        idempotencyKey: String? = nil,
        candidateSessionIDs: [String]? = nil,
        projectRoot: String? = nil,
        runtimeID: String,
        source: AgentLinkSource,
        linkedAt: Date = .now,
        completionDecision: AgentCompletionDecision = .undecided
    ) {
        self.id = id
        self.taskID = taskID
        self.keeplineWorkItemID = keeplineWorkItemID
        self.sessionID = sessionID
        self.dispatchID = dispatchID
        self.dispatchState = dispatchState
        self.idempotencyKey = idempotencyKey
        self.candidateSessionIDs = candidateSessionIDs
        self.projectRoot = projectRoot
        self.runtimeID = runtimeID
        self.source = source
        self.linkedAt = linkedAt
        self.completionDecision = completionDecision
    }

    public var isTerminal: Bool {
        completionDecision != .undecided || dispatchState?.endsAttempt == true
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
    public var recurrence: TaskRecurrence?
    public var reminderAt: Date?
    public var statusBeforeTrash: TaskStatus?
    public var recurrenceSourceID: UUID?
    public var checklistItems: [LedgerChecklistItem]?

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
        completedAt: Date? = nil,
        recurrence: TaskRecurrence? = nil,
        reminderAt: Date? = nil,
        statusBeforeTrash: TaskStatus? = nil,
        recurrenceSourceID: UUID? = nil,
        checklistItems: [LedgerChecklistItem]? = nil
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
        self.recurrence = recurrence
        self.reminderAt = reminderAt
        self.statusBeforeTrash = statusBeforeTrash
        self.recurrenceSourceID = recurrenceSourceID
        self.checklistItems = checklistItems
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
    public static let currentSchemaVersion = 2

    public var schemaVersion: Int
    public var projects: [LedgerProject]
    public var tasks: [LedgerTask]
    public var dailyPlan: DailyPlan?
    public var planningPreferences: PlanningPreferences?
    public var agentTaskLinks: [AgentTaskLink]

    public init(
        schemaVersion: Int = LedgerWorkspace.currentSchemaVersion,
        projects: [LedgerProject] = [],
        tasks: [LedgerTask] = [],
        dailyPlan: DailyPlan? = nil,
        planningPreferences: PlanningPreferences? = .default,
        agentTaskLinks: [AgentTaskLink] = []
    ) {
        self.schemaVersion = schemaVersion
        self.projects = projects
        self.tasks = tasks
        self.dailyPlan = dailyPlan
        self.planningPreferences = planningPreferences
        self.agentTaskLinks = agentTaskLinks
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case projects
        case tasks
        case dailyPlan
        case planningPreferences
        case agentTaskLinks
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try values.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
        projects = try values.decodeIfPresent([LedgerProject].self, forKey: .projects) ?? []
        tasks = try values.decodeIfPresent([LedgerTask].self, forKey: .tasks) ?? []
        dailyPlan = try values.decodeIfPresent(DailyPlan.self, forKey: .dailyPlan)
        planningPreferences = try values.decodeIfPresent(
            PlanningPreferences.self,
            forKey: .planningPreferences
        )
        agentTaskLinks = try values.decodeIfPresent(
            [AgentTaskLink].self,
            forKey: .agentTaskLinks
        ) ?? []
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
