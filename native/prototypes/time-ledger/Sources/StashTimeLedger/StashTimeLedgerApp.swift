import StashCore
import SwiftUI

@main
struct StashTimeLedgerApp: App {
    @StateObject private var store = LedgerStore.live()

    var body: some Scene {
        WindowGroup("Stash · Time Ledger") {
            TimeLedgerView()
                .environmentObject(store)
                .frame(minWidth: 920, minHeight: 620)
                .task {
                    await store.bootstrap()
                }
        }
        .defaultSize(width: 1180, height: 760)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Capture Task") {
                    NotificationCenter.default.post(name: .stashFocusCapture, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }

            CommandGroup(after: .textEditing) {
                Button("Search") {
                    NotificationCenter.default.post(name: .stashFocusSearch, object: nil)
                }
                .keyboardShortcut("k", modifiers: .command)
            }
        }
    }
}
