# Stash + Keepline Native POC

Status: implementation
Target: macOS 14+
Surface: `native/prototypes/time-ledger`

## Product decision

Stash remains the single user-facing work planner. Keepline supplies local
agent-runtime observations behind Stash; its web dashboard is not embedded or
restyled inside the native app.

This POC proves one read-only vertical slice: while the native Today surface is
open, its horizon rail can show live Claude Code and Codex sessions obtained
from Keepline's authenticated loopback API.

## User contract

- Today remains the dominant surface and still answers the daily-plan questions
  without waiting for Keepline.
- Agent activity is secondary, compact, and visible only in the empty task
  inspector's horizon rail.
- Running, waiting, and idle sessions show their runtime, title, status, and
  recency.
- A stopped or misconfigured Keepline service produces a visible, retryable
  state. Stale data is not presented as live data.
- Agent observations never complete, reorder, edit, or otherwise mutate a task
  in this POC.
- The integration adds no keyboard shortcuts.

## Architecture

`StashAgentBridge` owns the loopback contract and API decoding. The SwiftUI
executable owns presentation state. `StashCore` continues to own tasks,
projects, daily planning, and persistence.

The bridge:

1. accepts only an HTTP or HTTPS loopback URL;
2. obtains an in-memory token from `POST /api/auth/local`;
3. requests basic active sessions from `GET /api/sessions`;
4. retries authentication once after an unauthorized response;
5. never persists the token or reads Keepline's SQLite database directly.

The base URL comes from `STASH_KEEPLINE_BASE_URL` or the packaged
`KeeplineIntegration.plist`. No `.env` or credential file is changed.

## Performance contract

- Workspace bootstrap and first-frame rendering do not await Keepline.
- One fetch starts only when the Agent Activity section appears.
- There is no timer, polling loop, filesystem scan, or background daemon launch
  in Stash.
- Further refreshes are explicit user actions during the POC.
- Network decoding and requests remain off the main actor; only published view
  state is updated on the main actor.

## Files

- `native/prototypes/time-ledger/Package.swift`
- `native/prototypes/time-ledger/Sources/StashAgentBridge/*`
- `native/prototypes/time-ledger/Sources/StashTimeLedger/AgentActivityStore.swift`
- `native/prototypes/time-ledger/Sources/StashTimeLedger/AgentActivitySection.swift`
- `native/prototypes/time-ledger/Sources/StashTimeLedger/DetailRail.swift`
- `native/prototypes/time-ledger/Sources/StashTimeLedger/StashTimeLedgerApp.swift`
- `native/prototypes/time-ledger/Sources/StashCoreChecks/main.swift`
- `native/prototypes/time-ledger/scripts/package_app.sh`

## Acceptance

- A valid Keepline fixture decodes into normalized Claude Code and Codex session
  snapshots.
- Non-loopback service URLs are rejected.
- The native app builds in release mode and `swift run StashCoreChecks` passes.
- With Keepline running locally, the packaged app shows real active sessions.
- With Keepline stopped, the app stays usable and shows a retryable offline
  state.
