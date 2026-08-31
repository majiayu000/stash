import KeeplineKit
import StashCore
import StashKeeplineIntegration
import SwiftUI

struct AgentActivitySection: View {
    @EnvironmentObject private var store: LedgerStore
    @EnvironmentObject private var integration: KeeplineIntegrationStore
    @Binding var selectedTaskID: UUID?
    @State private var recoveryConfirmation: RecoveryConfirmation?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(attentionItems.isEmpty ? "AGENT ACTIVITY" : "NEEDS YOUR ATTENTION")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.05)
                    .foregroundStyle(attentionItems.isEmpty ? LedgerDesign.mint : LedgerDesign.apricot)

                if badgeCount > 0 {
                    Text("\(badgeCount)")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundStyle(attentionItems.isEmpty ? LedgerDesign.mint : LedgerDesign.apricot)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(badgeWash, in: Capsule())
                }

                Spacer()

                Button {
                    Task { await integration.refreshNow() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10, weight: .semibold))
                        .frame(width: 22, height: 22)
                }
                .buttonStyle(.plain)
                .disabled(isConnecting)
                .accessibilityLabel("Refresh agent activity")
            }

            content
                .padding(.top, 9)
                .accessibilityIdentifier("stash.agent-connection.\(connectionStateIdentifier)")
        }
        .accessibilityIdentifier("stash.agent-activity")
        .sheet(item: $recoveryConfirmation) { confirmation in
            RecoveryConfirmationSheet(confirmation: confirmation) {
                await integration.executeRecovery(
                    preview: confirmation.preview,
                    taskID: confirmation.taskID
                )
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if !attentionItems.isEmpty {
            attentionList(notice: attentionNotice)
        } else {
            switch integration.state {
            case .idle, .connecting:
                HStack(spacing: 9) {
                    ProgressView().controlSize(.small)
                    Text("Connecting to Keepline…")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                .frame(minHeight: 42)

            case .offline:
                EmptyAgentActivity(
                    symbol: "bolt.slash",
                    title: "Keepline is offline",
                    detail: "Tasks and planning remain available."
                )

            case let .incompatible(message):
                EmptyAgentActivity(
                    symbol: "arrow.triangle.2.circlepath",
                    title: "Keepline update required",
                    detail: message
                )

            case let .failedToStart(message), let .failed(message):
                EmptyAgentActivity(
                    symbol: "exclamationmark.triangle",
                    title: "Agent activity unavailable",
                    detail: message
                )

            case let .stale(lastUpdated, _):
                sessionList(notice: "Offline · updated \(recency(from: lastUpdated))")

            case .ready:
                sessionList(notice: nil)
            }
        }
    }

    private func attentionList(notice: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let notice {
                Text(notice)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(LedgerDesign.warning)
                    .padding(.bottom, 5)
            }

            ForEach(Array(attentionItems.enumerated()), id: \.element.id) { index, item in
                AgentAttentionRow(
                    item: item,
                    errorMessage: integration.taskErrors[item.taskID],
                    isBusy: integration.busyTaskIDs.contains(item.taskID),
                    canRecover: canRecover(item),
                    onOpen: { selectedTaskID = item.taskID },
                    onReviewRecovery: { reviewRecovery(item) }
                )
                if index < attentionItems.count - 1 {
                    Divider().padding(.leading, 32)
                }
            }
        }
    }

    @ViewBuilder
    private func sessionList(notice: String?) -> some View {
        if integration.sessions.isEmpty {
            EmptyAgentActivity(
                symbol: "checkmark.circle",
                title: "No agents need attention",
                detail: notice ?? "Claude Code and Codex are quiet."
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                if let notice {
                    Text(notice)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(LedgerDesign.warning)
                        .padding(.bottom, 5)
                }
                ForEach(Array(integration.sessions.prefix(4).enumerated()), id: \.element.id) { index, session in
                    AgentSessionRow(session: session)
                    if index < min(integration.sessions.count, 4) - 1 {
                        Divider().padding(.leading, 18)
                    }
                }
            }
        }
    }

    private var activeCount: Int {
        integration.sessions.filter {
            $0.status.rawValue == "running" || $0.status.rawValue == "waiting"
        }.count
    }

    private var attentionItems: [AgentAttentionItem] {
        AgentAttentionQueue.items(
            tasks: store.workspace.tasks,
            links: store.workspace.agentTaskLinks,
            sessions: integration.sessions
        )
    }

    private var badgeCount: Int {
        attentionItems.isEmpty ? activeCount : attentionItems.count
    }

    private var badgeWash: Color {
        attentionItems.isEmpty ? LedgerDesign.mintWash : LedgerDesign.apricot.opacity(0.12)
    }

    private var attentionNotice: String? {
        switch integration.state {
        case let .stale(lastUpdated, _): "Offline · updated \(recency(from: lastUpdated))"
        case .offline, .failedToStart, .failed: "Keepline is offline · task details remain available"
        case .incompatible: "Keepline must be updated before Agent actions can run"
        case .idle, .connecting: "Connecting · task details remain available"
        case .ready: nil
        }
    }

    private var isConnecting: Bool {
        if case .connecting = integration.state { return true }
        return false
    }

    private func canRecover(_ item: AgentAttentionItem) -> Bool {
        guard item.kind == .interrupted, item.sessionID != nil else { return false }
        if case .ready = integration.state { return true }
        return false
    }

    private func reviewRecovery(_ item: AgentAttentionItem) {
        guard let sessionID = item.sessionID else { return }
        Task {
            guard let preview = await integration.recoveryPreview(
                sessionID: sessionID,
                taskID: item.taskID
            ) else { return }
            recoveryConfirmation = RecoveryConfirmation(taskID: item.taskID, preview: preview)
        }
    }

    private var connectionStateIdentifier: String {
        switch integration.state {
        case .idle: "idle"
        case .connecting: "connecting"
        case .ready: "ready"
        case .stale: "stale"
        case .offline: "offline"
        case .incompatible: "incompatible"
        case .failedToStart: "failed-to-start"
        case .failed: "failed"
        }
    }
}

private struct AgentAttentionRow: View {
    let item: AgentAttentionItem
    let errorMessage: String?
    let isBusy: Bool
    let canRecover: Bool
    let onOpen: () -> Void
    let onReviewRecovery: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onOpen) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 22, height: 22)
                    .background(tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 7) {
                        Text(label)
                            .font(.system(size: 9, weight: .bold))
                            .tracking(0.35)
                            .foregroundStyle(tint)

                        Text(runtimeName)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.tertiary)
                    }

                    Text(item.taskTitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    Text(detail)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 4)

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .padding(.top, 3)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
            .padding(.vertical, 10)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(label): \(item.taskTitle). \(detail)")
            .accessibilityHint("Opens this task in Stash")
            .accessibilityIdentifier("stash.agent-attention.\(item.taskID.uuidString)")

            if canRecover {
                Button(action: onReviewRecovery) {
                    Label("Review recovery", systemImage: "arrow.clockwise.circle")
                        .font(.system(size: 10, weight: .semibold))
                }
                .buttonStyle(.borderless)
                .disabled(isBusy)
                .padding(.leading, 32)
                .padding(.bottom, 9)
                .accessibilityIdentifier("stash.agent-recovery.review.\(item.taskID.uuidString)")
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 10))
                    .foregroundStyle(LedgerDesign.warning)
                    .padding(.leading, 32)
                    .padding(.bottom, 9)
                    .accessibilityIdentifier("stash.agent-recovery.error.\(item.taskID.uuidString)")
            }
        }
    }

    private var label: String {
        switch item.kind {
        case .ambiguous: "CHOOSE SESSION"
        case .completionReview: "REVIEW COMPLETION"
        case .waitingInput: "NEEDS YOUR INPUT"
        case .interrupted: "RUN INTERRUPTED"
        }
    }

    private var detail: String {
        let sessionName = item.sessionTitle?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let visibleSessionName = sessionName.flatMap { $0.isEmpty ? nil : $0 }
        switch item.kind {
        case .ambiguous: return "Several sessions matched. Open the task to choose one."
        case .completionReview: return visibleSessionName ?? "The Agent reported completion. Review its evidence."
        case .waitingInput: return visibleSessionName ?? "The Agent is waiting for a response."
        case .interrupted: return "Open the task to inspect the lost session or launch again."
        }
    }

    private var symbol: String {
        switch item.kind {
        case .ambiguous: "point.3.connected.trianglepath.dotted"
        case .completionReview: "checkmark.seal"
        case .waitingInput: "person.crop.circle.badge.exclamationmark"
        case .interrupted: "bolt.slash"
        }
    }

    private var tint: Color {
        switch item.kind {
        case .ambiguous, .interrupted: LedgerDesign.warning
        case .completionReview: LedgerDesign.accent
        case .waitingInput: LedgerDesign.apricot
        }
    }

    private var runtimeName: String {
        switch item.runtimeID {
        case "codex": "Codex"
        case "claude-code": "Claude Code"
        default: item.runtimeID
        }
    }
}

private struct RecoveryConfirmation: Identifiable {
    let taskID: UUID
    let preview: KeeplineRecoveryPreview
    var id: String { preview.confirmationID }
}

private struct RecoveryConfirmationSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var integration: KeeplineIntegrationStore
    let confirmation: RecoveryConfirmation
    let onConfirm: () async -> Bool
    @State private var isExecuting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Review recovery")
                    .font(.system(size: 20, weight: .semibold))
                Text("Keepline will open this exact session in an external terminal.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 9) {
                recoveryRow("Runtime", value: runtimeName)
                recoveryRow("Method", value: confirmation.preview.method.rawValue.capitalized)
                recoveryRow("Session", value: confirmation.preview.sessionID)
                recoveryRow("Directory", value: confirmation.preview.directory)
                recoveryRow("Executable", value: confirmation.preview.executable)
                recoveryRow("Arguments", value: argumentsSummary)
                recoveryRow(
                    "Session result",
                    value: confirmation.preview.createsNewSession ? "Creates a new session" : "Resumes this session"
                )
            }

            if let errorMessage = integration.taskErrors[confirmation.taskID] {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.system(size: 11))
                    .foregroundStyle(LedgerDesign.warning)
                    .accessibilityIdentifier("stash.agent-recovery.confirmation-error")
            }

            HStack {
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button {
                    isExecuting = true
                    Task {
                        if await onConfirm() { dismiss() }
                        isExecuting = false
                    }
                } label: {
                    if isExecuting {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Open in Terminal")
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isExecuting)
                .accessibilityIdentifier("stash.agent-recovery.confirm")
            }
        }
        .padding(24)
        .frame(width: 520)
    }

    private func recoveryRow(_ label: String, value: String) -> some View {
        GridRow {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(
                    size: 11,
                    design: ["Executable", "Arguments"].contains(label) ? .monospaced : .default
                ))
                .textSelection(.enabled)
                .lineLimit(3)
        }
    }

    private var argumentsSummary: String {
        confirmation.preview.arguments.map { String(reflecting: $0) }.joined(separator: " ")
    }

    private var runtimeName: String {
        confirmation.preview.runtimeID == .codex ? "Codex" : "Claude Code"
    }
}

private struct AgentSessionRow: View {
    let session: KeeplineSession

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(statusColor)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Text(displayTitle)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(runtimeName)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(runtimeTint)
                }

                Text("\(statusLabel) · \(recency(from: session.lastActiveAt))")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 9)
        .accessibilityElement(children: .combine)
    }

    private var displayTitle: String {
        let title = session.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty { return title }
        let directory = URL(fileURLWithPath: session.directory).lastPathComponent
        return directory.isEmpty ? "Untitled session" : directory
    }

    private var runtimeName: String {
        switch session.runtimeID.rawValue {
        case "codex": "Codex"
        case "claude-code": "Claude Code"
        default: session.runtimeID.rawValue
        }
    }

    private var statusLabel: String {
        switch session.status.rawValue {
        case "running": "Working"
        case "waiting": "Needs you"
        case "idle": "Idle"
        case "lost": "Lost"
        case "completed": "Finished"
        default: session.status.rawValue.capitalized
        }
    }

    private var statusColor: Color {
        switch session.status.rawValue {
        case "running": LedgerDesign.mint
        case "waiting": LedgerDesign.apricot
        case "completed": LedgerDesign.accent
        default: Color.secondary.opacity(0.55)
        }
    }

    private var runtimeTint: Color {
        session.runtimeID.rawValue == "codex" ? LedgerDesign.accent : LedgerDesign.creative
    }
}

private struct EmptyAgentActivity: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 17, height: 18)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 12, weight: .medium))
                Text(detail)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 8)
    }
}

private func recency(from date: Date) -> String {
    let seconds = max(0, Date.now.timeIntervalSince(date))
    if seconds < 60 { return "just now" }
    let minutes = Int(seconds / 60)
    if minutes < 60 { return "\(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h ago" }
    return "\(hours / 24)d ago"
}
