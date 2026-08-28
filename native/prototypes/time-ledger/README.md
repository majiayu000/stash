# Stash Time Ledger

A local-first macOS task manager focused on deciding what to do today. It is a
native SwiftUI app with no server, account, network request, telemetry, or
third-party dependency.

## Run

```sh
swift run StashTimeLedger
```

## Verify the planning and persistence core

```sh
swift run StashCoreChecks
```

The checks cover capture parsing, explainable five-to-eight-task planning,
locked-plan behavior, atomic JSON persistence, and 10,000-task performance.

## Build a macOS app

```sh
./scripts/package_app.sh
open '.build/app/Stash Time Ledger.app'
```

Quit a running packaged copy before rebuilding it. The packaging command will
stop with a clear error instead of replacing an active app bundle. The packaged
app is ad-hoc signed for local use. Its data lives at:

```text
~/Library/Application Support/Stash Time Ledger/workspace-v1.json
```

The workspace is versioned Codable JSON and is replaced atomically on save.
Back up that file before moving data between machines.

The active product mark is stored at
`Sources/StashTimeLedger/Resources/AppIcon-v3.png`. It uses a centered macOS
rounded-square silhouette with transparent outer padding. Packaging derives
the complete `.icns` set from that source, installs it as the Dock icon, and
uses the same mark in the app sidebar.

## Daily planning

Stash ranks active, overdue, scheduled, pinned, high-priority, due-soon, and
older unfinished work. It selects five to eight tasks within a six-hour default
budget and shows the leading reason on every row. `Lock today` freezes that
order for the current date. Captures cannot silently change a locked plan.

Capture supports the compact tokens already familiar from Stash:

```text
Finish onboarding #Stash ^p1 !tomorrow *45m
```

- `#project` assigns or creates a project.
- `^p0` through `^p3` set priority.
- `!today` and `!tomorrow` schedule the task.
- `*30m` and `*2h` set the estimate.

Agent activity is intentionally outside this MVP.
