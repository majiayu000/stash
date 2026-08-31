import Foundation
import StashCore
import UserNotifications

enum ReminderSchedulerError: LocalizedError {
    case permissionDenied
    case appBundleRequired

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            "Notifications are disabled for Stash. Enable them in System Settings to receive reminders."
        case .appBundleRequired:
            "Reminders require the packaged Stash app. Task data is still available in this development run."
        }
    }
}

actor SystemReminderScheduler {
    static let shared = SystemReminderScheduler()
    private let identifierPrefix = "stash.task."

    func sync(tasks: [LedgerTask]) async throws {
        guard Bundle.main.bundleIdentifier != nil else {
            throw ReminderSchedulerError.appBundleRequired
        }
        let center = UNUserNotificationCenter.current()
        let scheduledTasks = tasks.filter {
            $0.isOpen && $0.status != .cancelled && ($0.reminderAt ?? .distantPast) > .now
        }

        let pending = await center.pendingNotificationRequests()
        let existingIdentifiers = pending.map(\.identifier).filter { $0.hasPrefix(identifierPrefix) }
        if !existingIdentifiers.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: existingIdentifiers)
        }

        guard !scheduledTasks.isEmpty else { return }

        let settings = await center.notificationSettings()
        var isAuthorized = settings.authorizationStatus == .authorized
            || settings.authorizationStatus == .provisional

        if settings.authorizationStatus == .notDetermined {
            isAuthorized = try await center.requestAuthorization(options: [.alert, .sound])
        }
        guard isAuthorized else { throw ReminderSchedulerError.permissionDenied }

        for task in scheduledTasks {
            guard let reminderAt = task.reminderAt else { continue }
            let content = UNMutableNotificationContent()
            content.title = task.title
            content.body = task.notes.isEmpty ? "Stash reminder" : task.notes
            content.sound = .default

            let components = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: reminderAt
            )
            let request = UNNotificationRequest(
                identifier: identifierPrefix + task.id.uuidString,
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            )
            try await center.add(request)
        }
    }
}
