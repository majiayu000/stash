import KeeplineKit
import SwiftUI

struct AgentActivitySection: View {
    @EnvironmentObject private var integration: KeeplineIntegrationStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("AGENT ACTIVITY")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.05)
                    .foregroundStyle(LedgerDesign.mint)

                if activeCount > 0 {
                    Text("\(activeCount)")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundStyle(LedgerDesign.mint)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(LedgerDesign.mintWash, in: Capsule())
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
    }

    @ViewBuilder
    private var content: some View {
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

    private var isConnecting: Bool {
        if case .connecting = integration.state { return true }
        return false
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
