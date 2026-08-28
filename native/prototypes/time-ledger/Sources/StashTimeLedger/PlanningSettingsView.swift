import AppKit
import StashCore
import SwiftUI
import UniformTypeIdentifiers

struct PlanningSettingsView: View {
    @EnvironmentObject private var store: LedgerStore
    @State private var minimumTasks = PlanningPreferences.default.minimumTasks
    @State private var maximumTasks = PlanningPreferences.default.maximumTasks
    @State private var minuteBudget = PlanningPreferences.default.minuteBudget
    @State private var includeInbox = PlanningPreferences.default.includeInbox
    @State private var savedFeedback = false

    var body: some View {
        Form {
            Section("Daily plan") {
                Stepper("Minimum tasks: \(minimumTasks)", value: $minimumTasks, in: 1...12)
                Stepper("Maximum tasks: \(maximumTasks)", value: $maximumTasks, in: minimumTasks...12)
                Stepper("Time budget: \(durationLabel)", value: $minuteBudget, in: 30...960, step: 30)
                Toggle("Let Inbox fill open slots automatically", isOn: $includeInbox)

                Text("Stash fills the minimum first, then respects the time budget up to the maximum.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Data") {
                HStack {
                    Button("Export backup…") {
                        WorkspaceTransfer.exportWorkspace(store: store)
                    }
                    Button("Import backup…") {
                        WorkspaceTransfer.importWorkspace(store: store)
                    }
                }

                Text("Stash also keeps the previous saved version beside the live workspace file.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Spacer()
                Button(savedFeedback ? "Saved" : "Save planning settings") {
                    save()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .formStyle(.grouped)
        .padding(12)
        .frame(width: 480, height: 360)
        .onAppear(perform: load)
        .onChange(of: minimumTasks) { _, value in
            maximumTasks = max(maximumTasks, value)
        }
    }

    private var durationLabel: String {
        let hours = minuteBudget / 60
        let minutes = minuteBudget % 60
        if hours == 0 { return "\(minutes)m" }
        return minutes == 0 ? "\(hours)h" : "\(hours)h \(minutes)m"
    }

    private func load() {
        let preferences = store.planningPreferences
        minimumTasks = preferences.minimumTasks
        maximumTasks = preferences.maximumTasks
        minuteBudget = preferences.minuteBudget
        includeInbox = preferences.includeInbox
    }

    private func save() {
        store.updatePlanningPreferences(
            PlanningPreferences(
                minimumTasks: minimumTasks,
                maximumTasks: maximumTasks,
                minuteBudget: minuteBudget,
                includeInbox: includeInbox
            )
        )
        savedFeedback = true
        Task {
            try? await Task.sleep(for: .seconds(1))
            savedFeedback = false
        }
    }
}

enum WorkspaceTransfer {
    @MainActor
    static func exportWorkspace(store: LedgerStore) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "Stash Backup.json"
        guard panel.runModal() == .OK, let url = panel.url else { return }

        do {
            try store.exportData().write(to: url, options: [.atomic])
        } catch {
            presentError(title: "Could not export Stash", message: error.localizedDescription)
        }
    }

    @MainActor
    static func importWorkspace(store: LedgerStore) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK, let url = panel.url else { return }

        let confirmation = NSAlert()
        confirmation.messageText = "Replace the current Stash workspace?"
        confirmation.informativeText = "A backup of the current workspace will be kept automatically."
        confirmation.alertStyle = .warning
        confirmation.addButton(withTitle: "Import")
        confirmation.addButton(withTitle: "Cancel")
        guard confirmation.runModal() == .alertFirstButtonReturn else { return }

        do {
            try store.importData(Data(contentsOf: url, options: [.mappedIfSafe]))
        } catch {
            presentError(title: "Could not import Stash", message: error.localizedDescription)
        }
    }

    @MainActor
    private static func presentError(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.runModal()
    }
}
