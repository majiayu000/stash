# Stash × Keepline Integration v1

Status: frozen implementation contract
Date: 2026-08-30
Products: Stash Time Ledger (macOS) and Keepline (local service + web dashboard)

## 1. Product boundary

Stash is the sole source of truth for personal tasks, Today planning, short-term and long-term horizons, and the user's final completion decision.

Keepline is the sole source of truth for local agent runtimes, sessions, dispatches, recovery, execution evidence, and completion suggestions.

The products share stable identifiers. They must not copy each other's planner or runtime scanner.

## 2. Required user journey

1. Stash opens to a usable Today view without waiting for Keepline.
2. Within three seconds, the user can see today's 5–8 tasks, the current task, near-term work, long-term work, and whether an Agent needs attention.
3. In a task inspector, the user can either link a recent existing session or launch a Codex/Claude Code session for that task.
4. A linked session shows `Working`, `Needs you`, `Finished`, `Lost`, or `Offline`, plus a short evidence summary and last update time.
5. An Agent completion signal produces a review card. It never completes the Stash task automatically.
6. `Complete task` completes the Stash task and records the accepted suggestion in Keepline. `Keep open` records the rejection and leaves the task open.
7. Links and completion decisions survive both app and service restarts.
8. Keepline failure never blocks capture, planning, editing, or completing ordinary Stash tasks.

## 3. Keepline Service Mode

`keepline service` is a headless mode of the existing Keepline executable. It loads only migrations, auth, lightweight session summaries, runtime scanning, work items, dispatch, evidence, and the versioned Local API.

It must not import or initialize the dashboard static bundle, React/Ink UI, PTY, Memory/LanceDB, compression, LiteLLM pricing, or browser terminal.

Startup behavior:

- bind loopback only by default;
- make health and metadata available before the first scan;
- serve the persisted DB snapshot immediately;
- run the first scan in the background with `includeToolCalls: false`;
- expose partial runtime scan failures instead of turning them into an empty-success response;
- own and clear all timers during shutdown.

The existing dashboard and `/api/*` routes remain compatible.

## 4. Local API v1

All normal responses use the existing `{ success, data, error }` envelope. Unknown fields are additive. Errors that change user-visible state are returned as errors, never as an empty fallback.

Unauthenticated loopback endpoints:

```http
GET /api/v1/health
GET /api/v1/meta
POST /api/v1/auth/local
```

`GET /api/v1/meta` returns:

```json
{
  "success": true,
  "data": {
    "apiVersion": "1.0",
    "serviceVersion": "1.0.0",
    "instanceId": "stable-for-process-lifetime",
    "mode": "service",
    "capabilities": [
      "sessions.list",
      "sessions.recover",
      "work-items.external-upsert",
      "work-items.session-link",
      "work-items.completion-review",
      "dispatch.codex",
      "dispatch.claude-code"
    ],
    "runtimes": []
  }
}
```

Authenticated endpoints:

```http
GET  /api/v1/sessions
GET  /api/v1/sessions/:id
POST /api/v1/sessions/:id/recover

GET  /api/v1/work-items
PUT  /api/v1/work-items/external/:source/:externalId
POST /api/v1/work-items/:id/session-links
POST /api/v1/work-items/session-links/:id/accept
POST /api/v1/work-items/session-links/:id/reject
POST /api/v1/work-items/:id/completion-review

POST /api/v1/work-items/:id/dispatch
GET  /api/v1/dispatches/:id
POST /api/v1/dispatches/:id/resolve-session
```

External identity is idempotent. Stash uses `source=stash` and its task UUID as `externalId`.

### Dispatch contract

Request:

```json
{
  "runtimeId": "codex",
  "cwd": "/absolute/existing/project/path",
  "prompt": "Task title and user-authored notes",
  "terminalApp": "auto",
  "idempotencyKey": "stash:<task-uuid>:<attempt-uuid>"
}
```

States:

```text
queued | launching | awaiting_session | linked | ambiguous | failed | cancelled
```

Correlation records the runtime, canonical cwd, launch time, and the pre-launch session IDs. A session is auto-linked only when exactly one new root session for that runtime and cwd appears after launch. Multiple candidates produce `ambiguous` and require user selection.

Commands are built from validated executable and argv arrays. Shell strings are allowed only at the AppleScript terminal boundary, where every argument is shell quoted.

### Completion review

An explicit completed evidence record creates a completion suggestion in the workboard projection. It does not update the work item or Stash task. The completion-review endpoint records `accepted` or `rejected`; Stash performs its own local task mutation only after a successful accepted response.

## 5. KeeplineKit Swift SDK

The canonical package lives in `keepline/sdk/swift` and is consumed by Stash as a local Swift Package dependency for this repository POC.

The SDK owns:

- loopback URL validation;
- local authentication and one 401 re-authentication;
- explicit request timeouts;
- v1 metadata/capability negotiation;
- tolerant decoding of unknown runtimes, statuses, and additive fields;
- session listing, external work-item upsert, session linking, dispatch, and completion review.

The SDK does not scan files, read Keepline SQLite, launch the service, or own SwiftUI state.

## 6. Stash integration state

Stash persists `AgentTaskLink` records in the workspace rather than transient session state inside `LedgerTask`.

```text
taskID
keeplineWorkItemID
sessionID?
dispatchID?
runtimeID
source: dispatched | manuallyLinked
linkedAt
completionDecision: undecided | accepted | rejected
```

There can be at most one non-terminal link per task. Workspace decoding must migrate existing v1 files without data loss.

The integration store is separate from `LedgerStore`, so Agent updates do not recalculate the daily plan. It starts after the first frame, uses one shared refresh loop, marks cached data stale when disconnected, and backs off after failures.

Service lifecycle:

- probe configured loopback URL first;
- if unavailable and an executable is configured, launch `keepline service` with `Process` and argv, never a shell;
- do not launch a duplicate service when a compatible instance is already listening;
- show `offline`, `incompatible`, and `failed to start` distinctly;
- only terminate a child process that this Stash instance launched.

## 7. Native UI

- Global Agent Activity stays compact in the horizon rail.
- Selecting a task must not hide that task's Agent state.
- The inspector exposes only four primary actions: start yourself, link Agent, launch Agent, review completion.
- Existing-session matching by directory/title is a suggestion only; the user confirms the link.
- Status color is a small accent, not a second visual theme.
- No keyboard shortcuts are added.

## 8. Keepline web information architecture

The dashboard is a quiet command desk, not a collection of equally weighted internal modules.

- Primary navigation: `Overview`, `Work`, `Sessions`.
- Secondary tools: recovery, projects, plans, memory, and usage live under one `More` group.
- `Work` is the canonical task/execution board and includes link suggestions and completion review actions.
- The design direction is refined industrial minimalism: calm neutral surfaces, compact typography, one cool accent, purposeful motion only, and no generic gradient-heavy dashboard styling.
- Existing URLs/features remain reachable; this is an information-architecture cleanup, not deletion.

## 9. Verification contract

Focused checks support iteration but do not constitute final acceptance.

The final E2E uses isolated temporary Stash and Keepline data homes, a temporary Git repository, the release Keepline service build, and the packaged Stash `.app`. It proves:

1. first-frame task planning works with Keepline stopped;
2. Stash starts or connects to Service Mode;
3. API metadata, auth, sessions, external work-item upsert, link, evidence, and completion review cross a real loopback socket;
4. a real runtime process/session is detected and persisted;
5. Stash displays working/waiting/finished/offline states without manual data injection;
6. an Agent finish does not auto-complete the task;
7. both `Keep open` and `Complete task` decisions persist;
8. service and app restarts preserve link and evidence;
9. an ambiguous correlation never silently links;
10. release build, signing, plist validation, idle CPU, memory footprint, and interaction latency pass.

Targets:

- Stash Today interactive p95 <= 1 second;
- Agent state determined <= 3 seconds;
- task selection/click response p95 <= 100ms;
- Service health ready <= 1.5 seconds;
- warm local API p95 <= 100ms;
- event/update to UI p95 <= 3 seconds;
- restart recovery <= 5 seconds;
- steady idle CPU for Stash + Service < 1% average;
- Stash physical footprint <= 150MB;
- Service physical footprint <= 150MB, cold peak < 300MB.

No E2E run may use the user's real Stash workspace or `~/.keepline/keepline.db`.

## 10. Local release hardening

The packaged Stash app must be usable without a manually maintained terminal
process. Packaging therefore builds Keepline's dedicated Service Mode entry
point as a standalone local executable and embeds it in the app bundle. The
native app resolves that bundled executable only when no explicit
`STASH_KEEPLINE_EXECUTABLE` override is present.

Lifecycle rules:

- Stash still probes `127.0.0.1` before launching anything;
- only one compatible Service Mode process may own the configured port;
- a service launched from the bundle is a child of Stash and is terminated when
  Stash exits, so no idle background daemon remains;
- the embedded service entry point contains no dashboard, browser terminal,
  Memory/LanceDB, pricing, or React UI imports;
- the app bundle signs the embedded executable before signing the outer app;
- packaging fails visibly if the sibling Keepline source or embedded service
  build cannot be produced.

Keepline dashboard coexistence:

- when a compatible Service Mode instance is already running, the Web process
  reads the persisted session snapshot and does not start a second transcript
  or process scanner;
- without Service Mode, the Web command preserves its standalone sync behavior;
- the dashboard terminal uses Bun's built-in PTY implementation, so installing
  Keepline never depends on a separately published native dynamic library;
- pricing tests inject a deterministic catalog and never depend on the live
  LiteLLM response order or current prices.

Release verification additionally proves that the packaged app can start the
embedded service from an isolated data home, reach health and metadata, stop
the owned child on app exit, and leave an already-running compatible service
untouched.
