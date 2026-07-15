# stash SPEC v0.5 - Idea Decomposition + Task Coach

Date: 2026-06-17
Status: planning spec
Builds on: `docs/SPEC_v0.3.md`, `docs/SPEC_v0.4.md`

## 1. Product Goal

Turn stash from a local-first todo and agent evidence workbench into an
idea-to-execution system. A user should be able to capture a rough idea, ask
stash to decompose it into concrete tasks, review the proposed structure, work
through each task, and keep useful AI coaching notes attached to the task.

This release keeps the v0.3 and v0.4 safety model:

- no silent AI writes
- no cloud account requirement
- single user, single device
- all AI output is a proposal until the user accepts it
- original capture text is preserved
- task data remains visible and editable without AI

## 2. Source Prototypes

This spec consolidates the strongest ideas from the local todo prototypes:

| Prototype | Keep | Do not keep |
| --- | --- | --- |
| `stash` | Main product shell, SQLite, CLI capture, workbench routes, project/session/evidence linkage, work item lifecycle. | The previous page sprawl should not make the default todo loop heavier. |
| `AI/tools/todo/demo` (`Spark`) | Idea-native todo framing, AI decomposition, task-level coach chat, summarize-to-description, Chinese quick-add parsing. | Browser-only globals, localStorage as source of truth, API key in browser storage. |
| `AI/tool/rtodo` | Fast local utility expectations, explicit persistence failure handling, calm desktop-oriented todo UX. | Separate RUI app implementation. |
| `work/infra/todo` | Meeting-to-task draft inbox, human `adopt` / `reject` / `edit-adopt`, source traceability. | Team/workspace approval system in the default personal todo view. |
| `happy` lab-rat todo | Small acceptance fixture idea for agent testing. | Broken fixture behavior and intentionally limited feature set. |

## 3. Locked Decisions

1. `stash` is the integration target. No new standalone todo app is created.
2. `WorkItem` remains the canonical todo/idea entity.
3. `kind=idea` is a first-class inbox item, not a note hidden inside a task.
4. AI decomposition produces draft proposals, not committed tasks.
5. The user must review generated tasks before they become work items.
6. Task coach chat is task-scoped. It may append a summary to `description` or
   journal only after explicit user action.
7. Meeting-to-task import is a later source surface, not part of the daily board
   MVP.
8. The existing `rawInput`, `scheduledFor`, `startAt`, `dueAt`, `todayPinned`,
   `checklist`, `parentId`, and `journal` fields are reused before adding schema.

## 4. MVP User Loop

The v0.5 loop is:

1. Capture a rough idea or task from Quick Capture or CLI.
2. If the item is an idea, open detail and select `AI decompose`.
3. stash calls a server-side AI route and returns a draft plan:
   - project name or target area suggestion
   - 3-8 proposed tasks
   - optional tags, priority, and dates
   - rationale and confidence
4. User edits the draft plan in an in-app review dialog.
5. User accepts all, accepts selected tasks, or cancels.
6. Accepted tasks become `WorkItem` rows linked back to the source idea.
7. User can open any task and use task coach chat to clarify next action.
8. User can summarize the chat into task description or journal.

Done means the user can run this full loop without using browser-native
`prompt`, `alert`, or `confirm`, without losing the original idea text, and
without AI-generated tasks bypassing review.

## 5. Data Model

### 5.1 Existing Fields To Reuse

Use the current `WorkItem` model:

- `kind`: `idea` or `task`
- `status`: `inbox`, `planned`, `active`, `waiting`, `blocked`, `someday`,
  `done`, `dropped`
- `parentId`: source idea for generated tasks
- `description`: durable summary or user-authored notes
- `context` / `outcome`: optional structured task clarification
- `labels`
- `checklist`
- `links`
- `scheduledFor`, `startAt`, `dueAt`, `reminderAt`, `todayPinned`
- `rawInput`

Generated tasks should set `parentId` to the source idea when created from an
idea. The source idea remains visible until the user marks it done, planned, or
dropped.

### 5.2 New Tables

Only add schema when implementation starts. The recommended tables are:

```sql
create table ai_generation_runs (
  id text primary key,
  feature text not null check (
    feature in (
      'idea_decomposition',
      'task_coach',
      'coach_summary',
      'meeting_triage',
      'session_inferred',
      'manual_split'
    )
  ),
  source_kind text not null check (
    source_kind in (
      'idea_decomposition',
      'meeting_triage',
      'session_inferred',
      'manual_split',
      'task_coach',
      'coach_summary'
    )
  ),
  source_work_item_id text references work_items(id) on delete set null,
  source_record_id text,
  source_path text,
  provider text not null,
  model text,
  prompt_hash text not null,
  status text not null check (status in ('pending','succeeded','failed','accepted','discarded')),
  raw_response_json text,
  error text,
  created_at text not null,
  updated_at text not null,
  accepted_at text
);

create table decision_drafts (
  id text primary key,
  run_id text not null references ai_generation_runs(id) on delete cascade,
  source_kind text not null check (
    source_kind in (
      'idea_decomposition',
      'meeting_triage',
      'session_inferred',
      'manual_split'
    )
  ),
  source_work_item_id text references work_items(id) on delete set null,
  source_record_id text,
  source_path text,
  source_spans_json text not null default '[]',
  proposed_title text not null,
  proposed_description text,
  proposed_kind text not null default 'task',
  proposed_priority text not null default 'p2',
  proposed_labels_json text not null default '[]',
  proposed_scheduled_for text,
  proposed_due_at text,
  proposed_checklist_json text not null default '[]',
  sort_order real,
  status text not null check (status in ('draft','accepted','rejected','edited')),
  reject_reason text,
  created_work_item_id text references work_items(id),
  accepted_at text,
  rejected_at text,
  created_at text not null,
  updated_at text not null
);

create table work_item_coach_messages (
  id text primary key,
  work_item_id text not null references work_items(id) on delete cascade,
  run_id text references ai_generation_runs(id) on delete set null,
  role text not null check (role in ('user','assistant','system')),
  purpose text not null default 'chat' check (purpose in ('chat','summary')),
  body text not null,
  provider text,
  model text,
  created_at text not null
);

create table work_item_ai_writes (
  id text primary key,
  work_item_id text not null references work_items(id) on delete cascade,
  run_id text not null references ai_generation_runs(id) on delete restrict,
  source_message_id text references work_item_coach_messages(id) on delete set null,
  destination text not null check (destination in ('description','journal')),
  body text not null,
  created_journal_entry_id text,
  created_at text not null
);
```

Do not store API keys in the browser. Provider configuration stays server-side.
`ai_generation_runs` is the common provenance table. `decision_drafts` stores
the source fields on each draft as well as on the run so accepted/rejected rows
remain auditable even if a review surface shows a subset of one run.
Rows with `feature=task_coach` or `feature=coach_summary` are provenance-only
and do not appear in the Decision Inbox draft queue.

## 6. Server API

### 6.0 Draft And Traceability Contract

Idea decomposition, meeting import, and future session-derived suggestions must
share the same draft contract. The product name for this surface is
`Decision Inbox`.

Draft sources:

- `idea_decomposition`
- `meeting_triage`
- `session_inferred`
- `manual_split`

Every draft records:

- source kind
- source work item id or source record id
- optional source path
- optional source spans/snippets
- created run id
- status: `draft`, `accepted`, `rejected`, or `edited`
- reject reason when rejected
- accepted work item id when accepted

The review UI can be context-specific, but the safety rules are shared: a draft
is not an official todo until a user adopts or edit-adopts it.

### 6.1 Decomposition

`POST /api/work-items/:id/decompose`

Input:

```json
{
  "mode": "tasks",
  "maxTasks": 8,
  "language": "zh-CN"
}
```

Rules:

- Return `404` if the item does not exist.
- Return `409` if the item is `done` / `dropped`.
- Return `422` if title plus description are too short to decompose.
- Generate drafts only. Do not create tasks in this route.
- Persist run metadata and raw model response for audit.
- Response includes run id and editable draft records.

### 6.2 Accept Drafts

`POST /api/decomposition-runs/:runId/accept`

Input:

```json
{
  "drafts": [
    {
      "draftId": "draft_...",
      "title": "Interview 5 target users",
      "description": "Validate the core pain before building.",
      "priority": "p1",
      "labels": ["research"],
      "scheduledFor": "2026-06-18"
    }
  ],
  "sourceIdeaStatus": "planned"
}
```

Rules:

- Accepting creates `WorkItem` rows in one transaction.
- Each created task gets `parentId=source_work_item_id`.
- User-edited fields override proposal fields.
- Source idea status can become `planned`, `done`, or remain unchanged.
- Repeated accept for the same draft is idempotent and returns the existing
  created work item.

### 6.3 Task Coach

`GET /api/work-items/:id/coach/messages`

`POST /api/work-items/:id/coach/messages`

Input:

```json
{ "body": "Help me turn this into a concrete next action." }
```

Rules:

- The assistant sees task title, description, status, priority, labels, linked
  sessions summary, and the last N coach messages.
- The assistant asks concise clarifying questions or proposes next actions.
- It must not mutate the task.

### 6.4 Summarize Coach Chat

`POST /api/work-items/:id/coach/summarize`

Rules:

- Produces markdown with:
  - core goal
  - decisions made
  - risks / unknowns
  - next 3 actions
- User chooses whether to append to `description` or journal.
- The write action must be separate from summary generation.
- Summary generation creates an `ai_generation_runs` row with
  `feature=coach_summary`.
- Appending generated summary text creates a `work_item_ai_writes` audit row
  with the originating run id and destination.

## 7. Frontend UX

### 7.1 Capture And Parse

Quick Capture should keep v0.3 token support and add Spark-style Chinese date
parsing where it improves the existing parser:

- `今天`, `今晚`, `明天`, `后天`, `大后天`
- `下周`, `周一` ... `周日`
- `上午9点`, `下午3点半`, `20:30`
- `+3d`, `+2w`
- `#标签`, `^p1`, `@tag`, `*45m`

The parser must expose a preview chip set before submit. Unknown text remains in
the title and `rawInput` is preserved.

### 7.2 Idea Decomposition Dialog

Owner surface: Todo Detail for `kind=idea`.

Dialog layout:

- Header: source idea title and model/provider state.
- Left: generated project/area suggestion and rationale.
- Main: editable draft task rows.
- Per row: title, description, priority, labels, scheduled date, due date,
  checkbox to include/exclude.
- Footer: accept selected, accept all, discard.

Failure states:

- provider unavailable
- invalid JSON / schema mismatch
- timeout
- source idea no longer exists
- draft already accepted

All failures render inline in the dialog. No browser-native alert.

### 7.3 Task Coach Panel

Owner surface: Todo Detail for any `task`, `bug`, `chore`, or `research`
item.

Panel behavior:

- Shows previous coach messages.
- Starts with a compact empty state: `Ask the coach to clarify this task.`
- Input supports IME; Enter submits only when composition is not active.
- `Summarize to task` generates a draft summary.
- User chooses `append to description` or `append to journal`.

### 7.4 Meeting-To-Task Source

Defer from MVP. When implemented, add a separate source review surface:

- Import text / paste meeting notes.
- Triage agent creates draft tasks with source spans.
- User adopt/reject/edit-adopt.
- Accepted tasks enter the same `WorkItem` lifecycle.

This reuses the `work/infra/todo` workflow but must fit stash's single-user,
local-first model.

## 8. AI Safety And Provider Rules

- AI output must validate against Zod schemas before persistence.
- Invalid model output returns a visible error and stores the failed run.
- Decomposition and coach routes must have timeout controls.
- No automatic retries that create duplicate drafts.
- All accepted or appended AI outputs must record the originating run id.
- The prompt must instruct the model to produce tasks that are concrete,
  independently editable, and not over-nested.
- Sensitive task content is sent only to the configured server-side provider.
- If no provider is configured, the UI shows local-only unavailable state.

## 9. Issue Breakdown

GitHub queue:

- #64 - Spec: v0.5 idea decomposition and task coach queue
- #65 - Implement draft and traceability contract
- #66 - Add AI provider adapter for decomposition and coach prompts
- #67 - Add Spark-style parser improvements and live preview to Quick Capture
- #68 - Build Decision Inbox and idea decomposition review UI
- #69 - Build task coach panel and summarize-to-task flow
- #70 - Make weekly review actions persistent
- #71 - Add meeting-to-task source review surface
- #72 - Add end-to-end verification and product polish for v0.5

### Issue 1 (#64) - Add v0.5 planning spec and implementation queue

Scope:

- Land this spec.
- Create GitHub issues for each implementation slice.
- Ensure the issue queue references this spec without prematurely closing
  implementation work.

Acceptance:

- Spec is committed.
- Issue queue exists and each issue has acceptance criteria.
- The spec PR passes CI and has clean review-thread state before merge.

### Issue 2 (#65) - Implement draft and traceability contract

Scope:

- Add migrations for `ai_generation_runs` and `decision_drafts`.
- Add shared types and Zod schemas.
- Add domain service methods for create run, list drafts, accept drafts.
- Add idempotent draft acceptance transaction.
- Support `idea_decomposition`, `meeting_triage`, `session_inferred`, and
  `manual_split` as source kinds.
- Store `source_kind`, source record/path/spans, `reject_reason`, and accepted
  work item id on draft rows.

Acceptance:

- Unit tests cover successful run persistence, failed run persistence,
  idempotent accept, and rejected drafts.
- Created tasks have `parentId` pointing at the source idea.
- No route creates tasks before explicit accept.
- Rejected drafts keep source evidence and reject reason.

### Issue 3 (#66) - Add AI provider adapter for decomposition and coach prompts

Scope:

- Add server-side provider config.
- Add prompt builders for decomposition, coach reply, and coach summary.
- Add schema validation around model output.
- Return visible typed errors for timeout, unavailable provider, and invalid JSON.

Acceptance:

- Tests cover provider unavailable, invalid output, and valid output.
- Browser storage never contains API keys.
- Prompt snapshots or stable prompt tests cover required output shape.

### Issue 4 (#67) - Add Spark-style parser improvements and live preview to Quick Capture

Scope:

- Extend the existing capture parser with Chinese relative dates and times.
- Add parse preview payload for UI chips.
- Preserve `rawInput`.

Acceptance:

- Parser tests cover Chinese and English date/time examples.
- Unknown text remains in title.
- Existing v0.3 tokens keep working.
- IME composition does not trigger submit or shortcut handling.

### Issue 5 (#68) - Build Decision Inbox and idea decomposition review UI

Scope:

- Add `AI decompose` action on idea detail.
- Add editable draft review dialog.
- Wire accept selected/all/discard to server routes.
- Refresh board/detail after accept.
- Add compact Decision Inbox affordance for pending drafts.

Acceptance:

- E2E covers idea capture -> decompose mocked response -> edit draft -> accept
  -> tasks appear with parent link.
- UI has inline loading/error states.
- No `window.prompt`, `window.alert`, or `window.confirm`.
- Suggested tasks are visibly not official todos until accepted.

### Issue 6 (#69) - Build task coach panel and summarize-to-task flow

Scope:

- Add coach message list/input in task detail.
- Persist and reload messages.
- Add summarize flow with user-selected destination.
- Record summary generation and append provenance with `ai_generation_runs` and
  `work_item_ai_writes`.

Acceptance:

- Tests cover IME-safe Enter behavior.
- Summary generation does not write until user confirms destination.
- Appending to journal/description is visible after reload.
- Appended AI summaries are traceable to the originating run id.

### Issue 7 (#70) - Make weekly review actions persistent

Scope:

- Add previous/next week navigation with `week=YYYY-WW`.
- Add Markdown export.
- Let stale items be kept, scheduled, moved to Someday, dropped, or opened.
- Let next-week planner write real `scheduledFor` updates.

Acceptance:

- Weekly review actions persist through reload.
- Export includes completed work, stale work, and next-week plan.
- The surface does not depend on expensive session rescans for basic todo
  actions.

### Issue 8 (#71) - Add meeting-to-task source review surface

Scope:

- Port the `work/infra/todo` draft inbox model into stash.
- Import meeting text, create source-spanned drafts, and support
  adopt/reject/edit-adopt.

Acceptance:

- Source spans are shown in the review surface.
- Accepted drafts create normal `WorkItem` rows.
- High-risk or unclear drafts cannot auto-adopt.

### Issue 9 (#72) - Add end-to-end verification and product polish

Scope:

- Add Playwright coverage for the v0.5 core loop.
- Add empty states and provider-unavailable states.
- Add docs for local provider configuration and the no-silent-writes model.

Acceptance:

- `bun run verify` passes locally.
- CI `verify:ci` passes on PR.
- Manual smoke path documented in the PR.

## 10. Verification Plan

Local targeted commands:

```sh
bun run server:test
bun run client:test
bun run typecheck
```

Full gate:

```sh
bun run verify
```

CI gate:

```sh
bun run verify:ci
```

Required e2e paths before v0.5 implementation is considered complete:

1. Capture idea, parse tokens, preserve raw input.
2. Decompose idea with mocked provider response.
3. Edit generated drafts and accept selected tasks.
4. Open generated task and use coach chat.
5. Summarize coach chat and append to journal.
6. Provider unavailable state renders visibly.
7. No duplicate tasks on repeated accept.

## 11. Non-Goals

- No team accounts, cloud sync, or auth.
- No background auto-organization of todos.
- No calendar auto-scheduling.
- No nested subtasks deeper than one level.
- No direct migration of Spark's browser global architecture.
- No RUI desktop app port in v0.5.
- No meeting-to-task integration in the first MVP slice.

## 12. Done-When For This Spec

This planning spec is complete when:

- it is committed to the stash repo
- GitHub issues exist for the implementation slices above
- the PR references the issue queue without auto-closing implementation issues
- CI passes for documentation-only changes
- review-thread state is clean before merge
