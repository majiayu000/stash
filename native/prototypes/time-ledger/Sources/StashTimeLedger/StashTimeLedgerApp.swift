import SwiftUI

@main
struct StashTimeLedgerApp: App {
    var body: some Scene {
        WindowGroup("Stash · Time Ledger") {
            TimeLedgerView()
                .frame(minWidth: 920, minHeight: 620)
        }
        .defaultSize(width: 1180, height: 760)
        .windowResizability(.contentMinSize)
    }
}

private struct LedgerItem: Identifiable {
    let id = UUID()
    var title: String
    var context: String
    var note: String
    var time: String?
    var isComplete: Bool = false
}

private struct HorizonItem: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
}

private enum NavigationDestination: String, CaseIterable, Identifiable {
    case today = "Today"
    case projects = "Projects"
    case sessions = "Sessions"
    case review = "Review"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .projects: "square.stack.3d.up"
        case .sessions: "waveform.path.ecg"
        case .review: "clock.arrow.circlepath"
        }
    }
}

struct TimeLedgerView: View {
    @State private var destination: NavigationDestination = .today
    @State private var searchText = ""
    @State private var captureText = ""
    @State private var selectedItemID: UUID?
    @FocusState private var captureIsFocused: Bool

    @State private var todayItems: [LedgerItem] = [
        LedgerItem(
            title: "Finalize Stash onboarding copy",
            context: "Stash",
            note: "Resolve the first-run empty state before the beta cut.",
            time: "10:30"
        ),
        LedgerItem(
            title: "Review PR #418 · session restore",
            context: "Stash",
            note: "Check persisted cwd and the interrupted-run recovery path.",
            time: "11:45"
        ),
        LedgerItem(
            title: "Send VSR upload notes",
            context: "AtlasCloud",
            note: "Include the public asset URL and checksum evidence.",
            time: "14:00"
        ),
        LedgerItem(
            title: "Prepare August infra handoff",
            context: "Work",
            note: "Leave owners and live runtime checks for each open lane.",
            time: "16:30"
        ),
        LedgerItem(
            title: "Book dentist follow-up",
            context: "Personal",
            note: "Ask for a late-afternoon appointment next week.",
            time: nil
        ),
        LedgerItem(
            title: "Read the local-first sync RFC",
            context: "Research",
            note: "Capture decisions that affect offline conflict handling.",
            time: nil
        )
    ]

    private let weekItems: [HorizonItem] = [
        HorizonItem(
            title: "Ship the Stash beta",
            detail: "Friday · 3 tasks left",
            systemImage: "shippingbox"
        ),
        HorizonItem(
            title: "Usage accounting contract",
            detail: "Thursday · review",
            systemImage: "doc.text"
        ),
        HorizonItem(
            title: "Write v0.4 release notes",
            detail: "This weekend",
            systemImage: "text.page"
        )
    ]

    private let longTermItems: [HorizonItem] = [
        HorizonItem(
            title: "One local work history",
            detail: "Build a durable record across tools",
            systemImage: "point.3.connected.trianglepath.dotted"
        ),
        HorizonItem(
            title: "Agent evidence archive",
            detail: "Make every shipped result traceable",
            systemImage: "archivebox"
        ),
        HorizonItem(
            title: "Personal knowledge index",
            detail: "A quiet system for decisions and lessons",
            systemImage: "books.vertical"
        )
    ]

    private var filteredTodayItems: [LedgerItem] {
        guard !searchText.isEmpty else { return todayItems }
        return todayItems.filter {
            $0.title.localizedCaseInsensitiveContains(searchText)
                || $0.context.localizedCaseInsensitiveContains(searchText)
                || $0.note.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var completedCount: Int {
        todayItems.filter(\.isComplete).count
    }

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Divider()

            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    todayLedger
                    Divider()
                    horizons
                }

                Divider()
                agentStatus
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(Color(red: 0.29, green: 0.39, blue: 0.48))
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 9) {
                Image(systemName: "square.stack.3d.up.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)
                    .accessibilityHidden(true)
                Text("Stash")
                    .font(.system(size: 15, weight: .semibold))
            }
            .padding(.horizontal, 16)
            .frame(height: 52)

            searchField
                .padding(.horizontal, 12)
                .padding(.bottom, 16)

            VStack(spacing: 3) {
                ForEach(NavigationDestination.allCases) { item in
                    Button {
                        destination = item
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: item.systemImage)
                                .frame(width: 17)
                                .foregroundStyle(destination == item ? .primary : .secondary)
                                .accessibilityHidden(true)

                            Text(item.rawValue)
                                .font(.system(size: 13, weight: destination == item ? .medium : .regular))

                            Spacer()

                            if item == .today {
                                Text("\(todayItems.filter { !$0.isComplete }.count)")
                                    .font(.system(size: 11, design: .rounded))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .contentShape(Rectangle())
                        .padding(.horizontal, 10)
                        .frame(height: 34)
                        .background {
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(destination == item ? Color.primary.opacity(0.07) : .clear)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(item.rawValue)
                    .accessibilityAddTraits(destination == item ? .isSelected : [])
                }
            }
            .padding(.horizontal, 8)

            Spacer()

            Divider()
                .padding(.horizontal, 12)

            Button(action: {}) {
                Label("Settings", systemImage: "gearshape")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 18)
            .frame(height: 48)
        }
        .frame(width: 188)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.42))
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

            if !searchText.isEmpty {
                Button {
                    searchText = ""
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

    private var todayLedger: some View {
        VStack(spacing: 0) {
            captureBar
            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text("TODAY")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.1)
                    .foregroundStyle(.secondary)

                HStack(alignment: .firstTextBaseline) {
                    Text("Thursday, August 27")
                        .font(.system(size: 25, weight: .semibold))
                    Spacer()
                    Text("\(completedCount) of \(todayItems.count) done")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }

                Text("Choose what moves today. Everything else can wait.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 28)
            .padding(.top, 23)
            .padding(.bottom, 20)

            Divider()
                .padding(.horizontal, 28)

            if filteredTodayItems.isEmpty {
                ContentUnavailableView.search(text: searchText)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredTodayItems) { item in
                            taskRow(item)
                            if item.id != filteredTodayItems.last?.id {
                                Divider()
                                    .padding(.leading, 74)
                                    .padding(.trailing, 28)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .scrollIndicators(.never)
            }
        }
        .frame(minWidth: 470, maxWidth: .infinity, maxHeight: .infinity)
    }

    private var captureBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            TextField("Capture a task…", text: $captureText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .focused($captureIsFocused)
                .onSubmit(addCapturedTask)

            if !captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button("Add") {
                    addCapturedTask()
                }
                .buttonStyle(.borderless)
                .font(.system(size: 12, weight: .medium))
            } else {
                Text("⌘N")
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 28)
        .frame(height: 51)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private func taskRow(_ item: LedgerItem) -> some View {
        let isSelected = selectedItemID == item.id

        return HStack(alignment: .top, spacing: 14) {
            Button {
                toggleCompletion(for: item.id)
            } label: {
                Image(systemName: item.isComplete ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(item.isComplete ? Color.accentColor : .secondary)
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.isComplete ? "Mark \(item.title) incomplete" : "Complete \(item.title)")

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(item.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(item.isComplete ? .secondary : .primary)
                        .strikethrough(item.isComplete, color: .secondary)

                    Spacer(minLength: 10)

                    if let time = item.time {
                        Text(time)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 7) {
                    Text(item.context)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Color.accentColor)

                    Text("·")
                        .foregroundStyle(.quaternary)

                    Text(item.note)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(isSelected ? 2 : 1)
                }
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .background(isSelected ? Color.accentColor.opacity(0.075) : .clear)
        .onTapGesture {
            selectedItemID = item.id
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var horizons: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                horizonSection(
                    eyebrow: "THIS WEEK",
                    title: "Before Friday",
                    items: weekItems
                )

                Divider()
                    .padding(.vertical, 25)

                horizonSection(
                    eyebrow: "LONG TERM",
                    title: "What compounds",
                    items: longTermItems
                )
            }
            .padding(.horizontal, 23)
            .padding(.top, 26)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.never)
        .frame(width: 302)
        .frame(maxHeight: .infinity)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.23))
    }

    private func horizonSection(
        eyebrow: String,
        title: String,
        items: [HorizonItem]
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.05)
                .foregroundStyle(.secondary)

            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .padding(.top, 7)
                .padding(.bottom, 15)

            ForEach(items) { item in
                Button(action: {}) {
                    HStack(alignment: .top, spacing: 11) {
                        Image(systemName: item.systemImage)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .frame(width: 18, height: 19)
                            .accessibilityHidden(true)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.primary)
                                .lineLimit(2)

                            Text(item.detail)
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }

                        Spacer(minLength: 4)
                    }
                    .contentShape(Rectangle())
                    .padding(.vertical, 10)
                }
                .buttonStyle(.plain)

                if item.id != items.last?.id {
                    Divider()
                        .padding(.leading, 29)
                }
            }
        }
    }

    private var agentStatus: some View {
        HStack(spacing: 9) {
            Image(systemName: "bolt.horizontal.circle.fill")
                .font(.system(size: 12))
                .foregroundStyle(Color(red: 0.28, green: 0.47, blue: 0.38))
                .accessibilityHidden(true)

            Text("1 agent running")
                .font(.system(size: 11, weight: .medium))

            Text("Codex · building session restore")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)

            Spacer()

            Button("View session") {}
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .frame(height: 35)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.32))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("1 agent running, Codex building session restore")
    }

    private func toggleCompletion(for id: UUID) {
        guard let index = todayItems.firstIndex(where: { $0.id == id }) else { return }
        todayItems[index].isComplete.toggle()
    }

    private func addCapturedTask() {
        let title = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }

        let item = LedgerItem(
            title: title,
            context: "Inbox",
            note: "Captured just now. Add context when you triage it.",
            time: nil
        )
        todayItems.insert(item, at: 0)
        captureText = ""
        selectedItemID = item.id
        captureIsFocused = true
    }
}
