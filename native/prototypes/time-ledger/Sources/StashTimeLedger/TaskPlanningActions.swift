import StashCore
import SwiftUI

enum TaskPlanningRequest: Identifiable {
    case schedule(UUID, DateInterval?)
    case waiting(UUID)
    case replace(UUID)

    var id: String {
        switch self {
        case let .schedule(id, _): "schedule-\(id)"
        case let .waiting(id): "waiting-\(id)"
        case let .replace(id): "replace-\(id)"
        }
    }
}

@MainActor
final class TaskPlanningPresentation: ObservableObject {
    @Published var request: TaskPlanningRequest?
}

func ledgerDuration(_ minutes: Int) -> String {
    let hours = minutes / 60
    let remainder = minutes % 60
    if hours == 0 { return "\(minutes)m" }
    return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
}

struct TaskPlanningActions: View {
    @EnvironmentObject private var store: LedgerStore
    @EnvironmentObject private var planning: TaskPlanningPresentation
    let task: LedgerTask
    var nextWeek: DateInterval? = nil
    var allowsReplacement = false

    var body: some View {
        HStack(spacing: 14) {
            if task.status == .waiting {
                Button("Review waiting…") { planning.request = .waiting(task.id) }
                    .accessibilityIdentifier("stash.plan.review-waiting.\(task.id)")
                Button("Resume") { store.resumeTask(id: task.id) }
                    .accessibilityIdentifier("stash.plan.resume.\(task.id)")
            } else if task.isOpen {
                if nextWeek == nil {
                    Button("Tomorrow") { store.moveToTomorrow(id: task.id) }
                        .accessibilityIdentifier("stash.plan.tomorrow.\(task.id)")
                }
                Button(nextWeek == nil ? "Choose date…" : "Plan next week…") { planning.request = .schedule(task.id, nextWeek) }
                    .accessibilityIdentifier("stash.plan.schedule.\(task.id)")
                if allowsReplacement {
                    Button("Replace…") { planning.request = .replace(task.id) }
                        .accessibilityIdentifier("stash.plan.replace.\(task.id)")
                }
                Button("Waiting…") { planning.request = .waiting(task.id) }
                    .accessibilityIdentifier("stash.plan.waiting.\(task.id)")
            }
        }
        .font(.system(size: 11, weight: .medium))
        .buttonStyle(.borderless)
    }
}

struct ScheduleTaskSheet: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    let taskID: UUID
    var range: DateInterval? = nil
    @State private var date = Date.now
    @State private var openedDay: Date?
    @State private var error: String?
    @State private var saving = false

    private var task: LedgerTask? { store.task(id: taskID) }
    private var lower: Date { max(range?.start ?? store.currentDate, store.calendar.startOfDay(for: store.currentDate)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(range == nil ? "Schedule task" : "Plan next week").font(.title2)
            Text(task?.title ?? "Task unavailable").lineLimit(3)
            if let previous = task?.scheduledFor {
                Text("Currently scheduled: \(previous.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let range, range.end <= lower {
                Text("This week has passed. Return to the current week to plan.")
                    .foregroundStyle(LedgerDesign.warning)
            } else if let range {
                DatePicker("Work on", selection: $date, in: lower...range.end.addingTimeInterval(-1), displayedComponents: .date)
            } else {
                DatePicker("Work on", selection: $date, in: store.calendar.startOfDay(for: store.currentDate)..., displayedComponents: .date)
            }
            if let due = task?.dueAt, store.calendar.startOfDay(for: date) > store.calendar.startOfDay(for: due) {
                Label("This is after the deadline. The deadline will stay unchanged.", systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(LedgerDesign.warning)
            }
            if let error { Text(error).foregroundStyle(.red).font(.callout).textSelection(.enabled) }
            HStack {
                Button("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(saving ? "Saving…" : "Save schedule", action: save)
                    .keyboardShortcut(.defaultAction)
                    .disabled(saving || task?.isOpen != true || (range.map { $0.end <= lower } ?? false))
            }
        }
        .padding(24).frame(width: 420)
        .interactiveDismissDisabled(saving)
        .onAppear {
            openedDay = store.calendar.startOfDay(for: store.currentDate)
            let proposed = task?.scheduledFor ?? range?.start ?? store.currentDate
            date = range.map { proposed >= $0.start && proposed < $0.end ? proposed : $0.start } ?? max(proposed, openedDay!)
        }
    }

    private func save() {
        let day = store.calendar.startOfDay(for: store.currentDate)
        guard openedDay == day else {
            openedDay = day
            error = "The day changed. Check the date and save again."
            return
        }
        if let range, !(date >= range.start && date < range.end) {
            error = "Choose a date in the displayed week."
            return
        }
        do {
            try store.scheduleTask(id: taskID, for: date)
            saving = true
            Task {
                let saved = await store.flush()
                saving = false
                if saved { dismiss() }
                else { error = "Could not save. Your selection is kept; try saving again." }
            }
        } catch { self.error = error.localizedDescription }
    }
}

struct WaitingTaskSheet: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    let taskID: UUID
    @State private var reason = ""
    @State private var hasReviewDate = false
    @State private var reviewDate = Date.now
    @State private var openedDay: Date?
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Waiting for something").font(.title2)
            Text(store.task(id: taskID)?.title ?? "Task unavailable").lineLimit(3)
            TextField("What are you waiting for?", text: $reason, axis: .vertical)
                .lineLimit(3...6).textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("stash.waiting.reason")
            Toggle("Set a review date", isOn: $hasReviewDate)
            if hasReviewDate {
                DatePicker("Check again", selection: $reviewDate,
                           in: min(reviewDate, store.calendar.startOfDay(for: store.currentDate))..., displayedComponents: .date)
            }
            Text("This task leaves Today. Reaching the review date will not resume it automatically.")
                .font(.caption).foregroundStyle(.secondary)
            if let error { Text(error).foregroundStyle(.red).font(.callout).textSelection(.enabled) }
            HStack {
                Button("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(saving ? "Saving…" : "Save waiting", action: save)
                    .keyboardShortcut(.defaultAction).disabled(saving)
            }
        }
        .padding(24).frame(width: 420)
        .interactiveDismissDisabled(saving)
        .onAppear {
            let task = store.task(id: taskID)
            reason = task?.waitingOn ?? ""
            hasReviewDate = task?.reviewAt != nil
            reviewDate = task?.reviewAt ?? store.currentDate
            openedDay = store.calendar.startOfDay(for: store.currentDate)
        }
    }

    private func save() {
        let day = store.calendar.startOfDay(for: store.currentDate)
        guard openedDay == day else {
            openedDay = day
            error = "The day changed. Check your review date and save again."
            return
        }
        do {
            try store.waitForTask(id: taskID, reason: reason, reviewAt: hasReviewDate ? reviewDate : nil)
            saving = true
            Task {
                let saved = await store.flush()
                saving = false
                if saved { dismiss() }
                else { error = "Could not save. Your reason and date are kept; try saving again." }
            }
        } catch { self.error = error.localizedDescription }
    }
}
