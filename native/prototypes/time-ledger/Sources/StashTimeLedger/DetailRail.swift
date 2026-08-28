import StashCore
import SwiftUI

struct DetailRail: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?

    var body: some View {
        Group {
            if let task = store.task(id: selectedTaskID) {
                TaskInspector(task: task, selectedTaskID: $selectedTaskID)
            } else {
                HorizonRail(selectedTaskID: $selectedTaskID)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LedgerDesign.horizon)
    }
}

private struct HorizonRail: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HorizonSection(
                    eyebrow: "NEXT 7 DAYS",
                    title: store.shortTermTasks.isEmpty ? "Nothing pressing" : "Coming into view",
                    tint: LedgerDesign.accent,
                    tasks: Array(store.shortTermTasks.prefix(4)),
                    selectedTaskID: $selectedTaskID,
                    emptyText: "Your near horizon is clear."
                )

                Divider().padding(.vertical, 24)

                HorizonSection(
                    eyebrow: "LONG TERM",
                    title: "What compounds",
                    tint: LedgerDesign.creative,
                    tasks: Array(store.longTermTasks.prefix(4)),
                    selectedTaskID: $selectedTaskID,
                    emptyText: "No long-term work yet."
                )
            }
            .padding(.horizontal, 23)
            .padding(.top, 26)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.never)
    }
}

private struct HorizonSection: View {
    @EnvironmentObject private var store: LedgerStore
    let eyebrow: String
    let title: String
    let tint: Color
    let tasks: [LedgerTask]
    @Binding var selectedTaskID: UUID?
    let emptyText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.05)
                .foregroundStyle(tint)

            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .padding(.top, 7)
                .padding(.bottom, 15)

            if tasks.isEmpty {
                Text(emptyText)
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
                    .padding(.vertical, 9)
            } else {
                ForEach(Array(tasks.enumerated()), id: \.element.id) { index, task in
                    Button {
                        selectedTaskID = task.id
                    } label: {
                        HStack(alignment: .top, spacing: 11) {
                            Image(systemName: store.project(for: task)?.symbol ?? "circle")
                                .font(.system(size: 12))
                                .foregroundStyle(projectTint(for: task))
                                .frame(width: 18, height: 19)
                                .accessibilityHidden(true)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(task.title)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)

                                Text(detail(for: task))
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

                    if index < tasks.count - 1 {
                        Divider().padding(.leading, 29)
                    }
                }
            }
        }
    }

    private func detail(for task: LedgerTask) -> String {
        if let date = task.dueAt { return "Due \(date.ledgerShortDate) · \(task.estimateMinutes)m" }
        if let date = task.scheduledFor { return "\(date.ledgerShortDate) · \(task.estimateMinutes)m" }
        if let project = store.project(for: task) { return "\(project.name) · \(task.estimateMinutes)m" }
        return "\(task.priority.label) · \(task.estimateMinutes)m"
    }

    private func projectTint(for task: LedgerTask) -> Color {
        guard let project = store.project(for: task) else { return tint }
        return LedgerDesign.projectColor(for: project.name)
    }
}

private struct TaskInspector: View {
    @EnvironmentObject private var store: LedgerStore
    let task: LedgerTask
    @Binding var selectedTaskID: UUID?

    @State private var title = ""
    @State private var notes = ""
    @State private var projectID: UUID?
    @State private var priority: TaskPriority = .p2
    @State private var estimateMinutes = 30
    @State private var horizon: TaskHorizon = .shortTerm
    @State private var hasScheduledDate = false
    @State private var scheduledFor = Date.now
    @State private var hasDueDate = false
    @State private var dueAt = Date.now
    @State private var recurrence: TaskRecurrence?
    @State private var hasReminder = false
    @State private var reminderAt = Date.now
    @State private var showProjectPicker = false
    @State private var confirmDelete = false
    @State private var savedFeedback = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("TASK")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.05)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        selectedTaskID = nil
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .semibold))
                            .frame(width: 22, height: 22)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close task details")
                }

                TextField("Task title", text: $title, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18, weight: .semibold))
                    .lineLimit(1...3)
                    .padding(.top, 11)

                if let reason = store.todayRows.first(where: { $0.id == task.id })?.reason {
                    Label(reason, systemImage: "arrow.up.forward")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(LedgerDesign.accent)
                        .padding(.top, 8)
                }

                Divider().padding(.vertical, 18)

                inspectorField("STATUS") {
                    HStack(spacing: 7) {
                        Circle()
                            .fill(statusColor)
                            .frame(width: 7, height: 7)
                        Text(statusLabel)
                            .font(.system(size: 12, weight: .medium))
                    }
                }

                inspectorField("PROJECT") {
                    Button {
                        showProjectPicker = true
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: selectedProject?.symbol ?? "circle.dashed")
                                .foregroundStyle(
                                    selectedProject.map { LedgerDesign.projectColor(for: $0.name) }
                                        ?? Color.secondary
                                )
                                .frame(width: 18)

                            Text(selectedProject?.name ?? "No project")
                                .foregroundStyle(.primary)

                            Spacer()

                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(LedgerDesign.field, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(LedgerDesign.hairline, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showProjectPicker, arrowEdge: .leading) {
                        ProjectChooser(selection: $projectID)
                            .environmentObject(store)
                    }
                }

                inspectorField("PRIORITY") {
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.allCases, id: \.self) { value in
                            Text(value.label).tag(value)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(maxWidth: .infinity)
                }

                inspectorField("HORIZON") {
                    Picker("Horizon", selection: $horizon) {
                        ForEach(TaskHorizon.allCases, id: \.self) { value in
                            Text(value.label).tag(value)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(maxWidth: .infinity)
                }

                inspectorField("ESTIMATE") {
                    HStack(spacing: 10) {
                        Text(estimateLabel)
                            .font(.system(size: 13, weight: .medium))

                        Spacer()

                        Button {
                            estimateMinutes = max(5, estimateMinutes - 5)
                        } label: {
                            Image(systemName: "minus")
                                .frame(width: 16, height: 16)
                        }
                        .disabled(estimateMinutes <= 5)

                        Button {
                            estimateMinutes = min(480, estimateMinutes + 5)
                        } label: {
                            Image(systemName: "plus")
                                .frame(width: 16, height: 16)
                        }
                        .disabled(estimateMinutes >= 480)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }

                Divider().padding(.vertical, 11)

                inspectorField("SCHEDULE") {
                    Toggle("Set date", isOn: $hasScheduledDate)
                        .toggleStyle(.switch)
                        .controlSize(.small)
                }

                if hasScheduledDate {
                    DatePicker("Scheduled date", selection: $scheduledFor, displayedComponents: .date)
                        .labelsHidden()
                        .padding(.bottom, 5)
                }

                inspectorField("DEADLINE") {
                    Toggle("Set deadline", isOn: $hasDueDate)
                        .toggleStyle(.switch)
                        .controlSize(.small)
                }

                if hasDueDate {
                    DatePicker("Deadline", selection: $dueAt, displayedComponents: .date)
                        .labelsHidden()
                        .padding(.bottom, 5)
                }

                inspectorField("REPEAT") {
                    Menu {
                        Button("Never") { recurrence = nil }
                        ForEach(TaskRecurrence.allCases, id: \.self) { value in
                            Button(value.label) { recurrence = value }
                        }
                    } label: {
                        HStack {
                            Image(systemName: "repeat")
                                .foregroundStyle(.secondary)
                            Text(recurrence?.label ?? "Never")
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(LedgerDesign.field, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(LedgerDesign.hairline, lineWidth: 1)
                        }
                    }
                    .menuStyle(.borderlessButton)
                }

                inspectorField("REMINDER") {
                    Toggle("Notify me", isOn: $hasReminder)
                        .toggleStyle(.switch)
                        .controlSize(.small)
                }

                if hasReminder {
                    DatePicker(
                        "Reminder",
                        selection: $reminderAt,
                        in: Date.now...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .labelsHidden()
                    .padding(.bottom, 7)
                }

                Divider().padding(.vertical, 11)

                Text("NOTES")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
                    .padding(.bottom, 7)

                TextEditor(text: $notes)
                    .font(.system(size: 12))
                    .scrollContentBackground(.hidden)
                    .padding(7)
                    .frame(minHeight: 84)
                    .background {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(LedgerDesign.canvas)
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(LedgerDesign.hairline, lineWidth: 1)
                    }

                Button {
                    save()
                } label: {
                    HStack {
                        Text(savedFeedback ? "Saved" : "Save changes")
                        Spacer()
                        if savedFeedback { Image(systemName: "checkmark") }
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .padding(.top, 14)

                Divider().padding(.vertical, 19)

                VStack(alignment: .leading, spacing: 12) {
                    if task.status == .cancelled {
                        Button {
                            store.restore(id: task.id)
                            selectedTaskID = nil
                        } label: {
                            Label("Restore task", systemImage: "arrow.uturn.backward")
                        }

                        Button(role: .destructive) {
                            confirmDelete = true
                        } label: {
                            Label("Delete permanently", systemImage: "trash.slash")
                        }
                    } else {
                        Button {
                            store.start(id: task.id)
                        } label: {
                            Label("Start now", systemImage: "play.fill")
                        }

                        Button {
                            store.moveToToday(id: task.id)
                        } label: {
                            Label("Move to today", systemImage: "sun.max")
                        }

                        Button {
                            store.moveToTomorrow(id: task.id)
                        } label: {
                            Label("Move to tomorrow", systemImage: "arrow.right")
                        }

                        Button {
                            store.deferTask(id: task.id)
                        } label: {
                            Label("Defer three days", systemImage: "clock.arrow.2.circlepath")
                        }

                        Button(role: .destructive) {
                            confirmDelete = true
                        } label: {
                            Label("Move to Trash", systemImage: "trash")
                        }
                    }
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
            }
            .padding(.horizontal, 23)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.never)
        .onAppear(perform: loadDraft)
        .onChange(of: task.id) { _, _ in loadDraft() }
        .confirmationDialog(
            task.status == .cancelled
                ? "Permanently delete “\(task.title)”?"
                : "Move “\(task.title)” to Trash?",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button(task.status == .cancelled ? "Delete permanently" : "Move to Trash", role: .destructive) {
                if task.status == .cancelled {
                    store.permanentlyDelete(id: task.id)
                } else {
                    store.delete(id: task.id)
                }
                selectedTaskID = nil
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(task.status == .cancelled
                 ? "This cannot be undone."
                 : "You can restore this task from Review.")
        }
    }

    private func inspectorField<Content: View>(
        _ label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.7)
                .foregroundStyle(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 15)
    }

    private var selectedProject: LedgerProject? {
        guard let projectID else { return nil }
        return store.workspace.projects.first { $0.id == projectID }
    }

    private var estimateLabel: String {
        if estimateMinutes < 60 { return "\(estimateMinutes) minutes" }
        let hours = estimateMinutes / 60
        let minutes = estimateMinutes % 60
        return minutes == 0 ? "\(hours) hours" : "\(hours)h \(minutes)m"
    }

    private var statusLabel: String {
        switch task.status {
        case .inbox: "Inbox"
        case .planned: "Planned"
        case .active: "In progress"
        case .completed: "Completed"
        case .deferred: "Deferred"
        case .cancelled: "Cancelled"
        }
    }

    private var statusColor: Color {
        switch task.status {
        case .active: LedgerDesign.success
        case .completed: LedgerDesign.accent
        case .deferred: LedgerDesign.warning
        default: .secondary
        }
    }

    private func loadDraft() {
        title = task.title
        notes = task.notes
        projectID = task.projectID
        priority = task.priority
        estimateMinutes = task.estimateMinutes
        horizon = task.horizon
        hasScheduledDate = task.scheduledFor != nil
        scheduledFor = task.scheduledFor ?? .now
        hasDueDate = task.dueAt != nil
        dueAt = task.dueAt ?? .now
        recurrence = task.recurrence
        hasReminder = task.reminderAt != nil
        let defaultReminder = Calendar.current.date(byAdding: .hour, value: 1, to: .now) ?? .now
        reminderAt = max(task.reminderAt ?? defaultReminder, .now)
        savedFeedback = false
    }

    private func save() {
        store.updateTask(
            id: task.id,
            title: title,
            notes: notes,
            projectID: projectID,
            priority: priority,
            estimateMinutes: estimateMinutes,
            horizon: horizon,
            scheduledFor: hasScheduledDate ? scheduledFor : nil,
            dueAt: hasDueDate ? dueAt : nil,
            recurrence: recurrence,
            reminderAt: hasReminder ? reminderAt : nil
        )
        savedFeedback = true
        Task {
            try? await Task.sleep(for: .seconds(1))
            savedFeedback = false
        }
    }
}

private struct ProjectChooser: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    @Binding var selection: UUID?
    @State private var query = ""
    @FocusState private var searchIsFocused: Bool

    private var cleanQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var filteredProjects: [LedgerProject] {
        guard !cleanQuery.isEmpty else { return store.workspace.projects }
        return store.workspace.projects.filter {
            $0.name.localizedCaseInsensitiveContains(cleanQuery)
        }
    }

    private var exactMatchExists: Bool {
        store.workspace.projects.contains {
            $0.name.localizedCaseInsensitiveCompare(cleanQuery) == .orderedSame
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Find or create a project", text: $query)
                    .textFieldStyle(.plain)
                    .focused($searchIsFocused)
            }
            .padding(.horizontal, 12)
            .frame(height: 38)

            Divider()

            ScrollView {
                LazyVStack(spacing: 2) {
                    if cleanQuery.isEmpty {
                        projectOption(
                            title: "No project",
                            symbol: "circle.dashed",
                            detail: "Keep this task unfiled",
                            isSelected: selection == nil
                        ) {
                            selection = nil
                            dismiss()
                        }
                    }

                    ForEach(filteredProjects) { project in
                        projectOption(
                            title: project.name,
                            symbol: project.symbol,
                            detail: taskCountLabel(for: project),
                            isSelected: selection == project.id,
                            tint: LedgerDesign.projectColor(for: project.name)
                        ) {
                            selection = project.id
                            dismiss()
                        }
                    }

                    if !cleanQuery.isEmpty && !exactMatchExists {
                        Divider().padding(.vertical, 4)

                        Button {
                            if let project = store.createProject(name: cleanQuery) {
                                selection = project.id
                            }
                            dismiss()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "plus.circle.fill")
                                    .foregroundStyle(LedgerDesign.accent)
                                    .frame(width: 20)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Create “\(cleanQuery)”")
                                        .font(.system(size: 13, weight: .medium))
                                    Text("Create and assign to this task")
                                        .font(.system(size: 11))
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(6)
            }
            .frame(maxHeight: 270)
        }
        .frame(width: 300)
        .onAppear { searchIsFocused = true }
    }

    private func projectOption(
        title: String,
        symbol: String,
        detail: String,
        isSelected: Bool,
        tint: Color = .secondary,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .foregroundStyle(tint)
                    .frame(width: 20)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.primary)
                    Text(detail)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LedgerDesign.accent)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func taskCountLabel(for project: LedgerProject) -> String {
        let count = store.tasks(in: project).count
        return count == 1 ? "1 open task" : "\(count) open tasks"
    }
}
