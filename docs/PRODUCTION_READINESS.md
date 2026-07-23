# Production Readiness Plan

Date: 2026-05-19
Status: local-first beta; production hardening needed
Scope: single-user desktop/local deployment of stash

## Current State

The product is already useful as a local workbench:

- Five stable product sections render through persistent navigation.
- Quick Capture, CLI capture, inbox triage, Today, recurrence, reminders,
  project knowledge, skills, session detail, dispatcher, analytics, weekly
  review, settings, and budgets are wired to real backend data.
- Local verification on 2026-05-19:
  - `bun run typecheck` passed.
  - `bun run client:build` passed with only the Vite chunk-size warning.
  - `bun run test:all` passed: 204 server tests and 2 client tests.
  - `bun run client:e2e` passed: 9 Playwright tests.
  - Browser smoke verifies Work, Projects, Sessions, Review, Settings, and the
    task, project, and session detail routes.

This is enough for dogfooding. It is not enough to call the app production-grade.

## Production Bar

Production-grade for stash means:

- Page loads stay responsive with large local Claude/Codex histories.
- Route contracts, docs, and UI deep links match exactly.
- User data survives crashes, migrations, and accidental app restarts.
- Empty, missing, corrupt, or slow data sources are visible states, not silent
  degradation.
- Every high-value user workflow has a browser-level regression test.
- The app can be installed, upgraded, backed up, and diagnosed without reading
  source code.

## P0: Correctness and Responsiveness

The original hardening issues [#1](https://github.com/majiayu000/stash/issues/1)
through [#5](https://github.com/majiayu000/stash/issues/5) are closed. Their
closure is historical delivery evidence, not a claim that every production
boundary is complete: README still records the remaining background-refresh,
release-packaging, and license limits.

### 1. Cache and Bound Agent Session Scans

Tracking issues: [#2](https://github.com/majiayu000/stash/issues/2) (closed),
[#121](https://github.com/majiayu000/stash/issues/121) (frontend bounded
refresh), and [#122](https://github.com/majiayu000/stash/issues/122) (Burn
Worker aggregation).

Problem:
`/api/agent-sessions`, `/api/workboard`, `/api/analytics/burn`, and
`/api/analytics/weekly` depend on local session histories. The current build
uses per-file metadata/usage cache, route limits, in-process singleflight,
shared frontend snapshots, and a dedicated Worker for filesystem scans and
Burn aggregation. A general stale-while-refresh backend for every
session-derived route is not implemented yet.

Observed on 2026-05-19:

- `/api/analytics/burn?days=30`: about 10.6s.
- `/api/analytics/weekly`: about 37.3s.
- `/api/workboard` and `/api/agent-sessions` can spike when concurrent scans
  compete for the same file tree.

Target:

- First uncached scan: bounded and observable.
- Warm page load: under 500ms for workbench data.
- Analytics pages: render immediately with cached data plus visible refresh
  state.

Plan:

1. Done: add a session index table keyed by provider + source path + mtime + size.
2. Done: only parse changed JSONL files after the first scan.
3. Done: store usage per session and aggregate Burn inside the scan Worker
   without moving raw window-level events to the API thread.
4. Done: add an in-process singleflight guard so concurrent requests share one scan.
5. Partial: workbench callers share bounded stale snapshots; a general backend
   stale response with `isRefreshing: true` remains deferred.
6. Add route-level timing logs and response metadata for cache hit/miss.

Done when:

- A large-history fixture proves warm `/api/workboard` and
  `/api/agent-sessions?provider=all` complete under 500ms.
- Done: a 16,384-row / 6,000-candidate / 50,000-event fixture proves warm
  `/api/analytics/burn?days=30` completes under 1s while `/health` remains
  responsive; the existing 3,000-file Weekly budget remains unchanged.
- The UI never shows `loading workbench...` for more than 1s after the first
  successful load.

### 2. Make Route Contracts Exact

Tracking issue: [#1](https://github.com/majiayu000/stash/issues/1)

Problem:
The current app supports `/sessions/:sessionId`. Provider-qualified session
links should either
work or disappear from docs and UI.

Target:
All documented routes work exactly as documented.

Plan:

1. Keep `/sessions/:sessionId` as the current canonical route.
2. Add `/sessions/:provider/:sessionId` only if the UI needs provider disambiguation.
3. If provider-qualified links are added, update `SessionDetailPage` to read both
   parameters and resolve the session by provider + id.
4. Add Playwright coverage for both canonical and compatibility session links.

Done when:

- README, PRD, specs, router, and generated UI links agree.
- Unknown routes show a clear not-found state instead of redirecting
  silently to `/`.

### 3. Replace Silent Catch Blocks With User-Visible Error States

Tracking issue: [#3](https://github.com/majiayu000/stash/issues/3)

Problem:
Several frontend effects intentionally catch and drop API failures. That keeps
the UI alive, but it can hide missing analytics, lessons, skills, evidence, or
session events.

Target:
No user-visible missing data caused by an exception is silently swallowed.

Plan:

1. Audit `catch(() => {})` and `catch(() => setX([]))` in `client/src`.
2. For optional panels, render a scoped warning with retry.
3. For required page data, render a page-level error state with the failing
   endpoint name.
4. Normalize API error display with one small shared component.

Done when:

- A forced 500 from each major API family produces a visible, test-covered
  error state.
- Console-only failure reporting is limited to noncritical telemetry.

## P1: Data Safety

### 4. Backup and Migration Discipline

Tracking issue: [#4](https://github.com/majiayu000/stash/issues/4)

Target:
Users can upgrade without losing the SQLite database.

Plan:

1. Add `stash backup` and `stash restore` commands.
2. Before every migration, copy the DB to a timestamped backup path.
3. Add migration smoke tests against a seeded DB, not only an empty DB.
4. Document the default DB path and backup path in README.

Done when:

- A seeded v0.1/v0.2/v0.3-style DB migrates forward with all work items,
  areas, skills, knowledge, budgets, and links intact.

### 5. Config Surface

Target:
All runtime paths and external tool commands are inspectable and overrideable.

Plan:

1. Add a config view/API for DB path, Claude root, Codex root, and server port.
2. Validate missing roots and permission errors at startup.
3. Show source health in Settings, including last scan time and scan errors.

Done when:

- A fresh install can diagnose "no sessions found" from Settings without opening
  the terminal.

## P2: Coverage and UX Polish

### 6. Full Workflow Golden Paths

Tracking issue: [#5](https://github.com/majiayu000/stash/issues/5)

Current e2e covers the highest-value flows and every stable product section.

Add Playwright tests for:

- All five primary navigation entries.
- Task, project, and session deep links.
- Usage analytics loaded state from cached usage aggregates.
- Weekly review loaded state from cached weekly aggregates.
- Context flow from task to session and back to related entities.

Done when:

- `bun run client:e2e` proves every primary section and README deep link resolves.

### 7. Install and Release Path

Tracking issue: [#5](https://github.com/majiayu000/stash/issues/5)

Target:
A user can install, run, upgrade, and inspect the app from documented commands.

Plan:

1. Add a release checklist covering `bun install`, seed, server, client, tests,
   and DB backup.
2. Add `doctor` command/API checks for Bun version, DB path, roots, and ports.
3. Decide whether production packaging means a desktop wrapper, a launchd
   service, or documented local server mode.

Done when:

- A clean macOS user account can follow the docs and reach the workbench without
  source-level troubleshooting.

## P3: Later Product Hardening

- Voice capture.
- Browser extension or native global hotkey.
- Multi-device sync.
- Daily planning automation.
- Calendar or terminal-feed surfaces.

These are product expansion items. They should not block the production
hardening work above.

## Verification Matrix

| Area | Command or Check |
|---|---|
| Type safety | `bun run typecheck` |
| Server tests | `bun run server:test` |
| Client tests | `bun run client:test` |
| Browser e2e | `bun run client:e2e` |
| Full local suite | `bun run typecheck && bun run test:all && bun run client:e2e` |
| Production smoke | Seed rich DB, start server/client, browser-open all documented routes |
| Performance smoke | Measure warm `/api/workboard`, `/api/agent-sessions`, `/api/analytics/burn`, `/api/analytics/weekly` |

## Recommended Implementation Order

1. Fix route contract and add route tests.
2. Add session scan cache + singleflight.
3. Persist usage aggregates for analytics and weekly review.
4. Add visible error states for failed optional panels.
5. Add backup-before-migration and seeded migration tests.
6. Expand e2e coverage to every documented page.
7. Add doctor/release docs and package the local run story.
