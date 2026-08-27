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
                    tasks: Array(store.shortTermTasks.prefix(4)),
                    selectedTaskID: $selectedTaskID,
                    emptyText: "Your near horizon is clear."
                )

                Divider().padding(.vertical, 24)

                HorizonSection(
                    eyebrow: "LONG TERM",
                    title: "What compounds",
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
    let tasks: [LedgerTask]
    @Binding var selectedTaskID: UUID?
    let emptyText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.05)
                .foregroundStyle(.secondary)

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
                                .foregroundStyle(.secondary)
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
                    Picker("Project", selection: $projectID) {
                        Text("No project").tag(nil as UUID?)
                        ForEach(store.workspace.projects) { project in
                            Text(project.name).tag(Optional(project.id))
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                inspectorField("PRIORITY") {
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.allCases, id: \.self) { value in
                            Text(value.label).tag(value)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }

                inspectorField("HORIZON") {
                    Picker("Horizon", selection: $horizon) {
                        ForEach(TaskHorizon.allCases, id: \.self) { value in
                            Text(value.label).tag(value)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }

                inspectorField("ESTIMATE") {
                    Stepper(value: $estimateMinutes, in: 5...480, step: 5) {
                        Text("\(estimateMinutes) minutes")
                            .font(.system(size: 12))
                    }
                }

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
                            .fill(Color.primary.opacity(0.04))
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(Color.primary.opacity(0.075), lineWidth: 1)
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
                        Label("Delete task", systemImage: "trash")
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
            "Delete “\(task.title)”?",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                store.delete(id: task.id)
                selectedTaskID = nil
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes the task from the local workspace.")
        }
    }

    private func inspectorField<Content: View>(
        _ label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.7)
                .foregroundStyle(.secondary)
                .frame(width: 61, alignment: .leading)
            content()
            Spacer(minLength: 0)
        }
        .frame(minHeight: 34)
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
            horizon: horizon
        )
        savedFeedback = true
        Task {
            try? await Task.sleep(for: .seconds(1))
            savedFeedback = false
        }
    }
}
