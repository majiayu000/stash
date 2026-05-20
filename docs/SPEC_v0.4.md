# stash SPEC v0.4 - Access, Route Contract, and Production Readiness

Date: 2026-05-20
Status: validation-ready
Builds on: `docs/SPEC_v0.2.md` and `docs/SPEC_v0.3.md`

## 1. Goal

stash is a local-first todo and AI-agent workbench for one user on one machine.
The app must be easy to start, every concept page must be reachable from the
switcher and by URL, and release readiness must be proven by fresh commands.

This spec is the current operational contract. Older specs describe the design
history; this file describes how the app is accessed, how pages are wired, what
tests prove it, and what remains before a production-quality local release.

## 2. Access

Install dependencies:

```sh
bun install
```

Create a demo database with believable local data:

```sh
STASH_DB_PATH=/tmp/stash-demo.db bun run seed:rich:sessions
```

Start the backend:

```sh
STASH_DB_PATH=/tmp/stash-demo.db CLAUDE_ROOT=/tmp/stash-rich-claude bun run server:dev
```

Start the frontend in another shell:

```sh
bun run client:dev
```

Open:

- Client: `http://localhost:5173/`
- Server health: `http://localhost:4174/health`
- Default local SQLite path: `~/Library/Application Support/stash/app.db`
- Override DB path: `STASH_DB_PATH=/absolute/path/to/stash.db`
- Override agent roots: `CLAUDE_ROOT=/path/to/claude`, `CODEX_ROOT=/path/to/codex`

Run diagnostics:

```sh
bun run doctor
```

`doctor` reports local install state, resolved DB paths, Claude/Codex roots, and
whether the expected server/client ports are reachable. Missing optional local
paths are warnings; hard environment failures should be failures.

## 3. Route Contract

The client owns all workbench routes and redirects unknown routes back to `/`.
The implementation route shape is:

```txt
/                 -> Concept E
/c/:id            -> Concept by id
/c/:id/:detailId  -> detail route slot used by G, K, and L
*                 -> redirect to /
```

Public route matrix:

| Route | Page | Purpose |
|---|---|---|
| `/` | Concept E | default capture and board |
| `/c/e` | Concept E | explicit capture and board route |
| `/c/a` | Concept A | card wall |
| `/c/b` | Concept B | mission control |
| `/c/c` | Concept C | hero and live stream |
| `/c/d` | Concept D | constellation |
| `/c/f` | Concept F | project picker and edit entry |
| `/c/g` | Concept G | latest/first available session detail shell |
| `/c/g/:sessionId` | Concept G detail | canonical session deep link |
| `/c/h` | Concept H | cost and burn analytics |
| `/c/i` | Concept I | command palette page |
| `/c/j` | Concept J | weekly review |
| `/c/k` | Concept K | first available project workbench |
| `/c/k/:projectId` | Concept K detail | canonical project deep link |
| `/c/l` | Concept L | first available todo detail |
| `/c/l/:workItemId` | Concept L detail | canonical todo deep link |
| `/c/m` | Concept M | skills library |
| `/c/n` | Concept N | settings |
| `/c/o` | Concept O | start session dispatcher |
| `/c/prd` | PRD | product requirements page |

Important: Concept G does not include provider in the URL. Provider is resolved
from the session record so the stable URL is `/c/g/:sessionId`.

## 4. Page Connectivity Definition

A page counts as connected only when all of these are true:

1. The route renders through `App.tsx` and `Workbench.tsx`.
2. The switcher entry navigates to the route.
3. `render.tsx` maps the concept id to a concrete component.
4. The page renders `.dashboard-canvas` and its `data-testid="concept-<id>"`.
5. Required data loads from real API calls or an explicit empty state.
6. Runtime does not show `Failed to load data`.

The registry metadata in `client/src/workbench/concepts/registry.ts` must agree
with the component map in `client/src/workbench/concepts/render.tsx`.

## 5. Feature Matrix

| Concept | Route | Primary data | Current status |
|---|---|---|---|
| A | `/c/a` | workboard, areas, sessions | connected |
| B | `/c/b` | workboard by project, sessions | connected |
| C | `/c/c` | workboard, live sessions | connected |
| D | `/c/d` | areas, workboard, sessions | connected |
| E | `/`, `/c/e` | capture, inbox, today, board | connected |
| F | `/c/f` | areas/projects | connected |
| G | `/c/g`, `/c/g/:sessionId` | agent sessions, transcript events | connected |
| H | `/c/h` | burn analytics, budgets | connected |
| I | `/c/i` | local search across workbench data | connected |
| J | `/c/j` | weekly analytics, stale work | connected |
| K | `/c/k`, `/c/k/:projectId` | project intent, milestones, decisions, notes, lessons, skills | connected |
| L | `/c/l`, `/c/l/:workItemId` | work item detail, subtasks, sessions, evidence | connected |
| M | `/c/m` | skills and project bindings | connected |
| N | `/c/n` | theme, project CRUD, notifications | connected |
| O | `/c/o` | prompt composition and session dispatch | connected |
| PRD | `/c/prd` | static product requirements | connected |

## 6. Data And API Contract

Backend:

- Runtime: Bun + Hono
- Storage: local SQLite via `bun:sqlite`
- Default server port: `4174`
- Database migrations run at startup
- No auth, no cloud, no telemetry

Frontend:

- Runtime: React + Vite
- Default client port: `5173`
- Routing is client-side
- Themes persist locally

Core API families:

- `/api/work-items/*`
- `/api/workboard`
- `/api/areas`
- `/api/projects/:id/*`
- `/api/skills`
- `/api/agent-sessions*`
- `/api/analytics/*`
- `/api/budgets`
- `/api/sessions/*`

Errors that prevent panel data from rendering should be visible to users. A
blank panel is valid only when the API succeeded and returned no data.

## 7. Verification Gates

Before claiming a release or handoff is ready, run these commands from the repo
root:

```sh
git diff --check
bun run doctor
bun run typecheck
bun run server:test
bun run client:test
bun run client:build
bun run client:e2e
```

Route-specific proof:

```sh
cd client && bun run e2e concept-routes.spec.ts
```

The route e2e must prove:

- `/` and `/c/e` render Concept E
- every switcher entry can be clicked
- every concept route renders `.dashboard-canvas`
- no route smoke shows `Failed to load data`
- `/c/g/:sessionId` resolves a real fixture session

## 8. Production-Grade Criteria

Ready for a local production release means:

1. All verification gates pass in a fresh session.
2. The README access instructions match the actual routes and ports.
3. `doctor` distinguishes failures from warnings without silent success.
4. SQLite migration and backup strategy is documented before destructive schema
   changes.
5. API failures are visible in user-facing panels.
6. Performance-sensitive agent-session scans are cached or bounded.
7. Release checklist covers install, seed, run, verify, diagnose, and direct
   access routes.

## 9. Known Remaining Work

The app is connected, but not fully production-hardened. Remaining high-value
work:

- Split the client bundle or tune Rollup manual chunks. `bun run client:build`
  succeeds, but Vite currently warns because the main JS chunk is about 505 kB.
- Broaden API error panels beyond the first wired concepts so every async panel
  has a visible retry path.
- Expand agent-session caching from repeated scans to usage aggregates and
  analytics paths.
- Add CI checks for typecheck, server tests, client tests, build, and e2e.
- Add a first-run path that creates or explains the default DB location before
  users see a missing DB warning.
- Decide whether Concept F should become a dedicated route for project creation
  or remain the project-edit entry surface.

## 10. Done-When

This spec is satisfied when:

- Users can access the app through `http://localhost:5173/`.
- The server health endpoint responds at `http://localhost:4174/health`.
- All public routes in the route matrix render.
- The concept switcher can navigate through all 16 entries.
- Fresh verification output proves the app passes the gates in section 7.
- Any remaining hardening items are tracked as issues or PR follow-ups.

## 11. Fresh Verification - 2026-05-20

Latest local validation from this branch:

| Command | Result |
|---|---|
| `git diff --check` | pass |
| `bun run doctor` | pass with dev server/client OK when started; warns for missing default DB before first local seed |
| `bun run typecheck` | pass |
| `bun run server:test` | 204 pass |
| `bun run client:test` | 2 pass |
| `bun run client:build` | pass with the known 505 kB chunk-size warning |
| `bun run client:e2e` | 12 pass |
| `cd client && bun run e2e concept-routes.spec.ts` | 3 pass |
