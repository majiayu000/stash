import StashCore
import SwiftUI

struct TimeLedgerView: View {
    @EnvironmentObject private var store: LedgerStore
    @State private var destination: LedgerDestination = .today
    @State private var selectedTaskID: UUID?
    @State private var captureText = ""
    @State private var searchText = ""
    @State private var searchResults: [LedgerTask] = []
    @FocusState private var focusedField: FocusedField?

    private enum FocusedField {
        case capture
        case search
    }

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Divider()

            VStack(spacing: 0) {
                captureBar
                Divider()

                HStack(spacing: 0) {
                    primaryContent
                        .frame(minWidth: 430, maxWidth: .infinity, maxHeight: .infinity)

                    Divider()

                    DetailRail(selectedTaskID: $selectedTaskID)
                        .frame(width: 302)
                }

                Divider()
                statusBar
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(LedgerDesign.accent)
        .onReceive(NotificationCenter.default.publisher(for: .stashFocusCapture)) { _ in
            focusedField = .capture
        }
        .onReceive(NotificationCenter.default.publisher(for: .stashFocusSearch)) { _ in
            focusedField = .search
        }
        .task(id: searchText) {
            let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !query.isEmpty else {
                searchResults = []
                return
            }
            try? await Task.sleep(for: .milliseconds(90))
            guard !Task.isCancelled else { return }
            searchResults = store.search(query)
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 9) {
                Image(systemName: "square.stack.3d.up.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .accessibilityHidden(true)
                Text("Stash")
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                if store.planIsLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(LedgerDesign.accent)
                        .accessibilityLabel("Today is locked")
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 52)

            searchField
                .padding(.horizontal, 12)
                .padding(.bottom, 16)

            VStack(spacing: 3) {
                ForEach(LedgerDestination.allCases) { item in
                    Button {
                        destination = item
                        searchText = ""
                        searchResults = []
                        selectedTaskID = nil
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: item.symbol)
                                .frame(width: 17)
                                .foregroundStyle(destination == item ? .primary : .secondary)
                                .accessibilityHidden(true)

                            Text(item.rawValue)
                                .font(.system(size: 13, weight: destination == item ? .medium : .regular))

                            Spacer()

                            if let count = count(for: item) {
                                Text("\(count)")
                                    .font(.system(size: 11, design: .rounded))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .contentShape(Rectangle())
                        .padding(.horizontal, 10)
                        .frame(height: 34)
                        .background {
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(destination == item && searchText.isEmpty ? Color.primary.opacity(0.07) : .clear)
                        }
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(item.shortcut, modifiers: .command)
                    .accessibilityAddTraits(destination == item ? .isSelected : [])
                }
            }
            .padding(.horizontal, 8)

            Spacer()

            VStack(alignment: .leading, spacing: 5) {
                Text("LOCAL WORKSPACE")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(.tertiary)
                Text("\(store.openTaskCount) open tasks")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 17)
        }
        .frame(width: 188)
        .background(LedgerDesign.sidebar)
    }

    private var searchField: some View {
        HStack(spacing: 7) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)

            TextField("Search", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 12))
                .focused($focusedField, equals: .search)

            if searchText.isEmpty {
                Text("⌘K")
                    .font(.system(size: 9, design: .rounded))
                    .foregroundStyle(.quaternary)
                    .accessibilityHidden(true)
            } else {
                Button {
                    searchText = ""
                    searchResults = []
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 9)
        .frame(height: 29)
        .background {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.primary.opacity(0.055))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(Color.primary.opacity(0.07), lineWidth: 1)
        }
    }

    private var captureBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            TextField("Capture a task…  #project  ^p1  !tomorrow  *30m", text: $captureText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .focused($focusedField, equals: .capture)
                .onSubmit(capture)

            if captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("⌘N")
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            } else {
                Button("Add", action: capture)
                    .buttonStyle(.borderless)
                    .font(.system(size: 12, weight: .medium))
            }
        }
        .padding(.horizontal, 28)
        .frame(height: 51)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    @ViewBuilder
    private var primaryContent: some View {
        if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            TaskCollectionView(
                eyebrow: "SEARCH",
                title: searchResults.isEmpty ? "No matches" : "\(searchResults.count) results",
                subtitle: "Results update as you type.",
                tasks: searchResults,
                selectedTaskID: $selectedTaskID,
                emptySymbol: "magnifyingglass",
                emptyTitle: "Nothing found",
                emptyDescription: "Try a task title, note, or project name."
            )
        } else {
            switch destination {
            case .today:
                TodayLedgerView(selectedTaskID: $selectedTaskID)
            case .inbox:
                InboxView(selectedTaskID: $selectedTaskID)
            case .upcoming:
                UpcomingView(selectedTaskID: $selectedTaskID)
            case .projects:
                ProjectsView(selectedTaskID: $selectedTaskID)
            case .review:
                ReviewView(selectedTaskID: $selectedTaskID)
            }
        }
    }

    private var statusBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "internaldrive")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("Local only")
                .font(.system(size: 10, weight: .medium))

            Text("·")
                .foregroundStyle(.quaternary)

            persistenceLabel

            Spacer()

            Text("⌘N capture   ⌘K search   ⌘1–5 navigate")
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .frame(height: 32)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.30))
    }

    @ViewBuilder
    private var persistenceLabel: some View {
        switch store.persistenceState {
        case .idle:
            Text("Preparing workspace")
                .foregroundStyle(.secondary)
        case .saving:
            Text("Saving…")
                .foregroundStyle(.secondary)
        case .saved:
            Text("Saved")
                .foregroundStyle(.secondary)
        case let .failed(message):
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(LedgerDesign.warning)
        }
    }

    private func count(for item: LedgerDestination) -> Int? {
        switch item {
        case .today: store.todayRows.filter { $0.task.status != .completed }.count
        case .inbox: store.inboxTasks.count
        case .upcoming: store.upcomingTasks.count
        case .projects: nil
        case .review: store.completedToday.count
        }
    }

    private func capture() {
        guard let task = store.capture(captureText) else { return }
        captureText = ""
        selectedTaskID = task.id
        if task.status == .inbox {
            destination = .inbox
        } else {
            destination = .today
        }
        focusedField = .capture
    }
}

struct LedgerTaskRow: View {
    @EnvironmentObject private var store: LedgerStore
    let task: LedgerTask
    let reason: String?
    let dateLabel: String?
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Button {
                store.toggleCompletion(id: task.id)
            } label: {
                Image(systemName: task.status == .completed ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 17))
                    .foregroundStyle(task.status == .completed ? LedgerDesign.accent : .secondary)
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.status == .completed ? "Reopen \(task.title)" : "Complete \(task.title)")

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        if task.status == .active {
                            Text("NOW")
                                .font(.system(size: 9, weight: .bold))
                                .tracking(0.6)
                                .foregroundStyle(LedgerDesign.success)
                        }

                        Text(task.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(task.status == .completed ? .secondary : .primary)
                            .strikethrough(task.status == .completed, color: .secondary)
                            .lineLimit(1)

                        Spacer(minLength: 10)

                        if let dateLabel {
                            Text(dateLabel)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.secondary)
                        } else {
                            Text("\(task.estimateMinutes)m")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                    }

                    HStack(spacing: 7) {
                        if let project = store.project(for: task) {
                            Text(project.name)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(LedgerDesign.accent)

                            Text("·")
                                .foregroundStyle(.quaternary)
                        }

                        Text(reason ?? task.notes.nonEmpty ?? task.horizon.label)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .lineLimit(isSelected ? 2 : 1)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isSelected ? LedgerDesign.selection : .clear)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
