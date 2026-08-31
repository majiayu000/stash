import Foundation
import KeeplineKit
import StashCore

public enum AgentAttentionKind: Int, Equatable, Sendable {
    case ambiguous
    case completionReview
    case waitingInput
    case interrupted
}

public struct AgentAttentionItem: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let taskID: UUID
    public let linkID: UUID
    public let kind: AgentAttentionKind
    public let taskTitle: String
    public let runtimeID: String
    public let sessionTitle: String?
    public let sessionID: String?
    public let lastActivityAt: Date
}

public enum AgentAttentionQueue {
    public static func items(
        tasks: [LedgerTask],
        links: [AgentTaskLink],
        sessions: [KeeplineSession]
    ) -> [AgentAttentionItem] {
        let openTasks = Dictionary(uniqueKeysWithValues: tasks.filter(\.isOpen).map { ($0.id, $0) })
        let sessionsByID = sessions.reduce(into: [String: KeeplineSession]()) { result, session in
            result[session.id] = session
            result[session.sessionID] = session
        }

        return openTasks.values.compactMap { task in
            let taskLinks = links.filter { $0.taskID == task.id }
            guard let link = latestRelevantLink(in: taskLinks) else { return nil }
            let session = link.sessionID.flatMap { sessionsByID[$0] }
            guard let kind = attentionKind(link: link, session: session) else { return nil }

            return AgentAttentionItem(
                id: link.id,
                taskID: task.id,
                linkID: link.id,
                kind: kind,
                taskTitle: task.title,
                runtimeID: link.runtimeID,
                sessionTitle: session?.title,
                sessionID: session?.sessionID,
                lastActivityAt: session?.lastActiveAt ?? link.linkedAt
            )
        }
        .sorted {
            if $0.kind.rawValue != $1.kind.rawValue { return $0.kind.rawValue < $1.kind.rawValue }
            if $0.lastActivityAt != $1.lastActivityAt { return $0.lastActivityAt > $1.lastActivityAt }
            return $0.taskTitle.localizedCaseInsensitiveCompare($1.taskTitle) == .orderedAscending
        }
    }

    private static func latestRelevantLink(in links: [AgentTaskLink]) -> AgentTaskLink? {
        links.filter { !$0.isTerminal }.max { $0.linkedAt < $1.linkedAt }
            ?? links.max { $0.linkedAt < $1.linkedAt }
    }

    private static func attentionKind(
        link: AgentTaskLink,
        session: KeeplineSession?
    ) -> AgentAttentionKind? {
        if link.dispatchState == .ambiguous { return .ambiguous }
        if link.completionDecision == .undecided, session?.completionEvidenceID != nil {
            return .completionReview
        }
        if session?.status == .waiting { return .waitingInput }
        if session?.status == .lost || link.dispatchState?.endsAttempt == true { return .interrupted }
        return nil
    }
}
