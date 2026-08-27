import SwiftUI

@main
struct CommandCanvasApp: App {
    var body: some Scene {
        WindowGroup("Stash · Command Canvas") {
            CommandCanvasView()
                .frame(minWidth: 980, minHeight: 620)
        }
        .defaultSize(width: 1180, height: 760)
        .windowResizability(.contentMinSize)
    }
}
