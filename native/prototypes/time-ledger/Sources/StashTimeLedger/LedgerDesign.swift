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

    var tint: Color {
        switch self {
        case .today: LedgerDesign.accent
        case .inbox: LedgerDesign.apricot
        case .upcoming: LedgerDesign.mint
        case .projects: LedgerDesign.creative
        case .review: LedgerDesign.inkBlue
        }
    }
}

enum LedgerDesign {
    // Neutral surfaces let the app mark and small state cues carry the color.
    // SwiftUI does not expose OKLCH directly, so accents are precomputed sRGB values.
    static let accent = Color(red: 0.10, green: 0.45, blue: 0.72)
    static let inkBlue = Color(red: 0.19, green: 0.36, blue: 0.48)
    static let mint = Color(red: 0.15, green: 0.47, blue: 0.32)
    static let apricot = Color(red: 0.63, green: 0.31, blue: 0.14)
    static let creative = Color(red: 0.42, green: 0.36, blue: 0.69)

    static let success = mint
    static let warning = apricot

    static let canvas = Color(nsColor: .windowBackgroundColor)
    static let sidebar = Color(nsColor: .controlBackgroundColor)
    static let horizon = Color(nsColor: .windowBackgroundColor)
    static let chrome = Color(nsColor: .controlBackgroundColor)
    static let field = Color(nsColor: .textBackgroundColor)
    static let selection = Color(red: 0.914, green: 0.918, blue: 0.922)
    static let mintWash = Color(red: 0.894, green: 0.959, blue: 0.925)
    static let hairline = Color(nsColor: .separatorColor)
    static let navigationAnimation = Animation.timingCurve(0.25, 0.80, 0.25, 1, duration: 0.18)
    static let feedbackAnimation = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.22)

    static func projectColor(for projectName: String) -> Color {
        let palette = [accent, mint, creative, apricot]
        let value = projectName.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return palette[value % palette.count]
    }
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
