import Foundation

enum WorkScope: String, CaseIterable, Identifiable {
    case today
    case soon
    case longTerm

    var id: Self { self }

    var title: String {
        switch self {
        case .today: "Today"
        case .soon: "Soon"
        case .longTerm: "Long term"
        }
    }
}

struct WorkItem: Identifiable, Equatable {
    let id: UUID
    var title: String
    var project: String
    var timing: String
    var note: String
    var scope: WorkScope
    var isCompleted: Bool

    init(
        id: UUID = UUID(),
        title: String,
        project: String,
        timing: String,
        note: String,
        scope: WorkScope,
        isCompleted: Bool = false
    ) {
        self.id = id
        self.title = title
        self.project = project
        self.timing = timing
        self.note = note
        self.scope = scope
        self.isCompleted = isCompleted
    }
}

extension WorkItem {
    static var samples: [WorkItem] {
        let today = [
            WorkItem(
                title: "Review Stash capture flow",
                project: "Stash",
                timing: "Now · 35 min",
                note: "Decide what belongs in the first three seconds of the daily view.",
                scope: .today
            ),
            WorkItem(
                title: "Ship usage export copy",
                project: "Atlas CLI",
                timing: "11:00 · 25 min",
                note: "Tighten empty-state language before the release candidate is cut.",
                scope: .today
            ),
            WorkItem(
                title: "Reconcile agent session notes",
                project: "remem",
                timing: "14:30 · 45 min",
                note: "Connect the latest decisions to their source sessions and artifacts.",
                scope: .today
            ),
            WorkItem(
                title: "Fix keyboard focus regression",
                project: "Page Lingo",
                timing: "Today · 40 min",
                note: "Restore predictable focus after closing the translation panel.",
                scope: .today
            ),
            WorkItem(
                title: "Draft Friday review outline",
                project: "Weekly",
                timing: "Today · 20 min",
                note: "Capture outcomes, open loops, and the next decisions to make.",
                scope: .today
            ),
            WorkItem(
                title: "Read local-first sync proposal",
                project: "Research",
                timing: "Evening · 30 min",
                note: "Pull out failure modes that apply to offline agent evidence.",
                scope: .today
            )
        ]

        let soonTitles = [
            "Polish project handoff view", "Retest session resume flow",
            "Map review evidence states", "Write onboarding sample data",
            "Audit command palette labels", "Clean up project aliases",
            "Prototype daily shutdown note", "Compare local search indexes",
            "Add failure copy for imports", "Review sync conflict language",
            "Prepare agent status contract", "Plan the next Stash dogfood week"
        ]
        let soon = soonTitles.enumerated().map { index, title in
            WorkItem(
                title: title,
                project: index.isMultiple(of: 3) ? "Stash" : "Product",
                timing: index < 4 ? "Tomorrow" : "This week",
                note: "A near-term follow-up kept visible without competing with today.",
                scope: .soon
            )
        }

        let longTitles = [
            "Unify project and session context", "Design offline recovery model",
            "Build cross-project decision search", "Measure capture-to-action time",
            "Define portable evidence bundles", "Explore encrypted local sync",
            "Create quarterly archive ritual", "Design session provenance view",
            "Reduce review reconstruction work", "Model recurring project rhythms",
            "Prototype calm notification rules", "Add durable agent bookmarks",
            "Plan a plugin boundary", "Design workspace migration",
            "Explore semantic project linking", "Create a retention policy",
            "Map local model integrations", "Define audit export format",
            "Research collaboration boundaries", "Prototype contextual reminders",
            "Design long-horizon planning", "Study personal knowledge decay",
            "Create recovery diagnostics", "Document the local-first promise"
        ]
        let longTerm = longTitles.enumerated().map { index, title in
            WorkItem(
                title: title,
                project: index.isMultiple(of: 4) ? "Stash" : "Later",
                timing: index < 8 ? "This month" : "Someday",
                note: "A long-horizon thread preserved for deliberate review.",
                scope: .longTerm
            )
        }

        return today + soon + longTerm
    }
}
