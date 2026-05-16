# stash SPEC v0.3 — Friction Zero + AI Memory

Date: 2026-05-16
Status: actively implementing
Builds on: SPEC.md (v0.1) + docs/SPEC_v0.2.md (workbench design)

## 1. Why v0.3

v0.2 made stash *look* like a workbench. v0.3 makes it *behave* like one. Capture in <1s, triage with single keys, surface forgotten context. Synthesized from 4 parallel research dives (Things 3 / Linear / Todoist / OmniFocus UX + AI-augmented todo features + friction reduction patterns + AI-coding workflow gaps).

## 2. Locked decisions (don't relitigate)

- **No native shell.** Browser tab only. CLI provides global capture.
- **No team features.** Single user, single device.
- **No silent AI writes.** Every AI suggestion is a ghost — user accepts with one keystroke.
- **`raw_input` is always preserved** on captured items so we can re-parse later.
- **Subtasks: 1 level max.** Hard cap. No nesting beyond `parent_id`.
- **Date fields are orthogonal.** `start_at` (visibility gate) ≠ `due_at` (commitment) ≠ `remind_at` (alert) ≠ `today_pinned` (manual flag).

## 3. Scope (this release)

### 3a. Schema additions

Migration `007_todo_v3.sql`:
- `work_items.today_pinned INTEGER NOT NULL DEFAULT 0` — manual today flag, orthogonal to dates
- `work_items.sort_order REAL` — fractional ordering per view scope (NULL = use default sort)
- `work_items.recurrence_json TEXT` — `{type: 'rrule'|'after_completion', rule, offset_days?}`
- `work_items.raw_input TEXT` — original capture string with inline tokens before parsing
- (existing) `reminder_at`, `start_at`, `due_at`, `scheduled_for` retained

### 3b. Inline token parser (server-side)

`parseCaptureInput(raw: string)` returns `{title, projectId?, areaId?, tags[], priority?, dueAt?, startAt?, remindAt?}`. Tokens:
- `#project-name` → resolve to area by exact-name match (case-insensitive), set both `projectId` and `areaId`
- `@tag` → append to `labels`
- `^p0` / `^p1` / `^p2` / `^p3` → set priority
- `!today` / `!tomorrow` / `!fri` / `!next-tue` / `!2026-05-20` → set `scheduledFor` via chrono-node (loose mode)
- `!!due-tomorrow` (double-bang) → set `dueAt` (deadline, not start)
- `*1h` / `*30m` → set `estimateMinutes`
- Remaining text after tokens stripped = `title`
- `raw_input` always saved as original

### 3c. Recurrence engine (minimal viable)

Subset of RFC 5545 RRULE supported:
- `FREQ` ∈ {DAILY, WEEKLY, MONTHLY}
- `INTERVAL` (every N)
- `BYDAY` (MO,TU,WE,TH,FR,SA,SU)
- `UNTIL` (ISO date)
- `COUNT` (max occurrences)

Plus stash-specific `after_completion` mode: when item completes, next instance scheduled `offset_days` from `completed_at` (Things-style). Recurrence stored as JSON, not RRULE string.

When an item with recurrence is marked `done`, the server inserts the next occurrence preserving title/labels/recurrence and shifting dates.

### 3d. Today view canonical query

```
SELECT * FROM work_items WHERE
  status NOT IN ('done','dropped') AND (
    today_pinned = 1
    OR (start_at IS NOT NULL AND start_at <= :nowIso)
    OR (due_at IS NOT NULL AND due_at < :nowIso)
    OR scheduled_for = :today
  )
ORDER BY today_pinned DESC, COALESCE(sort_order, 0), priority, created_at
```

This replaces the looser "today" definition wherever it leaks.

### 3e. Inbox triage keyboard model

Inbox view (`/c/e` and `/c/d`) supports single-key actions on the focused row:
- `j` / `k` → next / prev row (cursor)
- `Enter` → open detail (Concept L modal)
- `t` → toggle `today_pinned`
- `s` → set status `someday`
- `n` → set status `planned` (Next/Anytime)
- `d` → set status `dropped` (soft delete) + toast w/ undo
- `e` → inline rename
- `1` / `2` / `3` / `0` → set priority p1/p2/p3/p0
- `Cmd+Z` (within session) → undo last action

### 3f. Quick Capture modal

- Triggered by `c` (anywhere in workbench) — single-line input only
- Token parser runs on submit; preview chip shows parsed structure
- `Esc` cancels, `Enter` submits, dismiss-on-blur
- After submit: toast "Captured → Inbox" with undo

### 3g. CLI: `stash add`

`tools/stash` Bun binary. Usage:
```
stash "fix login bug #aurora ^p1 !tomorrow @auth *45m"
```
- Reads `STASH_BASE_URL` env (default `http://localhost:4174`)
- POSTs to `/api/work-items/capture` with raw string
- Returns the created item's id + parsed structure (so user can confirm)
- Exit 0 on success, 1 on connection failure (server not running)

### 3h. AI-memory features (reuses Phase 3 backends, no new LLM dep)

These use **regex first, LLM optional later**:

**Failed-attempt surfacing on task start**: when user opens detail for a task, server queries `lessons` table for entries whose tags overlap with the task's labels (or projectId matches) — top 3 displayed in detail modal under "💡 Lessons that might apply".

**Decision candidates from sessions**: nightly batch (and on-demand endpoint `POST /api/decisions/extract?sessionId=X`) scans an agent session's JSONL for lines matching `(decided|chose|let's go with|going to use) <quoted thing>` and creates `confidence='pending'` decision rows. UI shows pending decisions with accept/reject.

**Stale digest**: `GET /api/analytics/stale?days=30` returns items in `inbox` or `planned` status untouched ≥ N days, optionally grouped by area. UI surfaces in Concept J (weekly review).

### 3i. Empty states (no fake data ever)

Every list view shows specific guidance when empty:
- Empty inbox → "Inbox empty. Press `c` to capture."
- Empty Today → "Nothing planned for today."
- Empty project → "No tasks yet. Press `c` to add one to this project."
- Empty lessons → "No lessons yet. Decisions captured in sessions will appear here."

### 3j. Undo toast

After destructive actions (status→dropped, delete), show 8s toast with "Undo" button. Restores previous state via reverse mutation.

## 4. Out of scope for v0.3 (intentional)

- Voice capture (Whisper) — agent 3 priority 3, defer
- Browser extension — defer
- Multi-device sync — single device assumption holds
- Native global hotkey — CLI covers this via Raycast/Alfred integration
- Daily plan generation (Motion/Sunsama-style) — defer
- Time estimate ML — defer; manual `*1h` token only
- Cost prediction per task — defer
- PR/branch auto-binding — defer
- Multi-agent dispatch — defer
- WIP snapshot — defer

## 5. Implementation plan

Numbered slices, each shippable green:

1. **Schema** — migration 007, shared types update, repo + service handles new columns
2. **Token parser** — `parseCaptureInput` pure function + tests
3. **Capture endpoint** — `POST /api/work-items/capture` taking raw string, returning parsed item
4. **CLI binary** — `tools/stash` posting to capture endpoint
5. **Today query** — service method returning canonical Today list; route uses it
6. **Triage actions** — `POST /api/work-items/:id/today-pin`, `priority/:p`, undo support
7. **Recurrence** — RRULE-lite + after_completion logic; on `done` insert next
8. **Frontend Quick Capture modal** — `c` keyboard trigger, token chip preview, toast
9. **Frontend triage shortcuts** — `j/k/t/n/s/d/e/0/1/2/3` on inbox + workboard
10. **Lessons surfacing** — detail modal pulls matching lessons
11. **Decision extraction** — regex pass on JSONL + endpoint
12. **Stale digest** — endpoint + Concept J integration
13. **Empty states + undo toast** — UI polish
14. **Tests** — service tests for parser, recurrence, today query; e2e for capture flow + triage

## 6. Done-when

- `bun run server:test` and `client:test` and `client:e2e` all green
- `bun run typecheck` clean
- Tested manually: `stash "fix #aurora ^p1 !tomorrow"` lands in inbox with right fields
- Press `c` in workbench → modal → type with tokens → see parsed chips → submit → appear in inbox
- Press `j/k` in inbox → cursor moves; press `t` → pinned to Today (verify in Today view)
- Mark a recurring item done → next instance auto-created
