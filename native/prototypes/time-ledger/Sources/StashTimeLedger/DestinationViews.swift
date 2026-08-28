import StashCore
import SwiftUI

struct TodayLedgerView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("TODAY")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.1)
                        .foregroundStyle(LedgerDesign.accent)

                    Spacer()

                    Button {
                        store.togglePlanLock()
                    } label: {
                        Label(
                            store.planIsLocked ? "Locked" : "Lock today",
                            systemImage: store.planIsLocked ? "lock.fill" : "lock.open"
                        )
                    }
                    .buttonStyle(.borderless)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(LedgerDesign.accent)

                    Button("Replan") {
                        store.replanToday()
                    }
                    .buttonStyle(.borderless)
                    .font(.system(size: 11, weight: .medium))
                    .disabled(store.planIsLocked)
                    .help(store.planIsLocked ? "Unlock today before replanning" : "Recalculate today's order")
                }

                HStack(alignment: .firstTextBaseline) {
                    Text(Date.now.ledgerDayTitle)
                        .font(.system(size: 25, weight: .semibold))

                    Spacer()

                    Text("\(store.todayCompletedCount) of \(store.todayRows.count) done · \(durationLabel)")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }

                Text(store.planIsLocked
                     ? "Your order is fixed for today. New captures stay out until you unlock or move them here."
                     : "Automatically ordered by active work, deadlines, schedule, priority, and age.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                TodayProgressPath(
                    completed: store.todayCompletedCount,
                    total: store.todayRows.count
                )
                .padding(.top, 3)
            }
            .padding(.horizontal, 28)
            .padding(.top, 23)
            .padding(.bottom, 20)

            Divider()
                .padding(.horizontal, 28)

            if store.todayRows.isEmpty {
                ContentUnavailableView(
                    "A clear day",
                    systemImage: "sun.max",
                    description: Text("Capture work or schedule a task for today. Stash will build the order.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(store.todayRows.enumerated()), id: \.element.id) { index, row in
                            LedgerTaskRow(
                                task: row.task,
                                reason: row.reason,
                                dateLabel: nil,
                                isSelected: selectedTaskID == row.id,
                                onSelect: { selectedTaskID = row.id }
                            )
                            if index < store.todayRows.count - 1 {
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
    }

    private var durationLabel: String {
        let minutes = store.todayEstimateMinutes
        if minutes >= 60 {
            let hours = minutes / 60
            let remainder = minutes % 60
            return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
        }
        return "\(minutes)m"
    }
}

private struct TodayProgressPath: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let completed: Int
    let total: Int

    private var progress: Double {
        guard total > 0 else { return 0 }
        return min(1, Double(completed) / Double(total))
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(LedgerDesign.accent.opacity(0.045))

            LedgerRouteShape()
                .stroke(
                    LedgerDesign.accent.opacity(0.24),
                    style: StrokeStyle(lineWidth: 1.25, lineCap: .round, lineJoin: .round)
                )

            if progress > 0 {
                LedgerRouteShape()
                    .trim(from: 0, to: progress)
                    .stroke(
                        LedgerDesign.accent,
                        style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
                    )
            }

            GeometryReader { proxy in
                Circle()
                    .fill(LedgerDesign.mint)
                    .frame(width: 8, height: 8)
                    .scaleEffect(completed == total && total > 0 ? 1 : 0.82)
                    .position(x: proxy.size.width, y: proxy.size.height * 0.5)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(height: 34)
        .animation(reduceMotion ? nil : LedgerDesign.feedbackAnimation, value: completed)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Today progress")
        .accessibilityValue("\(completed) of \(total) tasks complete")
    }
}

private struct LedgerRouteShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let lower = rect.height * 0.72
        let upper = rect.height * 0.28
        let middle = rect.height * 0.50

        path.move(to: CGPoint(x: rect.minX, y: lower))
        path.addLine(to: CGPoint(x: rect.width * 0.30, y: lower))
        path.addCurve(
            to: CGPoint(x: rect.width * 0.43, y: upper),
            control1: CGPoint(x: rect.width * 0.36, y: lower),
            control2: CGPoint(x: rect.width * 0.36, y: upper)
        )
        path.addLine(to: CGPoint(x: rect.width * 0.72, y: upper))
        path.addCurve(
            to: CGPoint(x: rect.width * 0.84, y: middle),
            control1: CGPoint(x: rect.width * 0.78, y: upper),
            control2: CGPoint(x: rect.width * 0.78, y: middle)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: middle))
        return path
    }
}

struct InboxView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?

    var body: some View {
        VStack(spacing: 0) {
            LedgerSectionHeader(
                eyebrow: "INBOX",
                title: "Decide once",
                subtitle: "Captured thoughts stay here until they have a place in time."
            )

            Divider().padding(.horizontal, 28)

            if store.inboxTasks.isEmpty {
                ContentUnavailableView(
                    "Inbox zero",
                    systemImage: "tray",
                    description: Text("Everything has a time or a horizon.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(store.inboxTasks.enumerated()), id: \.element.id) { index, task in
                            VStack(spacing: 0) {
                                LedgerTaskRow(
                                    task: task,
                                    reason: task.notes.isEmpty ? "Needs a decision" : task.notes,
                                    dateLabel: nil,
                                    isSelected: selectedTaskID == task.id,
                                    onSelect: { selectedTaskID = task.id }
                                )

                                HStack(spacing: 14) {
                                    Button("Today") { store.moveToToday(id: task.id) }
                                    Button("Tomorrow") { store.moveToTomorrow(id: task.id) }
                                    Button("Long term") { store.moveToLongTerm(id: task.id) }
                                    Spacer()
                                }
                                .buttonStyle(.borderless)
                                .font(.system(size: 11, weight: .medium))
                                .padding(.leading, 74)
                                .padding(.trailing, 28)
                                .padding(.bottom, 12)
                            }

                            if index < store.inboxTasks.count - 1 {
                                Divider().padding(.leading, 74).padding(.trailing, 28)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .scrollIndicators(.never)
            }
        }
    }
}

struct UpcomingView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?

    var body: some View {
        TaskCollectionView(
            eyebrow: "UPCOMING",
            title: "The next horizon",
            subtitle: "Scheduled work stays visible without competing with today.",
            tasks: store.upcomingTasks,
            selectedTaskID: $selectedTaskID,
            emptySymbol: "calendar",
            emptyTitle: "Nothing scheduled",
            emptyDescription: "Move an Inbox task to tomorrow or add !tomorrow while capturing."
        )
    }
}

struct ProjectsView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?
    @State private var projectEditor: ProjectEditorTarget?

    var body: some View {
        VStack(spacing: 0) {
            LedgerSectionHeader(
                eyebrow: "PROJECTS",
                title: "Work with a home",
                subtitle: "Projects group context. Time still decides what reaches Today."
            )

            HStack {
                Spacer()
                Button {
                    projectEditor = ProjectEditorTarget(project: nil)
                } label: {
                    Label("New project", systemImage: "plus")
                }
                .buttonStyle(.borderless)
                .font(.system(size: 11, weight: .medium))
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 10)

            Divider().padding(.horizontal, 28)

            if store.workspace.projects.isEmpty {
                ContentUnavailableView(
                    "No projects yet",
                    systemImage: "folder",
                    description: Text("Capture with #project to create one.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(store.workspace.projects) { project in
                            let tasks = store.tasks(in: project)
                            VStack(alignment: .leading, spacing: 0) {
                                HStack(spacing: 9) {
                                    Image(systemName: project.symbol)
                                        .foregroundStyle(LedgerDesign.projectColor(for: project.name))
                                        .frame(width: 18)
                                    Text(project.name)
                                        .font(.system(size: 15, weight: .semibold))
                                    Text("\(tasks.count) open")
                                        .font(.system(size: 11))
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Button {
                                        projectEditor = ProjectEditorTarget(project: project)
                                    } label: {
                                        Image(systemName: "ellipsis")
                                            .frame(width: 22, height: 22)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Edit \(project.name)")
                                }
                                .padding(.horizontal, 28)
                                .padding(.top, 22)
                                .padding(.bottom, 8)

                                if tasks.isEmpty {
                                    Text("Nothing open")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.tertiary)
                                        .padding(.horizontal, 55)
                                        .padding(.bottom, 16)
                                } else {
                                    ForEach(tasks) { task in
                                        LedgerTaskRow(
                                            task: task,
                                            reason: task.notes,
                                            dateLabel: task.scheduledFor?.ledgerShortDate,
                                            isSelected: selectedTaskID == task.id,
                                            onSelect: { selectedTaskID = task.id }
                                        )
                                    }
                                }
                            }

                            Divider().padding(.horizontal, 28)
                        }
                    }
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.never)
            }
        }
        .sheet(item: $projectEditor) { target in
            ProjectEditorSheet(project: target.project)
                .environmentObject(store)
        }
    }
}

private struct ProjectEditorTarget: Identifiable {
    let id = UUID()
    let project: LedgerProject?
}

private struct ProjectEditorSheet: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    let project: LedgerProject?

    @State private var name: String
    @State private var symbol: String
    @State private var confirmDelete = false

    private let symbols = ["folder", "hammer", "shippingbox", "paintpalette", "briefcase", "person"]

    init(project: LedgerProject?) {
        self.project = project
        _name = State(initialValue: project?.name ?? "")
        _symbol = State(initialValue: project?.symbol ?? "folder")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(project == nil ? "New project" : "Edit project")
                .font(.system(size: 19, weight: .semibold))

            TextField("Project name", text: $name)
                .textFieldStyle(.roundedBorder)

            Picker("Icon", selection: $symbol) {
                ForEach(symbols, id: \.self) { value in
                    Label(value.capitalized, systemImage: value).tag(value)
                }
            }

            HStack {
                if project != nil {
                    Button("Delete", role: .destructive) {
                        confirmDelete = true
                    }
                }
                Spacer()
                Button("Cancel", role: .cancel) { dismiss() }
                Button("Save") {
                    if let project {
                        store.updateProject(id: project.id, name: name, symbol: symbol)
                    } else {
                        store.createProject(name: name, symbol: symbol)
                    }
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
        .frame(width: 360)
        .confirmationDialog(
            "Delete “\(project?.name ?? "project")”?",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete project", role: .destructive) {
                if let project { store.deleteProject(id: project.id) }
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Tasks are kept and moved to No project.")
        }
    }
}

struct ReviewView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?

    private var deferredTasks: [LedgerTask] {
        store.workspace.tasks
            .filter { $0.status == .deferred && $0.isOpen }
            .sorted { ($0.deferredUntil ?? .distantFuture) < ($1.deferredUntil ?? .distantFuture) }
    }

    var body: some View {
        VStack(spacing: 0) {
            LedgerSectionHeader(
                eyebrow: "REVIEW",
                title: reviewTitle,
                subtitle: "A short record of movement and work deliberately left for later."
            )

            Divider().padding(.horizontal, 28)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ReviewGroup(
                        title: "COMPLETED TODAY",
                        tasks: store.completedToday,
                        emptyText: "No completed tasks yet",
                        selectedTaskID: $selectedTaskID
                    )

                    Divider().padding(.horizontal, 28).padding(.vertical, 16)

                    ReviewGroup(
                        title: "DEFERRED",
                        tasks: deferredTasks,
                        emptyText: "Nothing is waiting to return",
                        selectedTaskID: $selectedTaskID
                    )

                    Divider().padding(.horizontal, 28).padding(.vertical, 16)

                    ReviewGroup(
                        title: "TRASH",
                        tasks: store.trashedTasks,
                        emptyText: "Trash is empty",
                        selectedTaskID: $selectedTaskID
                    )
                }
                .padding(.vertical, 18)
            }
            .scrollIndicators(.never)
        }
    }

    private var reviewTitle: String {
        let count = store.completedToday.count
        return count == 0 ? "The day is still open" : "\(count) meaningful \(count == 1 ? "step" : "steps")"
    }
}

struct TaskCollectionView: View {
    @EnvironmentObject private var store: LedgerStore
    let eyebrow: String
    let title: String
    let subtitle: String
    let tasks: [LedgerTask]
    @Binding var selectedTaskID: UUID?
    let emptySymbol: String
    let emptyTitle: String
    let emptyDescription: String

    var body: some View {
        VStack(spacing: 0) {
            LedgerSectionHeader(eyebrow: eyebrow, title: title, subtitle: subtitle)
            Divider().padding(.horizontal, 28)

            if tasks.isEmpty {
                ContentUnavailableView(
                    emptyTitle,
                    systemImage: emptySymbol,
                    description: Text(emptyDescription)
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(tasks.enumerated()), id: \.element.id) { index, task in
                            LedgerTaskRow(
                                task: task,
                                reason: task.notes,
                                dateLabel: (task.scheduledFor ?? task.dueAt)?.ledgerShortDate,
                                isSelected: selectedTaskID == task.id,
                                onSelect: { selectedTaskID = task.id }
                            )
                            if index < tasks.count - 1 {
                                Divider().padding(.leading, 74).padding(.trailing, 28)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .scrollIndicators(.never)
            }
        }
    }
}

struct LedgerSectionHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.1)
                .foregroundStyle(eyebrowTint)
            Text(title)
                .font(.system(size: 25, weight: .semibold))
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 28)
        .padding(.top, 23)
        .padding(.bottom, 20)
    }

    private var eyebrowTint: Color {
        switch eyebrow {
        case "INBOX": LedgerDesign.apricot
        case "PROJECTS": LedgerDesign.creative
        case "REVIEW": LedgerDesign.mint
        default: LedgerDesign.accent
        }
    }
}

private struct ReviewGroup: View {
    let title: String
    let tasks: [LedgerTask]
    let emptyText: String
    @Binding var selectedTaskID: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 28)

            if tasks.isEmpty {
                Text(emptyText)
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 14)
            } else {
                ForEach(tasks) { task in
                    LedgerTaskRow(
                        task: task,
                        reason: task.notes,
                        dateLabel: nil,
                        isSelected: selectedTaskID == task.id,
                        onSelect: { selectedTaskID = task.id }
                    )
                }
            }
        }
    }
}
