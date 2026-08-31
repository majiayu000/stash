import Foundation

public extension LedgerWorkspace {
    static func preview(now: Date = .now, calendar: Calendar = .current) -> LedgerWorkspace {
        let today = calendar.startOfDay(for: now)
        func day(_ offset: Int) -> Date {
            calendar.date(byAdding: .day, value: offset, to: today) ?? today
        }

        let stash = LedgerProject(name: "Stash", symbol: "tray.full")
        let atlas = LedgerProject(name: "AtlasCloud", symbol: "cloud")
        let work = LedgerProject(name: "Work", symbol: "briefcase")
        let personal = LedgerProject(name: "Personal", symbol: "person")
        let projects = [stash, atlas, work, personal]

        let tasks = [
            LedgerTask(
                title: "Finish the native Stash daily flow",
                notes: "Make capture, planning, completion, and persistence feel complete.",
                projectID: stash.id,
                status: .active,
                priority: .p0,
                estimateMinutes: 75,
                scheduledFor: today,
                createdAt: day(-12)
            ),
            LedgerTask(
                title: "Review local session handoff",
                notes: "Check persisted cwd and interrupted-run recovery.",
                projectID: stash.id,
                status: .planned,
                priority: .p1,
                estimateMinutes: 35,
                dueAt: day(-1),
                createdAt: day(-8)
            ),
            LedgerTask(
                title: "Send VSR upload notes",
                notes: "Include the public asset URL and checksum evidence.",
                projectID: atlas.id,
                status: .planned,
                priority: .p1,
                estimateMinutes: 25,
                dueAt: today,
                createdAt: day(-5)
            ),
            LedgerTask(
                title: "Prepare August infra handoff",
                notes: "Leave owners and live runtime checks for each open lane.",
                projectID: work.id,
                status: .planned,
                priority: .p1,
                estimateMinutes: 50,
                scheduledFor: today,
                createdAt: day(-7)
            ),
            LedgerTask(
                title: "Book dentist follow-up",
                notes: "Ask for a late-afternoon appointment next week.",
                projectID: personal.id,
                status: .planned,
                priority: .p2,
                estimateMinutes: 10,
                isPinnedToday: true,
                createdAt: day(-3)
            ),
            LedgerTask(
                title: "Write the first-run empty state",
                notes: "Help a new user understand capture and automatic planning.",
                projectID: stash.id,
                status: .planned,
                priority: .p1,
                estimateMinutes: 40,
                dueAt: day(2),
                createdAt: day(-15)
            ),
            LedgerTask(
                title: "Read the local-first sync RFC",
                notes: "Capture decisions that affect offline conflict handling.",
                projectID: stash.id,
                status: .planned,
                priority: .p2,
                estimateMinutes: 35,
                createdAt: day(-30)
            ),
            LedgerTask(
                title: "Reply to the release thread",
                notes: "Confirm the rollout window and owner.",
                projectID: work.id,
                status: .planned,
                priority: .p2,
                estimateMinutes: 15,
                dueAt: day(4),
                createdAt: day(-6)
            ),
            LedgerTask(
                title: "Check the migration rehearsal",
                notes: "Verify backup and restore before the next beta.",
                projectID: stash.id,
                status: .planned,
                priority: .p2,
                estimateMinutes: 40,
                scheduledFor: day(1),
                createdAt: day(-4)
            ),
            LedgerTask(
                title: "Write v0.4 release notes",
                notes: "Explain the daily planning contract in plain language.",
                projectID: stash.id,
                status: .planned,
                priority: .p2,
                estimateMinutes: 45,
                scheduledFor: day(3),
                createdAt: day(-10)
            ),
            LedgerTask(
                title: "Design a weekly review ritual",
                notes: "Keep the review quiet and useful, without analytics theatre.",
                projectID: personal.id,
                status: .planned,
                priority: .p2,
                horizon: .longTerm,
                estimateMinutes: 60,
                createdAt: day(-20)
            ),
            LedgerTask(
                title: "Build one local work history",
                notes: "Create a durable record across tools.",
                projectID: stash.id,
                status: .planned,
                priority: .p2,
                horizon: .longTerm,
                estimateMinutes: 120,
                createdAt: day(-40)
            ),
            LedgerTask(
                title: "Create a personal knowledge index",
                notes: "A quiet system for decisions and lessons.",
                projectID: personal.id,
                status: .planned,
                priority: .p3,
                horizon: .longTerm,
                estimateMinutes: 90,
                createdAt: day(-22)
            ),
            LedgerTask(
                title: "Capture keyboard navigation ideas",
                projectID: stash.id,
                status: .inbox,
                priority: .p2,
                estimateMinutes: 20,
                createdAt: now
            ),
            LedgerTask(
                title: "Look at notification permission wording",
                status: .inbox,
                priority: .p3,
                estimateMinutes: 15,
                createdAt: now
            )
        ]

        return LedgerWorkspace(projects: projects, tasks: tasks)
    }

    static func benchmark(taskCount: Int, now: Date = .now) -> LedgerWorkspace {
        let project = LedgerProject(name: "Benchmark")
        let tasks = (0..<taskCount).map { index in
            LedgerTask(
                title: "Benchmark task \(index)",
                notes: "Synthetic local performance fixture",
                projectID: project.id,
                status: index.isMultiple(of: 17) ? .completed : .planned,
                priority: TaskPriority(rawValue: index % 4) ?? .p2,
                horizon: index.isMultiple(of: 9) ? .longTerm : .shortTerm,
                estimateMinutes: 5 + (index % 12) * 5,
                scheduledFor: index.isMultiple(of: 11) ? now : nil,
                dueAt: index.isMultiple(of: 13) ? now : nil,
                isPinnedToday: index.isMultiple(of: 23),
                createdAt: now.addingTimeInterval(TimeInterval(-index * 900)),
                completedAt: index.isMultiple(of: 17) ? now : nil
            )
        }
        return LedgerWorkspace(projects: [project], tasks: tasks)
    }
}
