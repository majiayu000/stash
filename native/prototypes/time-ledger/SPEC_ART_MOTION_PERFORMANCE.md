# Time Ledger art, motion, icon, and responsiveness

## Goal

Extend the visual language of the accepted sidebar artwork without turning the
task manager into an illustration gallery. Make completion feel responsive,
give the packaged macOS application a reliable Dock icon, and remove redundant
SwiftUI invalidations from task mutations.

## Current evidence

- The packaged app idles at 0.0% CPU with a roughly 60 MB physical footprint.
- A three-second sample shows the main thread waiting for AppKit events, so
  there is no continuous background render or animation loop.
- `LedgerStore.rebuildSnapshot()` writes six `@Published` arrays separately,
  while task mutations also publish `workspace` and persistence state. One user
  action can therefore invalidate the entire three-column view repeatedly.
- The application bundle contains an `.icns`, but the app does not explicitly
  set `NSApplication.applicationIconImage`; a stale or generic Dock icon can
  remain visible when launching rebuilt local bundles.

## Design decisions

1. Keep the sidebar artwork as the only large raster illustration.
2. Add a code-native progress path to the Today header. It reuses the artwork's
   blue route and mint endpoint while encoding completed versus total tasks.
3. Animate only task completion and progress-path advancement for about 220 ms.
   No idle animation, page-load choreography, blur, particles, or layout loops.
4. Respect `accessibilityReduceMotion`; state changes remain immediate when it
   is enabled.
5. Create a square Dock icon with a strong small-size silhouette derived from
   the paper-slab, blue-route, and mint-endpoint visual language. Keep the old
   asset and add a versioned replacement.

## Performance change

Replace the six independently published derived arrays with one published
snapshot. `workspace` remains the source of truth but does not publish on its
own; replacing the snapshot becomes the single render notification for a task
mutation. Persistence status may publish separately because it is an explicit
user-visible state.

Add a core check that records `objectWillChange` emissions for one mutation on
a 10,000-task workspace and measures its synchronous duration. The mutation
must stay below 250 ms and emit no more than three notifications.

## Files

- `Sources/StashCore/LedgerStore.swift`: coalesced derived snapshot.
- `Sources/StashCoreChecks/main.swift`: invalidation and interaction benchmark.
- `Sources/StashTimeLedger/BrandMark.swift`: versioned brand asset loading.
- `Sources/StashTimeLedger/DestinationViews.swift`: functional progress path.
- `Sources/StashTimeLedger/TimeLedgerView.swift`: completion feedback.
- `Sources/StashTimeLedger/StashTimeLedgerApp.swift`: explicit runtime Dock icon.
- `Sources/StashTimeLedger/Resources/AppIcon-v2.png`: generated Dock artwork.
- `scripts/package_app.sh`: package the new source image and derive `.icns`.

## Verification

- `swift build`
- `swift run StashCoreChecks`
- `./scripts/package_app.sh`
- `codesign --verify --deep --strict '.build/app/Stash Time Ledger.app'`
- Inspect the real packaged window, Dock icon, completion motion, and reduced
  motion behavior.
