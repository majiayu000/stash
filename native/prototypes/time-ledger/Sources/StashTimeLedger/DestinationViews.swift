import StashCore
import SwiftUI

struct TodayLedgerView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?
    @State private var adjusting = false

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
                    Text(store.currentDate.ledgerDayTitle)
                        .font(.system(size: 25, weight: .semibold))

                    Spacer()

                    Text("\(store.todayCompletedCount) of \(store.todayRows.count) done · \(ledgerDuration(store.todayRemainingMinutes)) remaining")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }

                Text(store.planIsLocked
                     ? "Your order is fixed for today. New captures stay out until you unlock or move them here."
                     : "Automatically ordered by active work, deadlines, schedule, priority, and age.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                HStack(alignment: .firstTextBaseline) {
                    Text("\(ledgerDuration(store.todayEstimateMinutes)) planned / \(ledgerDuration(store.planningPreferences.minuteBudget)) budget" +
                         (store.todayEstimateMinutes > store.planningPreferences.minuteBudget
                          ? " · \(ledgerDuration(store.todayEstimateMinutes - store.planningPreferences.minuteBudget)) over" : ""))
                        .font(.system(size: 11))
                        .foregroundStyle(store.todayEstimateMinutes > store.planningPreferences.minuteBudget ? LedgerDesign.warning : Color.secondary)
                    Spacer()
                    Button(adjusting ? "Finish adjusting" : "Adjust tasks") { adjusting.toggle() }
                        .buttonStyle(.borderless).font(.system(size: 11, weight: .medium))
                }
                if store.todayRows.count < store.planningPreferences.minimumTasks && store.openTaskCount > 0
                    && store.todayEstimateMinutes <= store.planningPreferences.minuteBudget {
                    Text("A shorter plan fits today's availability and budget. Open Inbox or Upcoming to choose more work.")
                        .font(.caption).foregroundStyle(.secondary)
                }

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
                    store.openTaskCount > 0 ? "Nothing selected for today" : "A clear day",
                    systemImage: "sun.max",
                    description: Text(store.openTaskCount > 0 ? "Work may be waiting, scheduled later, or outside the time budget. Open Inbox or Upcoming to choose a task." : "Capture work or schedule a task for today. Stash will build the order.")
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
                            if adjusting && row.task.isOpen {
                                TaskPlanningActions(task: row.task, allowsReplacement: true)
                                    .padding(.leading, 64).padding(.bottom, 12)
                            }
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
        .onExitCommand { adjusting = false }
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

private struct InboxBatch: Identifiable {
    let id = UUID()
    let taskIDs: [UUID]
}

struct InboxView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?
    @State private var batch: InboxBatch?

    var body: some View {
        VStack(spacing: 0) {
            LedgerSectionHeader(eyebrow: "INBOX", title: "Decide once",
                                subtitle: "Give each capture a date, a horizon, or a project.")
            HStack {
                Spacer()
                Button("Organize Inbox…") { organize(startingAt: selectedTaskID) }
                    .disabled(store.inboxTasks.isEmpty)
            }.padding(.horizontal, 28).padding(.bottom, 12)
            Divider().padding(.horizontal, 28)
            if store.inboxTasks.isEmpty {
                ContentUnavailableView("Inbox zero", systemImage: "tray",
                                       description: Text("Every capture has a place."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(store.inboxTasks) { task in
                            VStack(alignment: .leading, spacing: 0) {
                                LedgerTaskRow(task: task, reason: task.notes.isEmpty ? "Needs a decision" : task.notes,
                                              dateLabel: nil, isSelected: selectedTaskID == task.id,
                                              onSelect: { selectedTaskID = task.id })
                                Button("Organize…") { organize(startingAt: task.id) }
                                    .buttonStyle(.borderless).font(.system(size: 11, weight: .medium))
                                    .padding(.leading, 74).padding(.bottom, 12)
                                    .accessibilityIdentifier("stash.inbox.organize.\(task.id)")
                                Divider().padding(.leading, 74).padding(.trailing, 28)
                            }
                        }
                    }.padding(.vertical, 4)
                }
            }
        }
        .sheet(item: $batch) { batch in
            InboxTriageSheet(taskIDs: batch.taskIDs, selectedTaskID: $selectedTaskID)
                .environmentObject(store)
        }
    }

    private func organize(startingAt id: UUID?) {
        let ids = store.inboxTasks.map(\.id)
        guard !ids.isEmpty else { return }
        let index = id.flatMap { ids.firstIndex(of: $0) } ?? 0
        batch = InboxBatch(taskIDs: Array(ids[index...]) + Array(ids[..<index]))
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
                            let workflow = ProjectWorkflow(
                                tasks: tasks + store.workspace.tasks.filter { $0.projectID == project.id && $0.status == .completed },
                                now: store.currentDate, calendar: store.calendar)
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

                                if let goal = project.goal, !goal.isEmpty {
                                    Text(goal).font(.callout).textSelection(.enabled)
                                        .padding(.horizontal, 55).padding(.bottom, 8)
                                } else {
                                    Button("Add a project goal…") { projectEditor = ProjectEditorTarget(project: project) }
                                        .buttonStyle(.borderless).font(.caption)
                                        .padding(.horizontal, 55).padding(.bottom, 8)
                                }
                                Text(workflow.guidance).font(.caption).foregroundStyle(.secondary)
                                    .padding(.horizontal, 55).padding(.bottom, 12)
                                projectTasks("READY FOR A NEXT STEP", tasks: workflow.ready)
                                projectTasks("WAITING", tasks: workflow.waiting)
                                projectTasks("LATER", tasks: workflow.later)
                                projectTasks("NEEDS A DECISION", tasks: workflow.inbox)

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
    @ViewBuilder
    private func projectTasks(_ title: String, tasks: [LedgerTask]) -> some View {
        if !tasks.isEmpty {
            Text(title).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                .padding(.horizontal, 55).padding(.top, 8)
            ForEach(tasks) { task in
                LedgerTaskRow(task: task, reason: task.waitingOn ?? task.notes,
                              dateLabel: (task.status == .waiting ? task.reviewAt : task.scheduledFor)?.ledgerShortDate,
                              isSelected: selectedTaskID == task.id,
                              onSelect: { selectedTaskID = task.id })
            }
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
    @State private var goal: String
    @State private var savedProjectID: UUID?
    @State private var saving = false
    @State private var error: String?
    @State private var confirmDelete = false

    private let symbols = ["folder", "hammer", "shippingbox", "paintpalette", "briefcase", "person"]

    init(project: LedgerProject?) {
        self.project = project
        _name = State(initialValue: project?.name ?? "")
        _symbol = State(initialValue: project?.symbol ?? "folder")
        _goal = State(initialValue: project?.goal ?? "")
        _savedProjectID = State(initialValue: project?.id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(project == nil ? "New project" : "Edit project")
                .font(.system(size: 19, weight: .semibold))

            TextField("Project name", text: $name)
                .textFieldStyle(.roundedBorder)

            TextField("What does success look like?", text: $goal, axis: .vertical)
                .lineLimit(2...4).textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("stash.project.goal")

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
                Button("Cancel", role: .cancel) { dismiss() }.disabled(saving)
                Button(saving ? "Saving…" : "Save", action: save)
                    .buttonStyle(.borderedProminent)
                    .disabled(saving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }

        }
        .disabled(saving)
        .padding(24)
        .frame(width: 400)
        .interactiveDismissDisabled(saving)
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
    private func save() {
        if let id = savedProjectID {
            guard store.workspace.projects.contains(where: { $0.id == id }) else {
                error = "This project no longer exists. Close this editor and create a new project."
                return
            }
            store.updateProject(id: id, name: name, symbol: symbol, goal: goal)
        } else {
            guard !store.workspace.projects.contains(where: {
                $0.name.localizedCaseInsensitiveCompare(name.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
            }) else {
                error = "A project with this name already exists. Choose another name."
                return
            }
            savedProjectID = store.createProject(name: name, symbol: symbol, goal: goal)?.id
        }
        saving = true
        Task {
            let saved = await store.flush()
            saving = false
            if saved { dismiss() }
            else { error = "Could not save. Your name and goal are kept; try again." }
        }
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
