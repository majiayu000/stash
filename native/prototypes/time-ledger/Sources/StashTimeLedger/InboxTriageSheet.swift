import StashCore
import SwiftUI

struct InboxTriageSheet: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedTaskID: UUID?
    @State private var queue: [UUID]
    @State private var choice = "Today"
    @State private var date = Date.now
    @State private var projectID: UUID?
    @State private var error: String?
    @State private var saving = false
    @State private var openedDay: Date?

    init(taskIDs: [UUID], selectedTaskID: Binding<UUID?>) {
        _queue = State(initialValue: taskIDs)
        _selectedTaskID = selectedTaskID
    }

    private var task: LedgerTask? { queue.first.flatMap { store.task(id: $0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Organize Inbox").font(.title2)
            Text("\(queue.count) left in this batch").font(.caption).foregroundStyle(.secondary)
            Text(task?.title ?? "Task unavailable").font(.headline).textSelection(.enabled)
            Picker("Place", selection: $choice) {
                ForEach(["Today", "Date", "Long term", "Project only"], id: \.self) { Text($0) }
            }.pickerStyle(.segmented).labelsHidden()
            if choice == "Date" {
                DatePicker("Work on", selection: $date,
                           in: store.calendar.startOfDay(for: store.currentDate)..., displayedComponents: .date)
                if let due = task?.dueAt, store.calendar.startOfDay(for: date) > store.calendar.startOfDay(for: due) {
                    Text("This is after the deadline. The deadline stays unchanged.")
                        .font(.caption).foregroundStyle(LedgerDesign.warning)
                }
            }
            Picker("Project", selection: $projectID) {
                Text("No project").tag(UUID?.none)
                ForEach(store.workspace.projects) { Text($0.name).tag(Optional($0.id)) }
            }
            if choice == "Project only" {
                Text("This files the task under its project without scheduling it for today.")
                    .font(.caption).foregroundStyle(.secondary)
                if store.workspace.projects.isEmpty {
                    Text("Create a project in Projects first, or choose a date or Long term.")
                        .font(.caption).foregroundStyle(LedgerDesign.warning)
                }
            }
            if let error { Text(error).font(.callout).foregroundStyle(.red).textSelection(.enabled) }
            HStack {
                Button("Close", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction).disabled(saving)
                Spacer()
                Button(saving ? "Saving…" : "Save & next", action: save)
                    .keyboardShortcut(.defaultAction).disabled(saving || task == nil)
            }
        }
        .disabled(saving)
        .padding(24).frame(width: 460)
        .interactiveDismissDisabled(saving)
        .onAppear(perform: loadTask)
    }

    private func loadTask() {
        selectedTaskID = queue.first
        projectID = task?.projectID
        date = max(task?.scheduledFor ?? store.currentDate, store.calendar.startOfDay(for: store.currentDate))
        choice = "Today"
        error = nil
        openedDay = store.calendar.startOfDay(for: store.currentDate)
    }

    private func save() {
        guard let id = queue.first else { return }
        let today = store.calendar.startOfDay(for: store.currentDate)
        guard openedDay == today else {
            openedDay = today
            error = "The day changed. Check your date and save again."
            return
        }
        let destination: InboxDestination
        switch choice {
        case "Date": destination = .date(date)
        case "Long term": destination = .longTerm
        case "Project only": destination = .project
        default: destination = .today
        }
        do {
            try store.organizeInboxTask(id: id, destination: destination, projectID: projectID)
            saving = true
            Task {
                let saved = await store.flush()
                saving = false
                guard saved else {
                    error = "Could not save. This task and your choices are kept here. Retry Save & next."
                    return
                }
                queue.removeFirst()
                queue.removeAll { store.task(id: $0)?.status != .inbox }
                if queue.isEmpty {
                    selectedTaskID = store.inboxTasks.first?.id
                    dismiss()
                } else { loadTask() }
            }
        } catch { self.error = error.localizedDescription }
    }
}
