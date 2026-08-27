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
                        .foregroundStyle(.secondary)

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

    var body: some View {
        VStack(spacing: 0) {
            LedgerSectionHeader(
                eyebrow: "PROJECTS",
                title: "Work with a home",
                subtitle: "Projects group context. Time still decides what reaches Today."
            )

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
                                        .foregroundStyle(.secondary)
                                        .frame(width: 18)
                                    Text(project.name)
                                        .font(.system(size: 15, weight: .semibold))
                                    Text("\(tasks.count) open")
                                        .font(.system(size: 11))
                                        .foregroundStyle(.secondary)
                                    Spacer()
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
                                    ForEach(tasks.prefix(4)) { task in
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
                .foregroundStyle(.secondary)
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
