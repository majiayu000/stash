import AppKit
import StashCore
import SwiftUI
import UniformTypeIdentifiers

struct ReviewView: View {
    @EnvironmentObject private var store: LedgerStore
    @Binding var selectedTaskID: UUID?
    @Binding var selectedWeek: Date
    @Binding var showsWeek: Bool
    @Binding var scrollID: String?
    @State private var exportError: String?
    @State private var trashExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("REVIEW").font(.system(size: 11, weight: .semibold)).tracking(1.1)
                    .foregroundStyle(LedgerDesign.mint)
                Spacer()
                Picker("Review period", selection: $showsWeek) {
                    Text("Today").tag(false)
                    Text("Week").tag(true)
                }
                .pickerStyle(.segmented).labelsHidden().frame(width: 160)
            }
            .padding(.horizontal, 28).padding(.top, 24).padding(.bottom, 16)

            if let exportError {
                Text(exportError).foregroundStyle(.red).font(.callout)
                    .textSelection(.enabled).padding(.horizontal, 28).padding(.bottom, 12)
            }
            switch reviewResult {
            case let .success(review):
                reviewContent(review)
            case let .failure(error):
                ContentUnavailableView("Could not load review", systemImage: "exclamationmark.triangle",
                                       description: Text(error.localizedDescription))
            }
        }
    }

    private var reviewResult: Result<LedgerWeekReview, Error> {
        Result { try LedgerWeekReview(workspace: store.workspace, anchor: selectedWeek, calendar: store.calendar) }
    }

    private func reviewContent(_ review: LedgerWeekReview) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsWeek {
                Text(review.rangeLabel).font(.system(size: 20, weight: .semibold)).padding(.horizontal, 28)
                HStack(spacing: 16) {
                    Button("Previous") { changeWeek(by: -1) }
                    Button("This week") { selectedWeek = store.currentDate; scrollID = nil }
                    Button("Next") { changeWeek(by: 1) }
                    Spacer()
                    Button("Export week…") { export(review) }
                }
                .buttonStyle(.borderless).font(.system(size: 12))
                .padding(.horizontal, 28).padding(.vertical, 12)
                Text("Completions follow the selected week. Open and waiting work shows its current state.")
                    .font(.caption).foregroundStyle(.secondary).padding(.horizontal, 28).padding(.bottom, 16)
            } else {
                Text("Close the day, one decision at a time.")
                    .font(.title3).padding(.horizontal, 28).padding(.bottom, 18)
            }
            Divider().padding(.horizontal, 28)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    if showsWeek {
                        if review.completedGroups.isEmpty {
                            taskSection("COMPLETED THIS WEEK", tasks: [], empty: "No completed tasks in this week.")
                        }
                        ForEach(review.completedGroups) { group in
                            taskSection("COMPLETED · \(group.name)", tasks: group.tasks, empty: "")
                        }
                        if review.interval.end <= store.currentDate {
                            Button("Return to this week to plan") { selectedWeek = store.currentDate; scrollID = nil }
                                .padding(.horizontal, 28)
                        }
                        taskSection("CURRENTLY OPEN", tasks: review.openTasks, empty: "No open tasks.",
                                    actions: review.interval.end > store.currentDate,
                                    nextWeek: review.nextWeek)
                    } else {
                        taskSection("COMPLETED TODAY", tasks: store.completedToday, empty: "No completed tasks yet.")
                        taskSection("STILL ON TODAY'S PLAN", tasks: store.todayRows.map(\.task).filter(\.isOpen),
                                    empty: "Nothing left on today's plan.", actions: true)
                    }
                    taskSection("CURRENTLY WAITING", tasks: review.waitingTasks, empty: "Nothing is waiting.", actions: true)
                    if showsWeek {
                        taskSection("NEXT WEEK · \(review.nextWeekLabel)", tasks: review.scheduledNextWeek,
                                    empty: "No tasks scheduled for this week yet.")
                    } else {
                        taskSection("DEFERRED", tasks: store.workspace.tasks.filter { $0.status == .deferred },
                                    empty: "No deferred work.", actions: true)
                    }
                    DisclosureGroup("Trash (\(store.trashedTasks.count))", isExpanded: $trashExpanded) {
                        taskSection("TRASH", tasks: store.trashedTasks, empty: "Trash is empty.")
                    }
                    .font(.callout).padding(.horizontal, 28)
                }
                .scrollTargetLayout().padding(.vertical, 20)
            }
            .scrollPosition(id: $scrollID)
        }
    }

    private func taskSection(_ title: String, tasks: [LedgerTask], empty: String,
                             actions: Bool = false, nextWeek: DateInterval? = nil) -> some View {
        LazyVStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 10, weight: .semibold)).tracking(0.8)
                .foregroundStyle(.secondary).padding(.horizontal, 28)
            if tasks.isEmpty {
                Text(empty).font(.callout).foregroundStyle(.secondary).padding(.horizontal, 28).padding(.vertical, 12)
            }
            ForEach(tasks) { task in
                VStack(alignment: .leading, spacing: 0) {
                    LedgerTaskRow(task: task, reason: task.waitingOn ?? task.notes,
                                  dateLabel: dateLabel(task), isSelected: selectedTaskID == task.id,
                                  onSelect: { selectedTaskID = task.id })
                    if actions && task.isOpen {
                        TaskPlanningActions(task: task, nextWeek: nextWeek)
                            .padding(.leading, 64).padding(.bottom, 12)
                    }
                }
                .id("\(title)-\(task.id)")
            }
        }
    }

    private func dateLabel(_ task: LedgerTask) -> String? {
        if task.status == .waiting {
            guard let date = task.reviewAt else { return "No review date" }
            let due = store.calendar.startOfDay(for: date) <= store.calendar.startOfDay(for: store.currentDate)
            return (due ? "Review due · " : "Review · ") + date.formatted(date: .abbreviated, time: .omitted)
        }
        return task.scheduledFor?.formatted(date: .abbreviated, time: .omitted)
    }

    private func changeWeek(by offset: Int) {
        guard let date = store.calendar.date(byAdding: .weekOfYear, value: offset, to: selectedWeek) else {
            exportError = "Could not change the selected week."
            return
        }
        selectedWeek = date
        scrollID = nil
        exportError = nil
    }

    private func export(_ review: LedgerWeekReview) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText]
        panel.nameFieldStringValue = "Stash Review \(review.dateLabel(review.interval.start)).md"
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try review.markdown.write(to: url, atomically: true, encoding: .utf8)
            exportError = nil
        } catch { exportError = "Could not export review: \(error.localizedDescription). Try Export week again." }
    }
}
