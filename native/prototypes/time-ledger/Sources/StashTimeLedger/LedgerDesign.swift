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
    // A cool, daylight palette derived from the blue-slate and mint app mark.
    // SwiftUI does not expose OKLCH directly, so these are precomputed sRGB values.
    static let accent = Color(red: 0.10, green: 0.45, blue: 0.72)
    static let inkBlue = Color(red: 0.19, green: 0.36, blue: 0.48)
    static let mint = Color(red: 0.15, green: 0.47, blue: 0.32)
    static let apricot = Color(red: 0.63, green: 0.31, blue: 0.14)
    static let creative = Color(red: 0.42, green: 0.36, blue: 0.69)

    static let success = mint
    static let warning = apricot

    static let canvas = Color(red: 0.972, green: 0.981, blue: 0.988)
    static let sidebar = Color(red: 0.928, green: 0.965, blue: 0.986)
    static let horizon = Color(red: 0.958, green: 0.956, blue: 0.985)
    static let chrome = Color(red: 0.948, green: 0.970, blue: 0.982)
    static let field = Color(red: 0.888, green: 0.940, blue: 0.970)
    static let selection = Color(red: 0.858, green: 0.928, blue: 0.978)
    static let creativeWash = Color(red: 0.927, green: 0.917, blue: 0.974)
    static let mintWash = Color(red: 0.894, green: 0.959, blue: 0.925)
    static let apricotWash = Color(red: 0.986, green: 0.929, blue: 0.884)
    static let hairline = Color(red: 0.820, green: 0.872, blue: 0.902)
    static let hover = Color(red: 0.910, green: 0.949, blue: 0.974)

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
