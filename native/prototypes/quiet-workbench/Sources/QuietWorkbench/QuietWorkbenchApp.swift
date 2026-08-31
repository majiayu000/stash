import SwiftUI

@main
struct QuietWorkbenchApp: App {
    @FocusedValue(\.focusCapture) private var focusCapture

    var body: some Scene {
        WindowGroup("Stash · Quiet Workbench") {
            WorkbenchView()
                .frame(minWidth: 920, minHeight: 620)
        }
        .defaultSize(width: 1180, height: 760)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Capture New Task") {
                    focusCapture?()
                }
                .keyboardShortcut("n", modifiers: .command)
            }
        }
    }
}

private struct FocusCaptureKey: FocusedValueKey {
    typealias Value = () -> Void
}

private extension FocusedValues {
    var focusCapture: (() -> Void)? {
        get { self[FocusCaptureKey.self] }
        set { self[FocusCaptureKey.self] = newValue }
    }
}

private struct TaskItem: Identifiable, Equatable {
    let id: UUID
    var title: String
    var context: String
    var schedule: String
    var isComplete: Bool

    init(
        id: UUID = UUID(),
        title: String,
        context: String,
        schedule: String,
        isComplete: Bool = false
    ) {
        self.id = id
        self.title = title
        self.context = context
        self.schedule = schedule
        self.isComplete = isComplete
    }
}

private struct AgentItem: Identifiable {
    enum Status {
        case working
        case waiting
    }

    let id = UUID()
    let name: String
    let detail: String
    let status: Status
}

private enum WorkbenchPalette {
    static let canvas = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(srgbRed: 0.075, green: 0.080, blue: 0.075, alpha: 1)
            : NSColor(srgbRed: 0.965, green: 0.963, blue: 0.948, alpha: 1)
    })
    static let surface = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(srgbRed: 0.105, green: 0.110, blue: 0.103, alpha: 1)
            : NSColor(srgbRed: 0.985, green: 0.983, blue: 0.970, alpha: 1)
    })
    static let ink = Color.primary.opacity(0.92)
    static let secondaryInk = Color.secondary.opacity(0.86)
    static let faintInk = Color.secondary.opacity(0.58)
    static let rule = Color.primary.opacity(0.10)
    static let sage = Color(red: 0.38, green: 0.49, blue: 0.40)
    static let sageWash = sage.opacity(0.115)
}

private struct WorkbenchView: View {
    @State private var captureText = ""
    @State private var selectedTaskID: TaskItem.ID?
    @FocusState private var isCaptureFocused: Bool

    @State private var todayTasks = [
        TaskItem(title: "Shape the Stash home experience", context: "Stash", schedule: "Now"),
        TaskItem(title: "Review local session handoff", context: "Agent context", schedule: "10:30"),
        TaskItem(title: "Write the capture flow notes", context: "Product", schedule: "Before lunch"),
        TaskItem(title: "Resolve the sync edge case", context: "Local data", schedule: "Afternoon"),
        TaskItem(title: "Reply to the release thread", context: "Coordination", schedule: "15 min"),
        TaskItem(title: "Close the day with a short review", context: "Review", schedule: "17:30")
    ]

    private let nextTasks = [
        TaskItem(title: "Prototype project context handoff", context: "Stash", schedule: "Tomorrow"),
        TaskItem(title: "Test first-run empty states", context: "Product", schedule: "Fri"),
        TaskItem(title: "Plan local data migration", context: "Architecture", schedule: "Mon")
    ]

    private let somedayTasks = [
        TaskItem(title: "Connect agent run evidence", context: "Agent activity", schedule: "Later"),
        TaskItem(title: "Design a weekly review ritual", context: "Review", schedule: "Later"),
        TaskItem(title: "Explore global quick capture", context: "macOS", schedule: "Later")
    ]

    private let agents = [
        AgentItem(name: "Codex", detail: "Building Quiet Workbench prototype", status: .working),
        AgentItem(name: "Claude", detail: "Waiting for your next instruction", status: .waiting)
    ]

    private var remainingTodayCount: Int {
        todayTasks.filter { !$0.isComplete }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            captureToolbar
            Divider().overlay(WorkbenchPalette.rule)
            inProgressStrip
            Divider().overlay(WorkbenchPalette.rule)
            mainContent
        }
        .background(WorkbenchPalette.canvas)
        .focusedValue(\.focusCapture) {
            isCaptureFocused = true
        }
    }

    private var captureToolbar: some View {
        HStack(spacing: 18) {
            HStack(spacing: 9) {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(WorkbenchPalette.sage)
                    .frame(width: 14, height: 14)
                    .overlay {
                        Circle()
                            .fill(WorkbenchPalette.surface)
                            .frame(width: 4, height: 4)
                    }

                Text("STASH")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .tracking(1.35)
                    .foregroundStyle(WorkbenchPalette.ink)
            }
            .frame(width: 106, alignment: .leading)

            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(WorkbenchPalette.faintInk)

                TextField("Capture a task…", text: $captureText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .focused($isCaptureFocused)
                    .onSubmit(addCapturedTask)
                    .accessibilityLabel("Capture a new task")

                if !captureText.isEmpty {
                    Button("Add", action: addCapturedTask)
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(WorkbenchPalette.sage)
                        .accessibilityHint("Adds this task to Today")
                } else {
                    Text("⌘N")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(WorkbenchPalette.faintInk)
                }
            }
            .padding(.horizontal, 13)
            .frame(maxWidth: 560, minHeight: 34)
            .background(WorkbenchPalette.surface)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .stroke(isCaptureFocused ? WorkbenchPalette.sage.opacity(0.58) : WorkbenchPalette.rule, lineWidth: 1)
            }

            Spacer(minLength: 16)

            Text("THU 27 AUG")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(WorkbenchPalette.faintInk)
                .accessibilityLabel("Thursday 27 August")
        }
        .padding(.horizontal, 28)
        .frame(height: 62)
    }

    private var inProgressStrip: some View {
        HStack(spacing: 0) {
            Text("IN PROGRESS")
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.15)
                .foregroundStyle(WorkbenchPalette.sage)
                .frame(width: 134, alignment: .leading)

            Capsule()
                .fill(WorkbenchPalette.sage)
                .frame(width: 7, height: 7)
                .padding(.trailing, 12)

            VStack(alignment: .leading, spacing: 2) {
                Text("Shape the Stash home experience")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(WorkbenchPalette.ink)
                    .lineLimit(1)
                Text("Stash · Design")
                    .font(.system(size: 11))
                    .foregroundStyle(WorkbenchPalette.faintInk)
            }

            Spacer(minLength: 20)

            Text("01:18:42")
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(WorkbenchPalette.secondaryInk)

            Button {
                // This prototype deliberately keeps run controls local and inert.
            } label: {
                Image(systemName: "pause.fill")
                    .font(.system(size: 9, weight: .semibold))
                    .frame(width: 28, height: 28)
                    .foregroundStyle(WorkbenchPalette.secondaryInk)
                    .background(WorkbenchPalette.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 18)
            .accessibilityLabel("Pause current task")
        }
        .padding(.horizontal, 28)
        .frame(height: 70)
        .background(WorkbenchPalette.sageWash.opacity(0.56))
    }

    private var mainContent: some View {
        GeometryReader { proxy in
            HStack(alignment: .top, spacing: 0) {
                todayColumn
                    .frame(width: max(530, proxy.size.width * 0.655), alignment: .topLeading)

                Divider().overlay(WorkbenchPalette.rule)

                supportingColumn
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }

    private var todayColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeading(
                eyebrow: "TODAY",
                title: "A clear day, one task at a time.",
                detail: "\(remainingTodayCount) remaining"
            )
            .padding(.bottom, 14)

            VStack(spacing: 0) {
                ForEach($todayTasks) { $task in
                    TodayTaskRow(
                        task: $task,
                        isSelected: selectedTaskID == task.id,
                        onSelect: { selectedTaskID = task.id }
                    )
                    Divider()
                        .overlay(WorkbenchPalette.rule)
                        .padding(.leading, 38)
                }
            }
        }
        .padding(.leading, 38)
        .padding(.trailing, 34)
        .padding(.top, 34)
        .padding(.bottom, 28)
    }

    private var supportingColumn: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                CompactTaskSection(title: "NEXT 7 DAYS", count: nextTasks.count, tasks: nextTasks)

                Divider()
                    .overlay(WorkbenchPalette.rule)
                    .padding(.vertical, 25)

                CompactTaskSection(title: "SOMEDAY", count: somedayTasks.count, tasks: somedayTasks)

                Divider()
                    .overlay(WorkbenchPalette.rule)
                    .padding(.vertical, 25)

                agentSection
            }
            .padding(.horizontal, 30)
            .padding(.top, 36)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
    }

    private var agentSection: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack(alignment: .firstTextBaseline) {
                Text("AGENTS")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.15)
                    .foregroundStyle(WorkbenchPalette.faintInk)
                Spacer()
                Text("1 active")
                    .font(.system(size: 11))
                    .foregroundStyle(WorkbenchPalette.faintInk)
            }

            ForEach(agents) { agent in
                HStack(alignment: .top, spacing: 11) {
                    Circle()
                        .fill(agent.status == .working ? WorkbenchPalette.sage : WorkbenchPalette.rule)
                        .frame(width: 7, height: 7)
                        .padding(.top, 5)
                        .overlay {
                            if agent.status == .working {
                                Circle()
                                    .stroke(WorkbenchPalette.sage.opacity(0.28), lineWidth: 4)
                                    .frame(width: 13, height: 13)
                                    .padding(.top, 5)
                            }
                        }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(agent.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(WorkbenchPalette.ink)
                        Text(agent.detail)
                            .font(.system(size: 11))
                            .foregroundStyle(WorkbenchPalette.faintInk)
                            .lineLimit(2)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func addCapturedTask() {
        let title = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }

        let task = TaskItem(title: title, context: "Inbox", schedule: "Captured now")
        todayTasks.append(task)
        selectedTaskID = task.id
        captureText = ""
        isCaptureFocused = true
    }
}

private struct SectionHeading: View {
    let eyebrow: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .lastTextBaseline) {
            VStack(alignment: .leading, spacing: 8) {
                Text(eyebrow)
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(WorkbenchPalette.sage)

                Text(title)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(WorkbenchPalette.ink)
            }

            Spacer()

            Text(detail)
                .font(.system(size: 11))
                .foregroundStyle(WorkbenchPalette.faintInk)
        }
    }
}

private struct TodayTaskRow: View {
    @Binding var task: TaskItem
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        HStack(spacing: 13) {
            Button {
                task.isComplete.toggle()
            } label: {
                ZStack {
                    Circle()
                        .stroke(task.isComplete ? WorkbenchPalette.sage : WorkbenchPalette.faintInk, lineWidth: 1.2)
                        .frame(width: 17, height: 17)
                    if task.isComplete {
                        Circle()
                            .fill(WorkbenchPalette.sage)
                            .frame(width: 11, height: 11)
                        Image(systemName: "checkmark")
                            .font(.system(size: 7, weight: .bold))
                            .foregroundStyle(Color.white)
                    }
                }
                .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.isComplete ? "Mark \(task.title) incomplete" : "Complete \(task.title)")

            Button(action: onSelect) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(task.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(task.isComplete ? WorkbenchPalette.faintInk : WorkbenchPalette.ink)
                            .strikethrough(task.isComplete, color: WorkbenchPalette.faintInk)
                            .lineLimit(1)

                        Text(task.context)
                            .font(.system(size: 11))
                            .foregroundStyle(WorkbenchPalette.faintInk)
                    }

                    Spacer(minLength: 12)

                    Text(task.schedule)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(isSelected ? WorkbenchPalette.sage : WorkbenchPalette.faintInk)
                        .lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Select \(task.title)")
        }
        .padding(.horizontal, 11)
        .frame(height: 58)
        .background(alignment: .leading) {
            if isSelected {
                Rectangle()
                    .fill(WorkbenchPalette.sage)
                    .frame(width: 2)
            }
        }
        .background(isSelected ? WorkbenchPalette.sageWash : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }
}

private struct CompactTaskSection: View {
    let title: String
    let count: Int
    let tasks: [TaskItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.15)
                    .foregroundStyle(WorkbenchPalette.faintInk)
                Spacer()
                Text("\(count)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(WorkbenchPalette.faintInk)
            }

            VStack(spacing: 12) {
                ForEach(tasks) { task in
                    HStack(alignment: .firstTextBaseline, spacing: 9) {
                        Circle()
                            .fill(WorkbenchPalette.rule)
                            .frame(width: 5, height: 5)

                        Text(task.title)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(WorkbenchPalette.secondaryInk)
                            .lineLimit(1)

                        Spacer(minLength: 8)

                        Text(task.schedule)
                            .font(.system(size: 10))
                            .foregroundStyle(WorkbenchPalette.faintInk)
                            .lineLimit(1)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
