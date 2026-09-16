import StashCore
import SwiftUI

struct ReplaceTodayTaskSheet: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    let taskID: UUID
    @State private var candidates: [LedgerTask] = []
    @State private var selectedID: UUID?
    @State private var search = ""
    @State private var date = Date.now
    @State private var openedDay = Date.now
    @State private var error: String?
    @State private var saving = false
    @State private var applied = false

    private var outgoing: LedgerTask? { store.task(id: taskID) }
    private var incoming: LedgerTask? { selectedID.flatMap { store.task(id: $0) } }
    private var tomorrow: Date? {
        store.calendar.date(byAdding: .day, value: 1, to: store.calendar.startOfDay(for: store.currentDate))
    }
    private var filtered: [LedgerTask] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return candidates }
        return candidates.filter {
            $0.title.localizedCaseInsensitiveContains(query)
                || (store.project(for: $0)?.name.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Replace today's task").font(.title2)
            Text(outgoing?.title ?? "Task unavailable").font(.headline).lineLimit(3)
            if let tomorrow {
                DatePicker("Move this task to", selection: $date, in: tomorrow..., displayedComponents: .date)
                    .disabled(applied)
            } else {
                Text("Could not determine tomorrow's date.").foregroundStyle(.red)
            }
            if let due = outgoing?.dueAt, store.calendar.startOfDay(for: date) > store.calendar.startOfDay(for: due) {
                Text("This is after its deadline. The deadline stays unchanged.")
                    .font(.caption).foregroundStyle(LedgerDesign.warning)
            }
            Divider()
            Text("Choose the task to take its place").font(.subheadline)
            TextField("Search tasks or projects", text: $search).textFieldStyle(.roundedBorder)
                .disabled(applied).accessibilityIdentifier("stash.replace.search")
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    if filtered.isEmpty {
                        Text(candidates.isEmpty
                             ? "No open tasks outside Today. Capture a task or resume waiting work first."
                             : "No matching tasks.")
                            .font(.callout).foregroundStyle(.secondary).padding(.vertical, 18)
                    }
                    ForEach(filtered) { task in
                        Button { selectedID = task.id } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: selectedID == task.id ? "largecircle.fill.circle" : "circle")
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(task.title).lineLimit(2)
                                    Text("\(store.project(for: task)?.name ?? "No project") · \(ledgerDuration(task.estimateMinutes))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                            }.padding(8).frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain).disabled(applied)
                        .accessibilityIdentifier("stash.replace.candidate.\(task.id)")
                    }
                }
            }.frame(height: 190)
            if let incoming {
                Text("Selected: \(incoming.title)").font(.callout).lineLimit(2)
                if !applied, let previous = incoming.scheduledFor {
                    Text("Currently scheduled \(previous.formatted(date: .abbreviated, time: .omitted)); this moves it to today.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                let total = applied ? store.todayEstimateMinutes
                    : store.todayEstimateMinutes - (outgoing?.estimateMinutes ?? 0) + incoming.estimateMinutes
                let over = max(0, total - store.planningPreferences.minuteBudget)
                Text("\(ledgerDuration(total)) planned / \(ledgerDuration(store.planningPreferences.minuteBudget)) budget"
                     + (over > 0 ? " · \(ledgerDuration(over)) over" : ""))
                    .font(.caption).foregroundStyle(over > 0 ? LedgerDesign.warning : .secondary)
            }
            Text("Other tasks keep their order. The new task is added without starting it.")
                .font(.caption).foregroundStyle(.secondary)
            if let error { Text(error).font(.callout).foregroundStyle(.red).textSelection(.enabled) }
            HStack {
                Button(applied ? "Close" : "Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(saving ? "Saving…" : (applied ? "Retry save" : "Replace task"), action: save)
                    .keyboardShortcut(.defaultAction)
                    .disabled(selectedID == nil || tomorrow == nil)
            }
        }
        .disabled(saving).padding(24).frame(width: 500)
        .interactiveDismissDisabled(saving)
        .onAppear {
            openedDay = store.calendar.startOfDay(for: store.currentDate)
            date = tomorrow ?? openedDay
            let todayIDs = Set(store.todayRows.map(\.id))
            candidates = store.workspace.tasks.filter {
                $0.isOpen && $0.status != .waiting && !todayIDs.contains($0.id)
            }.sorted {
                if $0.priority != $1.priority { return $0.priority < $1.priority }
                if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
                return $0.id.uuidString < $1.id.uuidString
            }
        }
    }

    private func save() {
        guard let selectedID else { return }
        do {
            if !applied {
                try store.replaceTodayTask(id: taskID, with: selectedID, rescheduleFor: date, expectedDay: openedDay)
                applied = true
            }
            saving = true
            Task {
                let saved = await store.flush()
                saving = false
                if saved { dismiss() }
                else { error = "The replacement is not saved to disk. Your choices are kept; retry saving." }
            }
        } catch { self.error = error.localizedDescription }
    }
}
