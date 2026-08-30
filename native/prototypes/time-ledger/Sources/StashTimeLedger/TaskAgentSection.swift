import AppKit
import KeeplineKit
import StashCore
import SwiftUI

struct TaskAgentSection: View {
    @EnvironmentObject private var store: LedgerStore
    @EnvironmentObject private var integration: KeeplineIntegrationStore
    let task: LedgerTask

    @State private var pendingSession: KeeplineSession?

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 8) {
                Text("AGENT")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.05)
                    .foregroundStyle(LedgerDesign.mint)
                Spacer()
                if activeLink != nil {
                    Label(statusLabel, systemImage: statusSymbol)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(statusColor)
                        .accessibilityIdentifier("stash.task-agent-status.\(statusIdentifier)")
                }
            }

            if let link = activeLink {
                linkedContent(link)
            } else if let link = latestLink, link.isTerminal {
                decisionContent(link)
            } else {
                Text("Work yourself, connect a session, or hand this task to an Agent.")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                agentActions
            }

            if let error = integration.taskErrors[task.id] {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(LedgerDesign.warning)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .confirmationDialog(
            pendingSession.map { "Link “\(sessionTitle($0))” to this task?" } ?? "Link Agent session?",
            isPresented: confirmationBinding,
            titleVisibility: .visible
        ) {
            if let pendingSession {
                Button(isResolvingAmbiguous ? "Use this session" : "Link session") {
                    Task { await integration.link(pendingSession, to: task) }
                    self.pendingSession = nil
                }
                .accessibilityIdentifier(
                    isResolvingAmbiguous ? "stash.agent-resolve-ambiguous" : "stash.agent-confirm-link"
                )
            }
            Button("Cancel", role: .cancel) { pendingSession = nil }
        } message: {
            Text("Stash will keep the task. Keepline will keep the Agent session and evidence.")
        }
        .accessibilityIdentifier("stash.task-agent.\(task.id.uuidString)")
    }

    @ViewBuilder
    private func decisionContent(_ link: AgentTaskLink) -> some View {
        if let session = integration.session(for: link) {
            Text(session.evidenceSummary?.nonEmpty ?? sessionTitle(session))
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }

        if link.dispatchState?.endsAttempt == true {
            Label(
                link.dispatchState == .cancelled ? "Launch cancelled" : "Launch failed",
                systemImage: "exclamationmark.triangle"
            )
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(LedgerDesign.warning)
            .accessibilityIdentifier("stash.task-agent-status.failed")
        } else {
            Label(
                link.completionDecision == .accepted ? "Completion accepted" : "Kept open",
                systemImage: link.completionDecision == .accepted ? "checkmark.circle" : "arrow.uturn.backward.circle"
            )
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(link.completionDecision == .accepted ? LedgerDesign.accent : Color.secondary)
        }

        if (link.dispatchState?.endsAttempt == true || link.completionDecision == .rejected),
           task.status != .completed {
            agentActions
        }
    }

    @ViewBuilder
    private func linkedContent(_ link: AgentTaskLink) -> some View {
        if let session = integration.session(for: link) {
            VStack(alignment: .leading, spacing: 5) {
                Text(sessionTitle(session))
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(2)
                Text(session.evidenceSummary?.nonEmpty ?? sessionDetail(session))
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            if session.completionEvidenceID != nil,
               link.completionDecision == .undecided {
                VStack(alignment: .leading, spacing: 9) {
                    Text("Keepline found explicit completion evidence. The task remains open until you decide.")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 8) {
                        Button("Complete task") {
                            Task {
                                await integration.reviewCompletion(
                                    link: link,
                                    task: task,
                                    accepted: true
                                )
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(LedgerDesign.accent)
                        .accessibilityIdentifier("stash.agent-complete-task")

                        Button("Keep open") {
                            Task {
                                await integration.reviewCompletion(
                                    link: link,
                                    task: task,
                                    accepted: false
                                )
                            }
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("stash.agent-keep-open")
                    }
                    .controlSize(.small)
                }
                .padding(10)
                .background(LedgerDesign.mintWash, in: RoundedRectangle(cornerRadius: 8))
            }
        } else {
            Text(link.dispatchID == nil ? "The linked session is no longer available." : "Keepline is locating the launched session…")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if !integration.sessions.isEmpty {
                linkMenu(title: "Choose session")
            }
        }

        if integration.busyTaskIDs.contains(task.id) {
            ProgressView().controlSize(.small)
        }
    }

    private var agentActions: some View {
        HStack(spacing: 8) {
            linkMenu(title: "Link Agent")
            launchMenu
        }
        .controlSize(.small)
        .disabled(integration.busyTaskIDs.contains(task.id))
    }

    private func linkMenu(title: String) -> some View {
        Menu(title) {
            if linkableSessions.isEmpty {
                Text("No recent sessions")
            } else {
                ForEach(linkableSessions.prefix(8)) { session in
                    Button {
                        pendingSession = session
                    } label: {
                        Text("\(sessionTitle(session)) · \(runtimeName(session.runtimeID))")
                    }
                    .accessibilityIdentifier("stash.agent-session-candidate.\(session.id)")
                }
            }
        }
        .menuStyle(.borderlessButton)
        .disabled(!connectionIsReady)
        .accessibilityIdentifier("stash.agent-link")
    }

    private var launchMenu: some View {
        Menu("Launch Agent") {
            Button("Codex") { chooseDirectoryAndLaunch(runtimeID: .codex) }
                .disabled(!supportsDispatch("codex"))
                .accessibilityIdentifier("stash.agent-runtime.codex")
            Button("Claude Code") { chooseDirectoryAndLaunch(runtimeID: .claudeCode) }
                .disabled(!supportsDispatch("claude-code"))
                .accessibilityIdentifier("stash.agent-runtime.claude-code")
        }
        .menuStyle(.borderlessButton)
        .disabled(!connectionIsReady)
        .accessibilityIdentifier("stash.agent-launch")
    }

    private var activeLink: AgentTaskLink? {
        guard let link = latestLink, !link.isTerminal else { return nil }
        return link
    }

    private var latestLink: AgentTaskLink? {
        store.agentLink(for: task.id)
    }

    private var isResolvingAmbiguous: Bool {
        activeLink?.dispatchState == .ambiguous
    }

    private var linkableSessions: [KeeplineSession] {
        guard isResolvingAmbiguous,
              let candidates = activeLink?.candidateSessionIDs else {
            return integration.sessions
        }
        let candidateIDs = Set(candidates)
        return integration.sessions.filter { candidateIDs.contains($0.sessionID) }
    }

    private var confirmationBinding: Binding<Bool> {
        Binding(
            get: { pendingSession != nil },
            set: { if !$0 { pendingSession = nil } }
        )
    }

    private var connectionIsReady: Bool {
        if case .ready = integration.state { return true }
        return false
    }

    private var status: TaskAgentState {
        integration.taskAgentState(for: activeLink)
    }

    private var statusLabel: String {
        switch status {
        case .unlinked: "Unlinked"
        case .launching: "Launching"
        case .working: "Working"
        case .waiting: "Needs you"
        case .finished: "Finished"
        case .lost: "Lost"
        case .offline: "Offline"
        case .ambiguous: "Choose session"
        case .failed: "Launch failed"
        case let .other(label): label
        }
    }

    private var statusIdentifier: String {
        switch status {
        case .unlinked: "unlinked"
        case .launching: "launching"
        case .working: "working"
        case .waiting: "needs-you"
        case .finished: "finished"
        case .lost: "lost"
        case .offline: "offline"
        case .ambiguous: "ambiguous"
        case .failed: "failed"
        case let .other(label): "other-\(label.lowercased().replacingOccurrences(of: " ", with: "-"))"
        }
    }

    private var statusSymbol: String {
        switch status {
        case .working: "bolt.fill"
        case .waiting: "person.crop.circle.badge.exclamationmark"
        case .finished: "checkmark.circle.fill"
        case .ambiguous: "questionmark.circle"
        case .failed: "exclamationmark.triangle"
        case .lost, .offline: "bolt.slash"
        default: "circle.fill"
        }
    }

    private var statusColor: Color {
        switch status {
        case .working: LedgerDesign.mint
        case .waiting: LedgerDesign.apricot
        case .finished: LedgerDesign.accent
        case .ambiguous, .failed: LedgerDesign.warning
        default: .secondary
        }
    }

    private func chooseDirectoryAndLaunch(runtimeID: KeeplineRuntimeID) {
        let panel = NSOpenPanel()
        panel.title = "Choose the project folder for this Agent"
        panel.prompt = "Launch"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let directory = panel.url else { return }
        Task { await integration.launch(runtimeID: runtimeID, directory: directory, task: task) }
    }

    private func supportsDispatch(_ runtimeID: String) -> Bool {
        integration.metadata?.capabilities.contains("dispatch.\(runtimeID)") == true
    }

    private func sessionTitle(_ session: KeeplineSession) -> String {
        let title = session.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty { return title }
        return URL(fileURLWithPath: session.directory).lastPathComponent.nonEmpty ?? "Untitled session"
    }

    private func sessionDetail(_ session: KeeplineSession) -> String {
        "\(runtimeName(session.runtimeID)) · \(URL(fileURLWithPath: session.directory).lastPathComponent)"
    }

    private func runtimeName(_ runtimeID: KeeplineRuntimeID) -> String {
        switch runtimeID.rawValue {
        case "codex": "Codex"
        case "claude-code": "Claude Code"
        default: runtimeID.rawValue
        }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
