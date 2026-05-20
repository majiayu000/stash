# stash SPEC v0.5 - Production Polish Plan

Date: 2026-05-20
Status: planning
Builds on: `docs/SPEC_v0.4.md`

## 1. Purpose

stash already has a connected workbench: the client can render every concept
page, the switcher reaches the concept routes, and the release checklist has
fresh local verification commands. This spec defines the next production polish
cycle: the work required before stash feels safe, recoverable, and obvious for a
real local user.

Production-grade for this repo means:

1. A first user can install, create or select a database, start the app, capture
   a task, and understand failures without reading source.
2. Every public route has a recoverable state. No URL may produce a blank
   workbench.
3. Data loss risks are controlled before destructive migrations, dispatches, or
   parser failures can affect user work.
4. API and agent-source failures are visible in the UI, not silently converted
   into empty panels.
5. The verification path is one command locally and one CI workflow remotely.

## 2. Current Baseline

Verified as of SPEC v0.4:

- `git diff --check` passes.
- `bun run doctor` reports local install paths and ports.
- `bun run typecheck` passes.
- `bun run server:test` passes.
- `bun run client:test` passes.
- `bun run client:build` passes with a known main chunk warning around 505 kB.
- `bun run client:e2e` passes.
- `cd client && bun run e2e concept-routes.spec.ts` passes.

Current truth:

- All 16 concept pages are connected through `App.tsx`, `Workbench.tsx`, the
  concept registry, and `render.tsx`.
- `/`, `/c/:id`, and `/c/:id/:detailId` are the implementation route shapes.
- Concept G session URLs are `/c/g/:sessionId`; provider is resolved from data.
- The app is a single-user, local-first Bun + Hono + SQLite + React app.

Known production gaps:

- `/c/unknown` can render a blank workbench because the route matches but the
  concept id is missing.
- The README and code disagree on the default SQLite path.
- `test:all` is not a release gate because it omits build, e2e, and doctor.
- There is no GitHub Actions workflow.
- Migration state lacks checksums and dirty-state detection.
- Several JSON parse and UI catch paths convert failures into empty data.
- Agent scanner errors are returned by the server but dropped by the workbench
  data layer.
- Dispatch is fire-and-forget; there is no persisted run record.
- The app still presents as a 16-concept gallery instead of a guided first-user
  path.

## 3. Product Contract

stash is not a generic dashboard gallery. The production information
architecture must lead with the daily workflow:

```txt
Home -> Inbox/Todo -> Project -> Session/Evidence -> Settings
```

The 16 concept pages may remain as alternate views, but the first screen and
documentation must make the default path clear:

- Home: capture, inbox, today, doing, later.
- Inbox/Todo: triage, edit, schedule, complete, undo.
- Project: intent, milestones, decisions, notes, lessons, skills.
- Session/Evidence: transcript, touched files, inferred completion evidence.
- Settings: theme, projects, notifications, local paths.

The root route `/` is the daily home. It must not restore an arbitrary previous
concept unless there is an explicit user setting for that behavior. If the
switcher stores `stash:lastConcept`, that storage is either removed or used only
for switcher affordances, not for surprising root navigation.

## 4. Route And Page Contract

Production route requirements:

| Route | Required behavior |
|---|---|
| `/` | Render daily home with real data or explicit empty state |
| `/c/:id` | Render a known concept or recover to `/` with visible feedback |
| `/c/g` | Render a session shell using the latest or first available session |
| `/c/g/:sessionId` | Render the matching session or a recoverable not-found state |
| `/c/k` | Render a project shell using the first available project |
| `/c/k/:projectId` | Render the matching project or a recoverable not-found state |
| `/c/l` | Render a todo shell using the first available work item |
| `/c/l/:workItemId` | Render the matching work item or a recoverable not-found state |
| `*` | Redirect to `/` |

Implementation requirements:

- Rename the generic third route parameter to `detailId`, or use explicit route
  declarations for `/c/g/:sessionId`, `/c/k/:projectId`, and
  `/c/l/:workItemId`.
- Invalid concept ids must never return `null` from `Workbench`.
- Route e2e must cover `/c/unknown`, `/c/g/:sessionId`, `/c/k/:projectId`, and
  `/c/l/:workItemId`.
- README, release checklist, and specs must keep one public route matrix.

## 5. First-Run And CLI Contract

First-run must be understandable from a clean machine:

1. `bun install`
2. `bun run doctor --strict`
3. Create an empty DB, seed a demo DB, or point at an existing DB.
4. Start server and client.
5. Capture from UI.
6. Capture from CLI.

Required additions:

- `bun run install:cli` links or prints the exact PATH-safe install command for
  `tools/stash`.
- `stash doctor` or `tools/stash doctor` verifies `STASH_BASE_URL`, server
  reachability, and capture endpoint shape.
- `bun run doctor --strict` fails on missing DB file, missing DB directory,
  unreachable required server, invalid Bun version, and unreadable configured
  agent roots.
- Non-strict `bun run doctor` may warn for optional local paths, but it must
  always print the next command a user should run.

Default database path contract:

- `STASH_DB_PATH` always wins.
- On macOS, the default production path is
  `~/Library/Application Support/stash/stash.db`.
- On Linux, the default production path is
  `${XDG_DATA_HOME:-~/.local/share}/stash/stash.db`.
- Tests and Playwright must use isolated temp DB paths.
- README, SPEC, doctor output, and `server/src/config.ts` must agree.

## 6. Data Safety Contract

SQLite is the user's source of truth. The production data layer must protect it.

Required changes:

- Migration records store id, checksum, applied timestamp, and execution time.
- Startup fails if an applied migration checksum changes.
- Startup fails if migration state is dirty or a known migration file is
  missing after being applied.
- Destructive migrations require a backup gate or an explicit documented
  exception.
- Add `bun run db:backup` and `bun run db:restore -- --from <file>`.
- Backup files include app version, source DB path, migration version, and
  timestamp in metadata or filename.
- Multi-step writes that create observable state must be transactional.

Repository parsing requirements:

- JSON fields from SQLite must parse through a shared helper that returns typed
  data or raises a domain error.
- Parse failures must not silently become `[]`, `{}`, or `undefined`.
- Parent-child routes must verify ownership. For example, a project knowledge
  child update must prove the child belongs to the route project.

API error requirements:

- All JSON API errors use one envelope:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

- 500 responses do not expose internal stack or raw exception text.
- 404 and conflict responses use the same envelope as validation errors.

## 7. Frontend Reliability Contract

The UI must show failure states that help a user recover.

Required changes:

- `parseResponse` preserves HTTP status, API error code, and response body when
  JSON parsing fails.
- Network failures and non-JSON failures become typed client errors, not raw
  `SyntaxError`.
- Every async panel has one of these states: loading, data, empty, error with
  retry.
- Agent source errors from `/api/agent-sessions` are surfaced in the workbench,
  not dropped by `useWorkbenchData`.
- Existing catch blocks that currently ignore errors must either display the
  failure, log it to a visible diagnostics panel, or explicitly document why the
  failure is non-user-visible.

Accessibility and responsive baseline:

- Modal/dialog surfaces use focus trapping, Escape close, and `aria-modal`.
- Clickable `div` elements either become buttons or implement keyboard
  activation and focus styling.
- The daily home, route switcher, Quick Capture, search, project detail, and
  todo detail work at desktop and mobile widths.
- Reduced-motion settings stop decorative requestAnimationFrame loops and
  non-essential transitions.

Performance baseline:

- Add a bundle budget in CI.
- Split concept modules or Rollup chunks so the main chunk warning is resolved
  or accepted with a documented budget.
- Agent session scans are bounded, cached, or explicitly paginated for large
  local histories.

## 8. Agent Workflow Contract

AI-agent features must be traceable and recoverable.

Dispatch:

- Every dispatch creates a persisted `dispatch_runs` row.
- The row stores work item id, provider, cwd, prompt file, prompt hash, spawn
  command, pid when available, spawn result, error when present, created time,
  status, and matched session id when detected.
- UI shows pending, spawned, failed, matched, and closed states.

Evidence:

- Inferred completion evidence remains pending until the user accepts or
  rejects it.
- Evidence records include provider, session id, source line or event id when
  available, confidence, and raw evidence text.

Decisions:

- Decision candidates use a lifecycle:

```txt
candidate -> accepted decision
candidate -> ignored
```

- Candidate records retain provider, session id, source location, confidence,
  extracted text, and raw context.

Agent-source health:

- Claude and Codex scanner errors appear in a source-health panel.
- A user can see which roots were scanned and when the last scan succeeded.

## 9. Verification And CI Contract

Add one local command:

```sh
bun run verify
```

`verify` must run:

```sh
git diff --check
bun run doctor --strict
bun run typecheck
bun run server:test
bun run client:test
bun run client:build
bun run client:e2e
```

CI requirements:

- Add `.github/workflows/ci.yml`.
- Run on pull requests and pushes to the main branch.
- Install Bun from a pinned setup action.
- Cache Bun dependencies when safe.
- Run `bun install`.
- Run `bun run verify:ci` or the CI-safe equivalent.
- Upload Playwright traces or reports on failure.

E2E isolation requirements:

- Playwright uses a unique temp DB per run.
- Playwright avoids fixed DB paths that can collide with a manual dev server.
- Server and client ports are either reserved per run or checked before reuse.
- E2E tests cover route connectivity, quick capture, edit/done, recurrence,
  session dispatch, and the invalid-route recovery path.

Coverage requirements:

- New production code targets at least 80 percent line coverage.
- Critical data safety paths target direct tests for success and failure cases:
  migrations, backup/restore, JSON parse failures, API error envelopes, and
  dispatch run persistence.

## 10. Release Contract

`docs/RELEASE_CHECKLIST.md` must become the release runbook for a local
production build. It must include:

- Install from a clean checkout.
- First-run DB creation.
- Demo seed.
- Server/client startup.
- CLI install and capture.
- Direct route access matrix.
- Backup and restore proof.
- `bun run verify` output.
- Known warnings and whether each warning blocks release.
- Rollback steps for DB and app version.
- Version bump and changelog entry.

No release can be called ready while:

- Any route can blank-screen.
- `doctor --strict` fails.
- CI is missing or red.
- Backup/restore is untested after a migration change.
- API failures are hidden as empty user data.

## 11. Issue And PR Sequence

Do not land all polish in one PR. Use this order:

| Order | Issue | Scope | Acceptance |
|---|---|---|---|
| 1 | Route recovery and route contract | `/c/unknown`, `detailId`, G/K/L deep links, route docs | route e2e covers invalid and detail routes |
| 2 | First-run, DB path, and doctor strict mode | align default DB path, `doctor --strict`, first-run guidance | clean machine path is documented and enforced |
| 3 | CI and verify command | `bun run verify`, CI workflow, e2e isolation | local verify and GitHub Actions pass |
| 4 | Data safety | migration checksums, backup/restore, JSON parse errors, ownership checks | targeted tests prove failure cases |
| 5 | Frontend reliability | typed client errors, visible panel errors, scanner error UI, no blank async panels | component/e2e tests show retry and errors |
| 6 | Product IA and CLI | daily home, CLI install, first-user path docs | user can capture from UI and shell after install |
| 7 | Agent workflow traceability | `dispatch_runs`, source health, decision candidate lifecycle | dispatch and candidate states are persisted and visible |
| 8 | Performance and accessibility | bundle split/budget, mobile baseline, modal a11y, reduced motion | build has no untracked warning; Playwright/mobile/a11y checks pass |
| 9 | Release runbook | release checklist, rollback, changelog/version policy | one runbook proves install to rollback |

## 12. Traceability From Five Reviews

| Review track | Main findings | Spec sections |
|---|---|---|
| Routes/pages | Connected routes are real, but invalid concept ids blank and detail params are misleading | 4, 9 |
| Backend/data | DB path drift, migration safety, parse failures, ownership checks, API envelope gaps | 5, 6 |
| Frontend UX/perf | Error parsing, silent catches, responsive/a11y, bundle warning, scanner errors | 7, 9 |
| Tests/CI/release | No CI, no unified verify, e2e path collisions, release gaps | 9, 10 |
| Product/workflow | First-run and CLI friction, concept-gallery IA, dispatch and decision lifecycle gaps | 3, 5, 8 |

## 13. Done-When

This production polish cycle is complete when:

1. The issue sequence in section 11 is either merged or explicitly deferred with
   a rationale.
2. `bun run verify` passes locally from a clean checkout.
3. The GitHub CI workflow passes on the production polish branch.
4. A clean user can follow README from install to UI capture and CLI capture.
5. Every route in the public route matrix renders data, empty state, not-found
   state, or a recoverable error state.
6. DB backup/restore has been proven after the latest migration.
7. Agent scanner, dispatch, evidence, and decision states are visible enough
   that a user can recover after a failed or interrupted agent run.
