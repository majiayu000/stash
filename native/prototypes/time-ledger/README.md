# Stash Time Ledger

A local-first macOS task manager focused on deciding what to do today. It is a
native SwiftUI app with no account or telemetry. Ordinary task capture,
planning, editing, completion, and persistence never depend on a service.

The optional Agent workflow connects only to Keepline's authenticated loopback
Local API through the canonical `KeeplineKit` Swift package. Stash keeps task
truth; Keepline keeps runtime sessions and evidence.

The packaged app embeds Keepline's lightweight Service Mode executable. Stash
probes the loopback API first, starts the embedded child only when needed, and
stops only that owned child when the app exits. No background daemon remains
after Stash closes, and an already-running compatible Keepline service is left
untouched.

## Build prerequisites and dependency revision

Requires macOS 14 or later, a Swift toolchain, and Bun for the embedded service.
Keep the repositories next to each other:

```text
parent/
  stash/
  keepline/          # includes sdk/swift and the embedded service source
```

`Package.swift` imports the local Keepline SDK; it does not fetch or pin that
repository. Packaging uses the same checkout for the embedded service. For a
reproducible baseline, use the Keepline commit recorded in the
`native-integration` job of [`../../../.github/workflows/ci.yml`](../../../.github/workflows/ci.yml).
Prepare a separate checkout at that revision if your existing Keepline checkout
contains work you need to preserve. Install its dependencies with
`bun install --frozen-lockfile` before packaging.

The built app records both source revisions in `Contents/Info.plist`:

```sh
plutil -extract StashSourceRevision raw '.build/app/Stash Time Ledger.app/Contents/Info.plist'
plutil -extract KeeplineSourceRevision raw '.build/app/Stash Time Ledger.app/Contents/Info.plist'
codesign --verify --deep --strict '.build/app/Stash Time Ledger.app'
```

These identify the source commits used for the build; they are separate from
the display version. Build from clean source checkouts when comparing releases.

## Run

```sh
swift run StashTimeLedger
```

## Verify the planning and persistence core

```sh
swift run StashCoreChecks
swift run StashIntegrationChecks
```

The core checks cover capture parsing, explainable five-to-eight-task planning,
locked-plan behavior, atomic JSON persistence, and 10,000-task performance.
Integration checks cover Agent identity, persistence boundaries, attention, and
recovery contracts. Set `STASH_KEEPLINE_E2E_BINARY` to a packaged
`Contents/Resources/KeeplineService` to also check the real embedded service
against isolated test data, as the native CI job does.

## Build a macOS app

```sh
./scripts/package_app.sh
open '.build/app/Stash Time Ledger.app'
```

Quit a running packaged copy before rebuilding it. The packaging command will
stop with a clear error instead of replacing an active app bundle. The packaged
app is ad-hoc signed for local use and loads its packaged resources first, so
launching it does not depend on the source checkout or build directory. Its data lives at:

```text
~/Library/Application Support/Stash Time Ledger/workspace-v1.json
```

The workspace is versioned Codable JSON and is replaced atomically on save.
Stash keeps the previous version as `workspace-v1.backup.json`. Use the Data
menu or Settings to export and import portable JSON backups.

The active product mark is stored at
`Sources/StashTimeLedger/Resources/AppIcon-v3.png`. It uses a centered macOS
rounded-square silhouette with transparent outer padding. Packaging derives
the complete `.icns` set from that source, installs it as the Dock icon, and
uses the same mark in the app sidebar.

## Daily planning

Stash ranks active, overdue, scheduled, pinned, high-priority, due-soon, and
older unfinished work. It selects five to eight tasks within a six-hour default
budget and shows the leading reason on every row. These limits and whether Inbox
may fill open slots are configurable in Settings. `Lock today` freezes the order
for the current date. Captures cannot silently change a locked plan, and
completed entries remain visible when an unlocked plan refreshes.

Capture supports the compact tokens already familiar from Stash:

```text
Finish onboarding #Stash ^p1 !tomorrow *45m
```

- `#project` assigns or creates a project.
- `^p0` through `^p3` set priority.
- `!today` and `!tomorrow` schedule the task.
- `*30m` and `*2h` set the estimate.

The task inspector supports arbitrary scheduled and due dates, daily, weekday,
weekly, and monthly recurrence, and local macOS reminders. Project creation,
renaming, icons, deletion, recoverable Trash, and permanent deletion are built
in. Reminder permission is requested only after a task receives a future
reminder.

## Keepline integration

The default Local API is `http://127.0.0.1:3377`. Stash probes it after the
first frame, keeps stale/offline data visibly distinct from live data, and
never completes a task from Agent evidence without the user's decision.

For local development and isolated E2E runs:

```sh
STASH_WORKSPACE_PATH=/absolute/path/workspace.json \
STASH_KEEPLINE_BASE_URL=http://127.0.0.1:3377 \
STASH_KEEPLINE_EXECUTABLE=/absolute/path/to/keepline \
swift run StashTimeLedger
```

`STASH_KEEPLINE_EXECUTABLE` is an optional development override. A packaged app
uses its bundled `KeeplineService` executable when no override is present.
Stash launches a service only if no compatible instance answers and terminates
only the child it launched itself. No keyboard shortcuts are added by this
integration.
