# stash SPEC v0.4 - Todo Lifecycle + Weekly Review UX

Date: 2026-05-31
Status: execution spec
Builds on: `docs/SPEC_v0.2.md`, `docs/SPEC_v0.3.md`, `docs/reference/prd/PRD.md`

## 1. Product Goal

Make stash usable as a personal local-first todo workbench before it is an
agent dashboard. The base experience must let a user capture a thought, decide
what it means, work it through a clear lifecycle, review the week, and carry
useful context into the next week.

Agent sessions remain evidence. They may suggest, explain, or support progress,
but they must not silently create official todos or mark manual work complete.

## 2. First User Loop

The first usable loop is:

1. Capture a raw thought in under 5 seconds.
2. Triage it into Inbox, Today, Doing, Later, Someday, Waiting, Done, or Dropped.
3. Open the todo detail surface and edit title, notes, project, priority, dates,
   checklist, subtasks, journal, linked sessions, and recurrence.
4. Mark work done or drop it with an undo path.
5. Use the weekly review to see completed work, stale work, project movement,
   agent evidence, and next-week planning slots.

This loop is complete only when each transition is visible in the UI, persisted
to SQLite, and covered by a fresh verification command or browser test.

## 3. Core Information Architecture

Top-level workbench routes:

| Route | Surface | Role |
| --- | --- | --- |
| `/` and `/c/e` | Capture and Plan | Default daily todo board. |
| `/c/l/:workItemId` | Todo Detail | Full lifecycle editor for one todo. |
| `/c/j` | Weekly Review | Week summary, stale digest, and next-week planning. |
| `/c/k/:projectId` | Project Workbench | Project context projected from todos and evidence. |
| `/c/o?todoId=...` | Session Dispatcher | Optional agent start from a selected todo. |

The default screen stays work-focused and dense. No landing page, hero marketing,
or decorative content should appear before the usable todo board.

## 4. Todo Lifecycle

### 4.1 Status Contract

| Lifecycle stage | Stored status/fields | Meaning | Main user action |
| --- | --- | --- | --- |
| Capture | `status=inbox`, optional `rawInput` | Unprocessed thought or task. | Press `c` or submit capture row. |
| Clarify | `kind`, `title`, `description`, `labels` | The user decides what the item is. | Edit in detail or triage row. |
| Plan today | `status=planned`, `todayPinned=true`, optional `scheduledFor` | Intended for today. | Key `t`, drag to Today, or detail edit. |
| Plan later | `status=planned`, `scheduledFor`/`startAt`/`dueAt` | Real task, not for immediate action. | Drag to Later or set dates. |
| Active | `status=active` | Currently being worked by user or agent. | Drag to Doing or dispatch from todo. |
| Waiting | `status=waiting`, `waitingOn` or `blockedBy` | Cannot progress until external input. | Set waiting fields in detail. |
| Someday | `status=someday` | Intentionally parked. | Key `s` or triage action. |
| Done | `status=done`, `completedAt` | Completed by explicit user action or accepted evidence. | Done button/check action. |
| Dropped | `status=dropped` | Soft-archived, with undo path. | Key `d` or archive action. |

`planned` must not become a vague backlog. A planned item needs either a manual
decision, a date, a project/area, or a deliberate Later/Someday placement.

### 4.2 Required Todo Fields

Minimum capture:

- `title` or `rawInput`

Editable detail fields:

- title
- description / notes
- kind
- status
- priority
- area/project
- labels
- scheduled date
- start date
- due date
- reminder date
- recurrence
- checklist
- one-level subtasks
- journal entries
- linked Claude/Codex sessions
- pending evidence accept/reject

No item should require a project. Loose personal and life-admin todos must remain
valid first-class records.

The full detail editor must also expose:

- outcome / desired result
- execution context
- estimate minutes
- `scheduledFor`
- `startAt`
- `dueAt`
- `waitingOn`
- `blockedBy`
- links
- drop reason or archive note when dropping an item

### 4.3 Transition Rules

- Captured items default to Inbox unless the user explicitly chooses Today,
  Later, Someday, or Active.
- Dragging to Today sets `todayPinned=true` and keeps the item visible even if
  dates change later.
- Dragging away from Today clears `todayPinned` unless the target is also a
  today-oriented view.
- Marking recurring work done creates the next occurrence server-side before the
  UI reports success.
- Evidence can produce a completion candidate, but the user must accept it before
  the todo becomes Done.
- Dropped and delete-like actions need an undo affordance for the current session.
- Errors that prevent persistence must be visible to the user. Do not hide failed
  mutations behind optimistic UI.

## 5. Frontend Interaction Design

### 5.1 Visual Direction

The interface is a dense local workbench:

- Calm operational layout, not marketing.
- Todo board first; agent telemetry second.
- Dark and light themes must both preserve contrast and hierarchy.
- Cards are allowed for repeated rows, panels, and modals only; do not nest cards.
- Border radius stays at 8px or below.
- Use CSS variables from `client/src/workbench/styles/brand.css` and
  `client/src/themes.css`; no one-off hardcoded color systems.
- Motion is functional: capture focus, row movement, live agent state, and saved
  feedback. It must respect reduced-motion preferences.
- Prototype browser primitives such as `window.prompt`, `window.alert`, and
  `window.confirm` are acceptable only as temporary scaffolding. Merge-ready
  lifecycle flows need in-app popovers, drawers, toasts, or dialogs with visible
  error states and keyboard focus handling.
- Fixed work surfaces need responsive constraints. The 4-column board may stay
  dense on desktop, but it must degrade to fewer columns or horizontal sections
  before row text, buttons, or metadata overlap.

### 5.2 Capture and Plan Board

Current owner: `client/src/workbench/concepts/ConceptE.tsx`.

Required columns:

| Column | Contents | Empty state |
| --- | --- | --- |
| Inbox | untriaged captures and loose ideas | `Inbox empty. Press c to capture.` |
| Today | explicit today work | `Nothing planned for today.` |
| Doing | active work and live agent-linked work | `No active work.` |
| Later | future planned and someday work | `No items scheduled later.` |

Required interactions:

- Type into the capture row and press Enter to save.
- Press `c` anywhere in the workbench to open Quick Capture.
- Drag rows between Inbox, Today, Doing, and Later.
- Reorder Today rows without changing the rest of the board.
- Use `j/k` to move the focused inbox row.
- Use `t`, `n`, `s`, `d`, `0`, `1`, `2`, `3` for triage and priority.
- Use Cmd+K to search todos, projects, sessions, and actions.
- Use the smart-list toggle to inspect overdue, today-pinned, p0, waiting, and
  similar hot filters.

Implementation correctness:

- The Today column must use the canonical Today definition from
  `docs/SPEC_v0.3.md`: today-pinned, scheduled for today, overdue, or started.
  It must not require a project.
- The Inbox column must show `status=inbox` items, not every unprojected
  unfinished item.
- Keyboard Enter on a focused inbox row must open the same detail route as a
  pointer click.
- Empty states are data states, not decoration. API failure states must render
  separately from valid empty lists.

### 5.3 Todo Detail Surface

Current owner: `client/src/workbench/concepts/ConceptL.tsx`.

The detail view must answer five questions without leaving the modal:

1. What is this item?
2. What state is it in?
3. What is the next manual action?
4. What context or evidence is attached?
5. What should happen after completion?

Required layout:

- Header: title, status, priority, project/area, saved/error feedback.
- Main column: description, checklist, subtasks, journal, evidence, linked
  sessions, applicable lessons.
- Right column: dates, recurrence, labels, project/area, dispatcher entry, promote
  actions.
- Footer: done, drop/archive, split/promote, close.

Keyboard and accessibility:

- Esc closes the detail surface.
- Tab order follows header, main editing controls, right metadata controls, footer.
- Buttons must expose text labels or accessible names.
- Destructive controls must be visually distinct and undoable when practical.

### 5.4 Weekly Review / Life Review

Current owner: `client/src/workbench/concepts/ConceptJ.tsx`.

Weekly review is a personal life/work reflection surface, not only an agent cost
report. It should combine completed work, stale commitments, project movement,
and next-week planning.

Required sections:

| Section | Purpose |
| --- | --- |
| Week summary | Deterministic narrative from todos, sessions, cost, and focus hours. |
| KPI tiles | Done count, features advanced, sessions, tokens, cost, focus hours. |
| Done this week | Completed todos grouped by project/area, with unassigned group support. |
| Features advanced | Progress deltas backed by child tasks or evidence. |
| Stale digest | Inbox/planned items untouched for the configured threshold. |
| Top sessions | Agent sessions that materially contributed to the week. |
| Next week plan | Monday-Friday slots for explicit planned todos. |

Required interactions:

- Navigate previous/next ISO week.
- Export the review to Markdown.
- Open a completed or stale todo in Concept L.
- Move stale items to Today, Someday, Dropped, or keep.
- Drop or schedule next-week todos without losing the review context.

The v0.4 baseline may keep narrative deterministic. LLM-generated narrative is
out of scope unless it is opt-in and source-labeled.

Life-review framing:

- Work projects, personal areas, admin, writing, health, and learning should use
  the same todo lifecycle. The UI may group them by area, but it must not make
  non-code life work feel like second-class data.
- Weekly review should surface what was finished, what was carried, what was
  dropped, what is waiting, and which stale commitments need a decision.
- Next-week planning should create or update real todos; it must not be a visual
  scratchpad that loses changes on reload.

## 6. Backend/API Contract

The frontend lifecycle depends on these server capabilities:

| Capability | API or module |
| --- | --- |
| Capture parsed raw input | `POST /api/work-items/capture` |
| Create minimal todo | `POST /api/work-items` |
| Edit lifecycle fields | `PATCH /api/work-items/:id` |
| Fetch detail | `GET /api/work-items/:id` |
| Subtasks | `GET /api/work-items/:id/subtasks` plus child work item create/update |
| Journal | `GET/POST/DELETE /api/work-items/:id/journal` |
| Linked sessions | `GET/POST/DELETE /api/work-items/:id/sessions` |
| Pending evidence | evidence routes used by Concept L |
| Stale digest | `GET /api/work-items/stale?days=N` |
| Weekly snapshot | `GET /api/analytics/weekly?week=YYYY-WW` |

API responses must distinguish no data from load failure. Empty lists render
empty states; failed calls render visible error states.

## 7. Frontend Quality Bar

Before any Todo/lifecycle PR can merge:

- `bun run typecheck` passes.
- `bun run test:all` passes, or the blocker is documented with exact failing
  output and a follow-up PR.
- At least one Playwright path proves capture -> triage -> detail edit -> done.
- At least one Playwright path proves weekly review loads and opens a todo.
- A browser smoke check verifies desktop and narrow viewport text does not
  overlap, truncate critical labels, or resize fixed-format controls.
- The UI uses existing theme variables and does not introduce a new unrelated
  palette.
- Errors from lifecycle mutations are visible.

## 8. Merge Order For This Spec

1. Stabilize red build or missing dependency setup.
2. Merge safety fixes for P1 lifecycle/API failures.
3. Merge visible frontend error handling before adding more todo interactions.
4. Merge base Todo lifecycle interactions and tests.
5. Merge weekly review interactions and export/open-todo links.
6. Merge broader quality gates and release runbook.

If a PR touches the same frontend files as an earlier step, review and merge in
dependency order instead of stacking unrelated changes on `main`.

## 9. v0.4 Implementation Checklist

These are the first mergeable slices after this spec:

1. `ConceptE` canonical filters: Today uses the server Today contract; Inbox uses
   `status=inbox`; add focused-row Enter -> `/c/l/:workItemId`.
2. Replace prompt/alert lifecycle controls in the Todo board and detail modal
   with in-app dialogs/toasts for add, drop, link session, journal, labels, and
   subtasks.
3. Expand Concept L metadata editing for `kind`, `scheduledFor`, `startAt`,
   `outcome`, `context`, `estimateMinutes`, `waitingOn`, `blockedBy`, `links`,
   and drop reason.
4. Make Concept J operational: previous/next week, Markdown export, open todo
   links, stale triage actions, and persisted next-week planning.
5. Add one lifecycle Playwright path:
   capture -> triage -> detail edit -> done -> weekly review opens the completed
   todo.
6. Add a responsive visual smoke for desktop and narrow viewport, checking board
   columns, modal controls, and weekly-review panels for overlap.

## 10. Done When

v0.4 is done when a clean checkout can run the app, capture a todo, triage it,
edit the full lifecycle detail, finish or drop it, and review the week without
agent data being required.

Verification commands:

```sh
bun run typecheck
bun run test:all
bun run client:e2e
```

Manual browser verification:

- `/` capture and board drag/reorder.
- `/c/l/:workItemId` detail edit, journal, checklist, linked sessions, recurrence.
- `/c/j` weekly review loaded state, stale digest, next-week planner, and no-data
  states.
