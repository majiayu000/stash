# stash — Todo + Agent Workboard SPEC (v0.1, historical)

> ⚠️ **Superseded by [`docs/SPEC_v0.2.md`](./docs/SPEC_v0.2.md) + [`docs/PLAN.md`](./docs/PLAN.md).**
> v0.1 described an 8-page GitHub-style UI that has been removed. v0.2 is the workbench-design-template port (15 concepts + PRD, 7 themes, with new skills/project-knowledge/analytics backend domains).
> This file is kept for historical context only.

Source: `docs/reference/prd/PRD.md` (Claude-Code-Monitor PRD_TODO_AGENT_WORKBOARD).
Visual reference: `docs/reference/workbench-explore/` (workbench design template — primary).
Standalone implementation in this directory. Existing Claude-Code-Monitor code is **read-only reference**, not a runtime dependency.

---

## 1. Goals

1. Todo capture is the source of truth. Project is optional.
2. Inbox / Today / Upcoming / Someday / Waiting / All / Areas all reachable in one click.
3. Live Claude + Codex session monitoring is **evidence**, never the primary product.
4. Inferred progress never silently overwrites manual status.
5. Every claim of progress traces back to an evidence record.
6. Dense, work-focused UI — no decorative hero, no nested cards, ≤8px radius (per PRD §13).

## 2. Non-Goals (MVP)

- No team collaboration, no cloud sync, no auth.
- No replacement for Jira/Linear.
- No automatic code mutation from todos.
- No mobile/compact view in MVP (1440px desktop first; degrade gracefully to 1280px).
- No Obsidian/Notion two-way sync.

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Bun ≥1.1 | Built-in `bun:sqlite`, `bun:test`, fast TS, single toolchain |
| Server framework | Hono | Mature routing, low overhead, works native on Bun |
| DB | `bun:sqlite` (SQLite 3) | Zero native bindings, transactional, file-based |
| Migrations | Hand-rolled SQL files, numbered `001_*.sql` … | Simple, versioned, replayable in tests |
| Server tests | `bun test` | In-process, supports SQLite per-test file |
| Client | React 18 + Vite + TypeScript | Match reference stack |
| Client router | React Router v6 | 8 top-level routes in PRD §15 |
| Client tests | Vitest + `@testing-library/react` + `@testing-library/user-event` | Component & hook tests |
| E2E | Playwright | One golden path per slice |
| Styling | **Tailwind CSS v3** + custom theme in `tailwind.config.ts` (mockup tokens as `colors.*` + `borderRadius.*` capped at 8px) + minimal `globals.css` for resets and `@layer` utilities | Atomic utility classes, fast iteration, design tokens in one config file |
| Lint/format | Prettier (default config), TypeScript strict | Avoid bikeshed |
| Shared types | `shared/` folder, imported via relative paths from both server and client | No workspace setup overhead |

Rejected alternatives:
- **Tauri shell** — out of scope. Web-served UI is enough for personal local use.
- **better-sqlite3** — `bun:sqlite` is API-compatible enough and ships with Bun.
- **Workspaces / monorepo tools (turbo, nx)** — overkill for 3 folders.
- **CSS modules** — user override; Tailwind chosen for unified token control.

## 4. Repo Layout

```
stash/
├─ package.json                       # root, bun workspaces NOT used
├─ tsconfig.base.json                 # shared compiler options
├─ .gitignore
├─ SPEC.md                            # this file
├─ README.md                          # how to run/test
├─ docs/
│  └─ reference/
│     ├─ prd/PRD.md
│     ├─ mockups/*.html
│     └─ workbench-explore/*          # original workbench design (reference only)
├─ shared/
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ src/
│     ├─ work-item.ts                 # WorkItem, WorkItemKind, WorkItemStatus, …
│     ├─ area.ts
│     ├─ project.ts
│     ├─ agent-session.ts
│     ├─ progress-evidence.ts
│     └─ index.ts
├─ server/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ src/
│  │  ├─ index.ts                     # Hono app bootstrap, listens on PORT (default 4174)
│  │  ├─ config.ts                    # env: PORT, STASH_DB_PATH, CLAUDE_ROOT, CODEX_ROOT
│  │  ├─ db/
│  │  │  ├─ connection.ts             # opens sqlite, runs migrations
│  │  │  ├─ migrate.ts                # runner — applies pending SQL files in order
│  │  │  └─ migrations/
│  │  │     ├─ 001_work_items.sql     # Slice 1
│  │  │     ├─ 002_areas.sql          # Slice 1
│  │  │     ├─ 003_work_item_sessions.sql   # Slice 2
│  │  │     └─ 004_progress_evidence.sql    # Slice 4
│  │  ├─ domain/
│  │  │  ├─ work-item/
│  │  │  │  ├─ types.ts               # re-exports from shared, plus internal helpers
│  │  │  │  ├─ repository.ts          # DB rows ↔ WorkItem; CRUD primitives
│  │  │  │  ├─ service.ts             # business rules (status transitions, defaults)
│  │  │  │  └─ service.test.ts
│  │  │  ├─ area/{repository,service,service.test}.ts
│  │  │  ├─ project/{service,service.test}.ts        # projects derived from paths in MVP
│  │  │  └─ evidence/{repository,service,service.test}.ts   # Slice 4
│  │  ├─ adapters/
│  │  │  ├─ source.ts                 # AgentSource interface
│  │  │  ├─ claude/
│  │  │  │  ├─ scanner.ts             # Slice 2 — reads ~/.claude/projects/**/*.jsonl
│  │  │  │  ├─ parser.ts
│  │  │  │  ├─ fixtures/              # sample jsonl for tests
│  │  │  │  └─ scanner.test.ts
│  │  │  ├─ codex/                    # Slice 3
│  │  │  │  ├─ scanner.ts             # reads ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
│  │  │  │  ├─ parser.ts
│  │  │  │  ├─ fixtures/
│  │  │  │  └─ scanner.test.ts
│  │  │  └─ aggregator.ts             # merges claude + codex into AgentSession[]
│  │  ├─ web/
│  │  │  ├─ routes/
│  │  │  │  ├─ work-items.ts          # CRUD + link-session
│  │  │  │  ├─ areas.ts
│  │  │  │  ├─ overview.ts            # Overview projection
│  │  │  │  ├─ workboard.ts
│  │  │  │  ├─ agent-sessions.ts      # provider-neutral
│  │  │  │  └─ evidence.ts            # Slice 4
│  │  │  ├─ middleware/error.ts
│  │  │  └─ schemas.ts                # request/response zod schemas
│  │  └─ __tests__/
│  │     └─ integration/              # full-stack: spin Hono app + temp sqlite, hit routes
│  │        ├─ work-items.int.test.ts
│  │        └─ overview.int.test.ts
│  └─ fixtures/
│     └─ seed.ts                      # dev-only seed for visual verification
└─ client/
   ├─ package.json
   ├─ tsconfig.json
   ├─ vite.config.ts
   ├─ index.html
   ├─ src/
   │  ├─ main.tsx
   │  ├─ App.tsx                      # Router + layout shell
   │  ├─ api/
   │  │  ├─ client.ts                 # fetch wrapper, error normalization
   │  │  ├─ work-items.ts
   │  │  ├─ overview.ts
   │  │  └─ agent-sessions.ts
   │  ├─ hooks/
   │  │  ├─ useWorkItems.ts
   │  │  ├─ useInbox.ts
   │  │  ├─ useOverview.ts
   │  │  └─ useAgentSessions.ts
   │  ├─ pages/
   │  │  ├─ OverviewPage/
   │  │  ├─ InboxPage/
   │  │  ├─ TodoPage/
   │  │  ├─ ProjectsPage/
   │  │  ├─ WorkboardPage/
   │  │  ├─ SessionsPage/
   │  │  ├─ EvidencePage/             # Slice 4
   │  │  └─ shared/                   # Shell, TopNav, Sidebar, BottomDrawer
   │  ├─ components/                  # generic: Pill, Button, TaskRow, FormField, etc.
   │  └─ test-setup.ts
   ├─ e2e/                            # Playwright specs
   │  ├─ inbox-capture.spec.ts        # Slice 1
   │  ├─ link-session.spec.ts         # Slice 2
   │  ├─ codex-session.spec.ts        # Slice 3
   │  └─ progress-evidence.spec.ts    # Slice 4
   └─ vitest.config.ts
```

### 4.1 Tailwind theme tokens (`client/tailwind.config.ts`)

Custom design tokens derived from `interactive_product_shell.html` mockup:

```ts
colors: {
  ink: '#17191f',
  muted: '#68707b',
  line: '#d7dce2',
  'line-strong': '#aeb8c3',
  accent: '#e8ff67',
  status: {
    inbox:   '#1269e8',
    planned: '#1269e8',
    active:  '#1f9d62',
    waiting: '#b96f0c',
    blocked: '#c13f4a',
    someday: '#7c4a03',
    done:    '#596272',
  },
  provider: {
    claude: '#7547d8',
    codex:  '#1269e8',
  },
},
borderRadius: { none: '0', sm: '4px', DEFAULT: '6px', md: '7px', lg: '8px' }, // hard cap 8px per PRD §13
fontFamily: {
  sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
  mono: ['"SFMono-Regular"', '"Cascadia Code"', '"Liberation Mono"', 'monospace'],
},
```

Pills, status badges, provider badges read from `colors.status.*` / `colors.provider.*` directly — no inline hex codes in JSX.

## 5. Data Model

All timestamps are ISO 8601 strings (`new Date().toISOString()`). All IDs are ULIDs (lex-sortable, 26 chars, generated via small `ulid()` helper in `shared/src/id.ts`).

### 5.1 TypeScript types (`shared/src/`)

```ts
// work-item.ts
export type WorkItemKind =
  | 'epic' | 'feature' | 'task' | 'bug' | 'chore'
  | 'idea' | 'research' | 'decision' | 'reminder';

export type WorkItemStatus =
  | 'inbox' | 'planned' | 'active' | 'waiting' | 'blocked'
  | 'someday' | 'done' | 'dropped';

export type Priority = 'p0' | 'p1' | 'p2' | 'p3';
export type Source = 'manual' | 'claude_plan' | 'codex_goal' | 'session_inferred';
export type Confidence = 'explicit' | 'inferred';
export type Assignee = 'human' | 'claude' | 'codex' | 'mixed';

export interface ChecklistItem { id: string; text: string; completed: boolean; }

export interface WorkItem {
  id: string;
  projectId?: string;
  areaId?: string;
  parentId?: string;
  title: string;
  description?: string;
  outcome?: string;
  context?: string;
  kind: WorkItemKind;
  status: WorkItemStatus;
  priority: Priority;
  source: Source;
  confidence: Confidence;
  assignee: Assignee;
  labels: string[];
  checklist: ChecklistItem[];
  estimateMinutes?: number;
  reminderAt?: string;
  repeatRule?: string;
  blockedBy?: string;
  waitingOn?: string;
  links: string[];
  reviewAt?: string;
  startAt?: string;
  dueAt?: string;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

Other types (`Area`, `Project`, `AgentSession`, `ProgressEvidence`) follow PRD §6 verbatim.

### 5.2 SQLite schema

DDL lives in `server/src/db/migrations/`. Verbatim from PRD §17 with `_json` text columns for arrays. Indexes added per query pattern:

```sql
-- 001_work_items.sql
create table work_items (
  id text primary key,
  project_id text,
  area_id text,
  parent_id text,
  title text not null,
  description text,
  kind text not null,
  status text not null,
  priority text not null,
  source text not null default 'manual',
  confidence text not null default 'explicit',
  assignee text not null default 'human',
  labels_json text not null default '[]',
  checklist_json text not null default '[]',
  outcome text,
  context text,
  estimate_minutes integer,
  reminder_at text,
  repeat_rule text,
  blocked_by text,
  waiting_on text,
  links_json text not null default '[]',
  review_at text,
  start_at text,
  due_at text,
  scheduled_for text,
  created_at text not null,
  updated_at text not null,
  completed_at text
);
create index idx_work_items_status on work_items(status);
create index idx_work_items_scheduled on work_items(scheduled_for);
create index idx_work_items_project on work_items(project_id);
create index idx_work_items_area on work_items(area_id);
```

Other migrations: `002_areas.sql`, `003_work_item_sessions.sql`, `004_progress_evidence.sql`. Schemas verbatim from PRD §17.

## 6. API Surface

All routes under `/api`. JSON only. Errors normalized to `{ error: { code, message, details? } }`.

| Method + Path | Slice | Purpose |
|---|---|---|
| `GET    /api/work-items` (filter: status, area, project, scheduled_from/to) | 1 | List |
| `POST   /api/work-items` | 1 | Create (only `title` required) |
| `PATCH  /api/work-items/:id` | 1 | Partial update |
| `DELETE /api/work-items/:id` | 1 | Hard delete (use `status=dropped` for soft) |
| `POST   /api/work-items/:id/checklist` | 1 | Append checklist item |
| `PATCH  /api/work-items/:id/checklist/:itemId` | 1 | Toggle / rename |
| `POST   /api/work-items/:id/link-session` | 2 | Body: `{ provider, sessionId }` |
| `DELETE /api/work-items/:id/link-session/:provider/:sessionId` | 2 | |
| `GET    /api/areas` | 1 | |
| `POST   /api/areas` | 1 | |
| `GET    /api/overview` | 1 | Inbox count, today list, waiting list, needs-attention |
| `GET    /api/workboard` | 2 | Per-project work summary |
| `GET    /api/agent-sessions?provider=all\|claude\|codex` | 2 (claude), 3 (codex) | |
| `GET    /api/agent-sessions/:provider/:id` | 2/3 | |
| `GET    /api/agent-sessions/:provider/:id/events` | 2/3 | Transcript events |
| `GET    /api/evidence?workItemId=…` | 4 | |
| `POST   /api/evidence` | 4 | Manual note evidence |
| `POST   /api/work-items/:id/accept-completion` | 4 | Confirm completion candidate |

Request/response schemas validated with **zod** in `server/src/web/schemas.ts`. The generated zod types are re-exported as TS types for the client to import.

## 7. UI Pages

Eight top-level routes (PRD §15). For MVP, only **bold** pages are functional; rest can be empty placeholder stubs that route resolves to.

| Route | Page | Slice |
|---|---|---|
| `/` → `/overview` | **OverviewPage** | 1 |
| `/inbox` | **InboxPage** | 1 |
| `/todo` | **TodoPage** | 1 |
| `/projects` | ProjectsPage | 2 |
| `/workboard` | **WorkboardPage** | 2 |
| `/sessions` | **SessionsPage** | 2 / 3 |
| `/evidence` | **EvidencePage** | 4 |
| `/analytics` | stub | post-MVP |

Shell layout (from `interactive_product_shell.html`):
- 64px top bar: brand + nav pills + `Sync` `Capture` `New task` actions + `/` search hint.
- Per-page header: title + description + page-local controls.
- Body grid varies per page (see mockups).
- Bottom drawer (resizable, opens with tabs Timeline / Chats / Tools / Memory) — Slice 2+.

Reduced motion: respect `prefers-reduced-motion` in `tokens.css` via `@media`.

## 8. Test Strategy (Full Pyramid)

For every change, the smallest test layer that can prove the claim is required. PR-ready means **all three layers green** for affected slice.

| Layer | Where | What it tests | Run command |
|---|---|---|---|
| **Unit (domain)** | `server/src/domain/**/*.test.ts` | Pure business rules: status transitions, default field fill, evidence aggregation, progress formula | `bun test domain` |
| **Adapter unit** | `server/src/adapters/**/*.test.ts` | JSONL parsers against fixtures in `fixtures/` | `bun test adapters` |
| **API integration** | `server/src/__tests__/integration/*.int.test.ts` | Spin Hono app + temp sqlite, exercise routes end-to-end | `bun test integration` |
| **Client unit** | `client/src/**/*.test.tsx` | Component render + handler + hook | `cd client && bun test` (vitest) |
| **E2E happy path** | `client/e2e/*.spec.ts` | One golden flow per slice against real server + seeded DB | `cd client && bun run e2e` |

### 8.1 Required coverage per slice

Each slice's `Done = the slice's acceptance criteria below pass`. Coverage targets:
- Domain & adapter modules: **100% line, 95% branch** on logic functions (statements simple type aliases excluded).
- API routes: every status code path exercised at least once.
- UI: hooks 100%; pages: render + one user interaction per page minimum.

### 8.2 Test data

- SQLite tests use a fresh temp file per test (`Database(`${tmpdir}/test-${ulid}.db`)`).
- Claude/Codex parser tests load from `fixtures/` (real but redacted JSONL samples).
- E2E tests boot server on random port with a seeded DB and stubbed `CLAUDE_ROOT` / `CODEX_ROOT` pointing at `e2e/fixtures/`.

## 9. Slice Plan

Each slice is a vertical strip: schema → domain → adapter (if any) → API → UI → tests. No slice ships without all five layers and all acceptance criteria.

### Slice 1 — Inbox + Manual Todo Core

**Backend**
- Migrations `001_work_items.sql`, `002_areas.sql`.
- `domain/work-item` (repository, service, service.test): create/get/update/delete; status transition table; default-fill rules; quick-capture path.
- `domain/area` (repository, service, service.test): CRUD; default areas seeded.
- API: `/api/work-items` CRUD + checklist; `/api/areas`; `/api/overview`.
- Integration tests for `/api/work-items` (POST→PATCH→GET filter→DELETE) and `/api/overview`.

**Frontend**
- Shell with top nav + 8 stub routes.
- `OverviewPage`: metric grid (inbox count, today, active, waiting), today focus list, needs-attention list.
- `InboxPage`: review queues sidebar, captured-item table, capture form, review actions (Today / Plan / Someday / Drop).
- `TodoPage`: date-views sidebar + areas/projects filter + task table + editor panel (all fields from PRD §6.2).
- Hook + page tests: 1 capture, 1 list, 1 status change per page.
- E2E `inbox-capture.spec.ts`: type a thought → Save to Inbox → appears in Inbox table → click "Plan today" → appears in Today filter.

**Acceptance (PRD §19 Inbox + Todo)**
- Quick add a task with title only.
- Item without project survives capture → today → done.
- Reviews triage to Today / Planned / Someday / Drop.
- All form fields editable.
- Suggestions panel exists but is empty (Slice 4 fills it).

### Slice 2 — Link Existing Claude Sessions

**Backend**
- Migration `003_work_item_sessions.sql`.
- `adapters/claude/scanner.ts`: scans `~/.claude/projects/<encoded-path>/*.jsonl`; extracts session id, cwd, last activity, message/tool counts, first prompt, last assistant message. Per-file parse errors recorded, do not abort scan (PRD §11.1, §19 Claude/Codex Monitoring).
- `adapters/aggregator.ts`: deduplicates, sorts by lastActiveAt desc.
- API: `GET /api/agent-sessions?provider=claude`, `GET /api/agent-sessions/claude/:id`, `GET /api/agent-sessions/claude/:id/events`; `POST/DELETE /api/work-items/:id/link-session`; `GET /api/workboard`.
- Adapter tests against fixture jsonl. Integration test: link a session to a work item, fetch back via `/api/workboard`.

**Frontend**
- `SessionsPage`: provider filter (Claude only this slice), live sessions list, sessions table, transcript preview panel.
- `WorkboardPage`: per-project work summary rows + linked-session chips.
- `TodoPage` editor: add "linked sessions" section with chips + unlink.
- BottomDrawer with Chats tab populated for selected task.
- E2E `link-session.spec.ts`: open a task → link a fixture Claude session → drawer Chats tab shows snippet.

**Acceptance (PRD §19 Workboard + Claude)**
- Claude sessions show with provider badge and cwd-derived project.
- Failed parse records an error state for that file (visible in Sessions page as "1 source failing").
- User can link/unlink a session from the Todo editor.

### Slice 3 — Codex Session Adapter

**Backend**
- `adapters/codex/scanner.ts` + `parser.ts`: walks `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; consumes `session_meta`, `turn_context`, `event_msg`, `response_item`, tool call/output records; normalizes to `AgentSession`.
- Aggregator merges Claude + Codex.
- API extended: `provider=codex|all` works; `/api/agent-sessions/codex/:id/events` returns Codex transcript.
- Parser tests against fixtures. Integration test ensures `provider=all` returns both sources.

**Frontend**
- Sessions page: provider toggle works (All / Claude / Codex); badge colors `--claude` purple, `--codex` blue per mockup.
- Workboard: linked Codex sessions appear with Codex badge.
- BottomDrawer Chats tab handles both providers' transcript shapes.
- E2E `codex-session.spec.ts`: filter by Codex → see a Codex session → open it → events render.

**Acceptance (PRD §19 Codex)**
- Codex sessions appear with provider badge.
- A parser failure for Codex does not hide Claude sessions, and vice versa.

### Slice 4 — Progress Evidence

**Backend**
- Migration `004_progress_evidence.sql`.
- `domain/evidence/service.ts`: record evidence; aggregate per work item; compute `feature_progress` (PRD §12 formula).
- Inference hook: on session ingest, propose `completion candidate` if assistant_summary says "done" but no manual todo changed. Stored in evidence with `kind='assistant_summary'` and a `pending_acceptance` flag.
- API: `GET/POST /api/evidence`, `POST /api/work-items/:id/accept-completion`.
- Service + integration tests.

**Frontend**
- `EvidencePage`: time/type/evidence/source table + selected-source preview.
- Workboard: feature progress bars labeled "estimated" when inferred.
- Today list: "completion candidate" badge with Accept / Reject inline actions.
- E2E `progress-evidence.spec.ts`: ingest fixture session that says "task done" → candidate shows on Overview → click Accept → task status flips to `done`.

**Acceptance (PRD §19 Progress)**
- Progress not shown when no task/plan basis.
- Inferred progress labeled "estimated".
- Manual status never overwritten — completion requires explicit Accept.
- Every evidence row links to a session / plan / file source.

## 10. Status Transitions (Slice 1 service rules)

```
inbox     → planned | active | someday | dropped
planned   → active  | waiting | blocked | done | dropped
active    → waiting | blocked | done   | planned
waiting   → active  | blocked | done   | planned
blocked   → active  | waiting | dropped
someday   → planned | dropped | inbox
done      → planned  (uncomplete)
dropped   → inbox    (restore)
```

Domain service rejects invalid transitions with `INVALID_TRANSITION`. UI buttons only show valid next states.

## 11. Defaults & Conventions

- `Date.now()` is wrapped behind a `clock` interface for testability.
- IDs: ULID. Same module across server/client.
- Times: store ISO string, render via `Intl.DateTimeFormat` on client.
- Logs: stderr only (per project `mcp-stderr-convention`); structured JSON in prod, pretty in dev.
- Env (loaded by `server/src/config.ts`):
  - `PORT=4174`
  - `STASH_DB_PATH` always overrides the SQLite file path.
  - Default SQLite path:
    - macOS: `~/Library/Application Support/stash/stash.db`
    - Linux/other: `${XDG_DATA_HOME:-~/.local/share}/stash/stash.db`
  - macOS compatibility: if the legacy default
    `~/.local/share/stash/stash.db` or
    `~/Library/Application Support/stash/app.db` exists and the new macOS
    `stash.db` does not, startup keeps using the existing file. Operators can
    migrate by backing up the existing DB, copying it to
    `~/Library/Application Support/stash/stash.db`, and rerunning
    `bun run doctor --strict`, or by pinning `STASH_DB_PATH` to the existing
    file.
  - `CLAUDE_ROOT=~/.claude` (for Slice 2)
  - `CODEX_ROOT=~/.codex` (for Slice 3)
- First-run diagnostics:
  - `bun run doctor` checks Bun, the configured DB path, Claude/Codex roots, and local dev servers.
  - `bun run doctor --strict` fails on missing DB directory/file, invalid Bun, unreachable dev servers, or unreadable configured roots.

## 12. Open Decisions (defaults I'm taking unless you override)

| # | Decision | Default I'll take |
|---|---|---|
| 1 | Product name in UI | `stash` (lowercase, matches dir) |
| 2 | `Planned` label wording | `Planned` |
| 3 | Inbox review threshold (PRD §19 "older than configurable") | 7 days |
| 4 | Drag-and-drop status changes | **No** in MVP; keyboard + edit menu only |
| 5 | Inferred tasks opt-in per project | **No** in MVP; all projects accept inferred candidates pending acceptance |
| 6 | Codex parser scope | Current host sessions only (no imported snapshots) |
| 7 | Theme | One light theme using mockup tokens; dark theme deferred |
| 8 | Auth | None (localhost only) |
| 9 | Concurrent writes | Single-process; SQLite WAL mode |

If you want a different default, say so and I'll patch the spec before Slice 1.

## 13. File-by-file build order — Slice 1

(Each line = one commit, each with its own tests passing.)

1. Root scaffold: `package.json`, `tsconfig.base.json`, `.gitignore`, `README.md` (minimal).
2. `shared/`: types only — `WorkItem`, `Area`, enums, `ulid()`. No tests yet.
3. `server/`: `package.json`, `tsconfig.json`, `src/config.ts`, empty `index.ts` returning 200 OK. `bun test` runs (empty).
4. `server/src/db/connection.ts` + `migrate.ts` + `001_work_items.sql` + `002_areas.sql`. Test: opening DB + running migrations creates expected tables.
5. `server/src/domain/area/{repository,service,service.test}.ts`. CRUD + seed of default areas.
6. `server/src/domain/work-item/{repository,service,service.test}.ts`. Status transitions, quick-capture defaults, JSON column round-trip.
7. `server/src/web/routes/areas.ts` + `work-items.ts` (CRUD + checklist) + `overview.ts`. Wire in `index.ts`.
8. `server/src/__tests__/integration/work-items.int.test.ts` + `overview.int.test.ts`.
9. `client/`: Vite scaffold, tokens.css, App.tsx with router stub for 8 routes (7 empty).
10. `client/src/api/*` + `client/src/hooks/useWorkItems.ts` + `useInbox.ts` + `useOverview.ts`. Hook tests via vitest with `msw`-style fetch mock (or direct fetch stub).
11. `OverviewPage`: metric grid + today list + needs-attention. Component tests.
12. `InboxPage`: review queues sidebar + capture form + table + review actions. Component tests.
13. `TodoPage`: date filters + task table + editor (all fields). Component tests.
14. `client/e2e/inbox-capture.spec.ts` Playwright spec. Acceptance walk-through.
15. `server/fixtures/seed.ts` + `bun run seed` script for visual QA.

Each step ends with: `bun test` green in server, `bun test` green in client, `bun run build` green in client, `bun run typecheck` green everywhere.

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bun-specific APIs leak into shared types | `shared/` has zero runtime imports — types only. |
| Migrations diverge between dev and test DB | Same `migrate.ts` runs in both; tests assert tables exist after fresh migrate. |
| Claude/Codex JSONL drift breaks scan | Per-file isolation + recorded error state (PRD §11). |
| Inferred tasks silently overwrite manual ones | Service rule: `status='done'` only via `acceptCompletion()` API; ingest only writes to `progress_evidence`. |
| UI grows too busy | Mockup tokens enforce 8px radius, mono numerics, max 3 panels per row. |
| Bottom drawer overlap with editor | Drawer is sticky-bottom resizable; collapses by default; opens with explicit action. |
| 1280px squeeze | Test layout at 1280 in component tests using viewport JSDOM; manual visual check at 1280/1440/1920. |

## 15. Definition of Done — Whole MVP

1. Slice 1–4 acceptance criteria all green.
2. All test layers (unit + adapter + integration + client unit + 4 E2E) green in CI-equivalent local run.
3. PRD §19 acceptance criteria walk-through documented in `README.md` reproducible.
4. `bun test`, `bun run build`, `bun run typecheck` succeed in all packages.
5. No `// TODO` comments in shipped code (defer notes go in this SPEC or GitHub issues).
6. README explains: install, dev, test, seed, where data lives, how to point at real Claude/Codex roots.

---

End of SPEC. Approve / amend before Slice 1 starts.
