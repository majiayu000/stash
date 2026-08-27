import SwiftUI

enum LedgerDestination: String, CaseIterable, Identifiable {
    case today = "Today"
    case inbox = "Inbox"
    case upcoming = "Upcoming"
    case projects = "Projects"
    case review = "Review"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .today: "sun.max"
        case .inbox: "tray"
        case .upcoming: "calendar"
        case .projects: "square.stack.3d.up"
        case .review: "clock.arrow.circlepath"
        }
    }

    var shortcut: KeyEquivalent {
        switch self {
        case .today: "1"
        case .inbox: "2"
        case .upcoming: "3"
        case .projects: "4"
        case .review: "5"
        }
    }
}

enum LedgerDesign {
    static let accent = Color(red: 0.27, green: 0.38, blue: 0.47)
    static let success = Color(red: 0.27, green: 0.46, blue: 0.36)
    static let warning = Color(red: 0.63, green: 0.39, blue: 0.22)
    static let sidebar = Color(nsColor: .controlBackgroundColor).opacity(0.44)
    static let horizon = Color(nsColor: .controlBackgroundColor).opacity(0.24)
    static let selection = accent.opacity(0.075)
    static let hover = Color.primary.opacity(0.035)
}

extension Notification.Name {
    static let stashFocusCapture = Notification.Name("stash.focus-capture")
    static let stashFocusSearch = Notification.Name("stash.focus-search")
}

extension Date {
    var ledgerDayTitle: String {
        formatted(
            .dateTime
                .locale(Locale(identifier: "en_US"))
                .weekday(.wide)
                .month(.wide)
                .day()
        )
    }

    var ledgerShortDate: String {
        formatted(
            .dateTime
                .locale(Locale(identifier: "en_US"))
                .weekday(.abbreviated)
                .month(.abbreviated)
                .day()
        )
    }
}
