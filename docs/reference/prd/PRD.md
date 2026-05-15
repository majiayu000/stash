# PRD: Todo + Agent Workboard

## 1. Summary

Build a personal project-management and idea-capture system inside Claude Hub, with optional live Claude Code and Codex session monitoring as execution evidence.

The product should answer three questions in one screen:

1. What do I need to remember, decide, schedule, or do?
2. Which items belong to projects, areas, or someday/maybe?
3. For active project work, which agent sessions and evidence show real progress?

This is not only an agent monitor. Todo, Inbox, and project planning are the primary product. Agent chat/session logs are secondary evidence for execution status.

## 2. Current Context

The existing repository already has useful building blocks:

| Area | Current state |
| --- | --- |
| Sessions | `src/adapters/claude/scanner.ts`, `src/services/session.service.ts`, `src/web/api/routes/sessions.ts` parse and serve Claude Code sessions. |
| Projects | `src/web/client/src/hooks/useProjects.ts`, `ProjectCard`, `ProjectsGrid`, and `ProjectStatsBar` aggregate sessions by project. |
| Plans | `src/adapters/claude/plans/parser.ts`, `src/web/api/routes/plans.ts`, `PlansPanel`, and `PlanCard` parse Claude plan files. |
| Memory | `src/services/memory.service.ts`, `MemoryPanel`, and `MemoryCard` persist per-session recovery context. |
| Usage | `UsagePanel` tracks Claude usage and already has Codex quota support through `/api/codex/quota`. |
| Terminal | `TerminalPanel` and PTY services can become the launch/recover surface for active work. |

Important gap:

The app is still Claude-session centric. Codex currently appears mainly in quota handling. Codex chat/work records exist locally under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, but there is no first-class Codex session scanner/parser yet.

## 3. Product Goal

Create a unified personal work system that treats todo capture as the source of truth:

- Inbox captures ideas and tasks quickly, even when they do not belong to a project yet.
- Todo and Review flows turn raw ideas into scheduled tasks, someday items, or project work.
- Projects organize multi-step outcomes and track progress.
- Claude/Codex sessions show what is actually happening for active execution.
- Plans, tool calls, files touched, and memory summaries explain progress only when relevant.

## 4. Target User

Primary user: a solo technical operator running many parallel AI coding sessions across local repositories.

Typical workflow:

- Switches across multiple repos such as `mutil-om`, `infra/aip`, `remem`, `Claude-Code-Monitor`, and local tooling.
- Uses both Claude Code and Codex.
- Has many daily ideas, reminders, errands, research topics, and future possibilities that may not belong to any repo.
- Needs to know which feature is active, blocked, waiting for input, merged, stale, or forgotten.
- Wants fast capture first, then review and project execution.

## 5. Non-Goals

- No team collaboration in MVP.
- No cloud sync in MVP.
- No full Jira/Linear replacement.
- No automatic code mutation from todos in MVP.
- No hidden auto-generation of tasks without clear source labels.
- No rewriting existing Claude parser as part of the first slice.

## 6. Core Concepts

### 6.1 Project

A project is a local working directory, usually a git repository.

Fields:

```ts
type Project = {
  id: string
  name: string
  path: string
  repoRemote?: string
  branch?: string
  activeSessionCount: number
  blockedCount: number
  staleCount: number
  lastActiveAt: string
}
```

### 6.2 Work Item

A work item is the durable todo/task unit.

Fields:

```ts
type WorkItem = {
  id: string
  projectId?: string
  areaId?: string
  parentId?: string
  title: string
  description?: string
  outcome?: string
  context?: string
  kind: 'epic' | 'feature' | 'task' | 'bug' | 'chore' | 'idea' | 'research' | 'decision' | 'reminder'
  status: 'inbox' | 'planned' | 'active' | 'waiting' | 'blocked' | 'someday' | 'done' | 'dropped'
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  source: 'manual' | 'claude_plan' | 'codex_goal' | 'session_inferred'
  confidence: 'explicit' | 'inferred'
  assignee: 'human' | 'claude' | 'codex' | 'mixed'
  labels: string[]
  checklist: WorkItemChecklistItem[]
  estimateMinutes?: number
  reminderAt?: string
  repeatRule?: string
  blockedBy?: string
  waitingOn?: string
  links: string[]
  reviewAt?: string
  startAt?: string
  dueAt?: string
  scheduledFor?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

type WorkItemChecklistItem = {
  id: string
  text: string
  completed: boolean
}
```

Rules:

- Manual tasks are authoritative.
- Inferred tasks must be visually labeled as inferred.
- Agent logs can update evidence and suggested progress, but should not silently mark manual tasks done.
- `planned` is filled by the user or explicitly accepted by the user. The system must not silently decide what is next.
- `projectId` is optional. Ideas and standalone tasks can live in Inbox, an Area, or Someday without being forced into a project.
- `someday` is for valuable ideas that should not pressure today's plan.

### 6.3 Area

An area is a long-lived life/work responsibility, not a finite project.

Examples:

- AI tooling
- OM demo
- AtlasCloud infra
- Personal admin
- Writing/social
- Learning/research

Fields:

```ts
type Area = {
  id: string
  name: string
  description?: string
  activeItemCount: number
  reviewCadence: 'daily' | 'weekly' | 'monthly' | 'ad_hoc'
}
```

Rules:

- A work item can belong to an area without belonging to a project.
- Areas help sort loose ideas without inventing fake projects.
- Projects can optionally belong to an area.

### 6.4 Task Content Model

Good task apps separate capture speed from task detail. The product should support quick capture, but the full task editor needs enough fields to make tasks executable.

Field groups:

| Group | Fields | Reason |
| --- | --- | --- |
| Identity | Title, area, optional project, kind, priority, status, assignee | Lets the task appear correctly without forcing every item into a project. |
| Dates | Scheduled for, start date, due date, reminder, repeat rule | Separates when to work from when it must be done. |
| Capture | Source, raw thought, review date, someday flag | Preserves early ideas before they become executable tasks. |
| Execution | Outcome, context, checklist, estimate, links | Makes executable tasks actionable without reopening chat history. |
| Coordination | Waiting on, blocked by, linked agent session, evidence count | Tracks why work is paused and what proves progress. |
| Organization | Labels, source, confidence | Supports filtering without turning every label into a status. |

Recommended full editor layout:

```text
+--------------------------------------------------------------+
| Title                                                        |
| Area / Project(optional) / Kind / Status / Priority           |
| Scheduled for / Start date / Due date / Reminder / Repeat     |
| Capture source / Review date / Someday                        |
| Outcome / Done-when                                          |
| Context / Notes                                              |
| Checklist                                                    |
| Labels / Estimate / Waiting on / Blocked by                  |
| Linked agent sessions / Evidence / Source                    |
+--------------------------------------------------------------+
```

Rules:

- `title` can start rough in Inbox. During review, convert it into a clear verb-led task when it becomes actionable.
- `outcome` answers "what proves this is done?"
- `context` stores why the task exists and links to useful background.
- `scheduledFor` is the planning date; `dueAt` is the deadline.
- `checklist` is for small steps inside one task. Larger work should become child tasks.
- `blockedBy` and `waitingOn` must be explicit text, not inferred silently.
- Agent suggestions may prefill fields, but the user must accept them before they become official task data.

### 6.5 Agent Session

A normalized session from Claude Code or Codex.

```ts
type AgentSession = {
  id: string
  provider: 'claude' | 'codex'
  sourcePath: string
  cwd: string
  projectId?: string
  linkedWorkItemId?: string
  status: 'running' | 'waiting' | 'idle' | 'lost' | 'completed'
  title: string
  initialPrompt?: string
  lastMessage?: string
  lastTool?: string
  lastToolInput?: string
  filesTouched: string[]
  toolCount: number
  messageCount: number
  startedAt?: string
  lastActiveAt: string
}
```

### 6.6 Progress Evidence

Every progress claim should be traceable to one or more evidence records.

```ts
type ProgressEvidence = {
  id: string
  workItemId: string
  sessionId?: string
  provider?: 'claude' | 'codex'
  kind: 'plan_task' | 'tool_call' | 'assistant_summary' | 'file_change' | 'manual_note'
  text: string
  sourcePath?: string
  timestamp: string
}
```

## 7. Dedicated Todo Page

The Todo page is the source of truth for task entry and planning. Workboard is only a dashboard projection.

Primary layout:

```text
+----------------------------------------------------------------------------+
| Todo | New task | Today | This week | All | Search | Project/status filter |
+---------------+-----------------------------------------------+------------+
| Filters       | Dated task table                              | Editor     |
|               |                                               |            |
| Inbox         | Today                                         | Title      |
| Today         | Tomorrow                                      | Project    |
| This week     | Later / unscheduled                           | Status     |
| No date       |                                               | Priority   |
| Waiting       | Rows show project, status, priority, dates,   | Dates      |
| Done          | linked agent sessions, and evidence count      | Notes      |
+---------------+-----------------------------------------------+------------+
```

Required date fields:

| Field | Meaning |
| --- | --- |
| `scheduledFor` | The day the user intends to work on it. |
| `startAt` | Optional earliest start date. |
| `dueAt` | Deadline or expected completion date. |

Todo page requirements:

- User can create a task without linking any agent session.
- User can create an idea without choosing a project.
- User can send raw thoughts to Inbox with only a title/body.
- User can classify an item as Task, Idea, Research, Decision, Reminder, or Someday.
- User can assign project, status, priority, scheduled date, due date, and notes.
- Tasks can be grouped by `Today`, `Tomorrow`, `This week`, `Later`, and `No date`.
- `planned` tasks are manually entered or manually accepted from suggestions.
- Agent-derived candidates appear in a separate `Suggestions` area and do not become real todos until accepted.
- Workboard reads from this todo database and should not be the only place to manage todos.

## 8. Inbox And Review

Inbox is the primary capture surface for daily thoughts.

Capture rules:

- Minimal capture requires only text.
- Captured items default to `status=inbox`, no project, no due date.
- The user can optionally add an area, label, priority, or rough note during capture.
- The system may suggest project/area/date from context, but must label it as a suggestion.

Review actions:

| Action | Meaning |
| --- | --- |
| Do today | Convert to scheduled task for today. |
| Plan | Convert to planned task with area/project and optional date. |
| Someday | Keep idea without schedule pressure. |
| Make project | Promote idea into a project with child tasks. |
| Link to project | Attach to an existing project. |
| Drop | Archive with optional reason. |

Inbox views:

- `Inbox`: untriaged capture.
- `Today`: scheduled for today.
- `Upcoming`: dated future work.
- `Someday`: useful but intentionally not scheduled.
- `Areas`: loose work grouped by life/work responsibility.
- `Projects`: finite multi-step outcomes.
- `Waiting`: items needing someone/something else.
- `Review`: items with `reviewAt` due.

## 9. Default Screen: Overview

The default view should be a personal command dashboard, not a full execution dashboard.

Layout:

```text
+----------------------------------------------------------------------------+
| Header: Overview | Capture | New task | Search | Review | Status         |
+---------------+-----------------------------------------------+------------+
| Inbox rail    | Today plan                                    | Now panel  |
|               |                                               |            |
| Inbox         | Tasks grouped by Today / Waiting / Planned    | Active     |
| Today         |                                               | focus      |
| Someday       | Project cards only where relevant             |            |
| Review        |                                               | Agent      |
| Areas         |                                               | signals    |
+---------------+-----------------------------------------------+------------+
| Bottom drawer: selected item detail / project evidence / agent context      |
+----------------------------------------------------------------------------+
```

### 9.1 Inbox Rail

Purpose: fast navigation across capture and planning views.

Content:

- Inbox count
- Today count
- Upcoming count
- Someday count
- Waiting count
- Review count
- Area/project shortcuts

Behavior:

- Click filters the Today plan and item list.
- Keyboard arrow navigation.
- Items without projects remain visible.

### 9.2 Today Plan

Purpose: one-glance daily management.

Sections are:

| Section | Meaning |
| --- | --- |
| Capture | Fresh ideas that need triage. |
| Today | Things the user intends to do today. |
| Waiting | Items blocked by people, CI, review, deploy, logs, or decisions. |
| Planned | Explicit future work, optionally scheduled by date. |
| Someday | Ideas intentionally parked for later. |

Each item shows:

- Title or raw thought.
- Area/project if set.
- Status, priority, and date.
- Whether it has linked agent evidence.
- Review age for stale inbox items.

### 9.3 Now Panel

Purpose: answer "what am I doing right now?"

Sections:

- Current manual focus: one pinned todo.
- Running sessions: Claude/Codex sessions active in the last N minutes, secondary to todo focus.
- Waiting for me: sessions in `waiting`, blocked todos, or failed/lost sessions.
- Recent completions: tasks completed today.

### 9.4 Project Workboard Page

Project Workboard is a separate page for execution status.

Purpose:

- Show finite projects and feature progress.
- Link project tasks to Claude/Codex sessions.
- Surface blockers, stale agent sessions, and missing evidence.

It should not be the only place to enter todos.

### 9.5 Bottom Drawer

Purpose: inspect detail without losing board context.

Tabs:

- `Timeline`: task events, status changes, plan task updates.
- `Chats`: linked Claude/Codex conversation snippets.
- `Tools`: tool calls, files touched, command output summaries.
- `Memory`: recovered context and durable notes.

## 10. Todo Entry Requirements

### 10.1 Quick Add

Required fields:

- title

Optional fields at capture time:

- area
- project
- priority
- status
- scheduled date
- parent feature
- start date
- due date
- notes
- link to active session

Acceptance:

- User can add a task in under 5 seconds using keyboard.
- User can add an idea in under 3 seconds with only free text.
- If a project or area is selected, it is prefilled.
- Newly added items appear in `Inbox` unless the user explicitly chooses `Today`, `Planned`, or `Someday`.

### 10.2 Task Editing

User can:

- Rename task.
- Change status.
- Change priority.
- Change scheduled date, start date, and due date.
- Link/unlink sessions.
- Add manual note.
- Mark done.
- Drop task with reason.

### 10.3 Task Hierarchy

Support two levels for MVP:

- Feature
- Task

Do not build arbitrary nested trees in MVP. Most project management value comes from seeing feature progress clearly, not from creating deep structure.

### 10.4 Status Rules

| Status | Rule |
| --- | --- |
| Inbox | Captured but not triaged. |
| Planned | User has intentionally put it into the plan, with or without a date. |
| Active | Has active manual focus or linked running session. |
| Waiting | Needs user input, CI, review, deploy, or external dependency. |
| Blocked | Cannot proceed without a concrete unblocker. |
| Someday | Worth keeping, intentionally not scheduled. |
| Done | Completed and verified. |
| Dropped | Deliberately abandoned. |

## 11. Session Monitoring Requirements

### 11.1 Claude Source

Use existing Claude source paths:

- `~/.claude/projects/*/*.jsonl`
- `~/.claude/plans/*`

Reuse existing parser, scanner, plan parser, and memory services.

### 11.2 Codex Source

Add a new adapter instead of modifying Claude-specific parser code.

Source:

- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`

Codex fields observed locally:

- `session_meta.payload.id`
- `session_meta.payload.cwd`
- `session_meta.payload.originator`
- `session_meta.payload.cli_version`
- `turn_context`
- `event_msg`
- `response_item`
- tool call and tool output records

Proposed files:

```text
src/adapters/codex/
  scanner.ts
  parser/jsonl.ts
  types.ts
  index.ts
```

Normalized output should match `AgentSession`, not Claude-specific `ParsedSessionData`.

### 11.3 Provider Abstraction

Introduce a thin common source interface:

```ts
type AgentSource = {
  provider: 'claude' | 'codex'
  scan(options: ScanOptions): Promise<AgentSession[]>
}
```

Then update the aggregation layer:

```text
Claude scanner \
                +-- agent session aggregator -- projects / workboard / sessions API
Codex scanner  /
```

This keeps provider-specific parsing isolated while allowing the UI to show both sources.

## 12. Progress Model

Progress should be explicit first and inferred second.

Progress score:

```text
feature_progress =
  60% explicit child task completion
  25% linked plan task completion
  15% recent verified evidence
```

Rules:

- If no explicit tasks exist, show "No task breakdown" instead of fake progress.
- If progress is inferred only, render it as "estimated".
- If a session says work is done but no todo or plan changed, show "completion candidate" for user confirmation.

## 13. UI Design Direction

Use a dense, work-focused dashboard style:

- restrained dark/light themes using existing theme infrastructure
- small headings, compact rows, and scannable badges
- 8px max card radius
- no landing page
- no decorative hero
- no nested cards
- no full-screen animated backgrounds in the work surface
- charts and motion should support comprehension, not decoration

Recommended visual language:

- Left sidebar: persistent Todo navigation with Inbox, Today, Upcoming, Someday, Waiting, All active, and Area shortcuts.
- Main matrix: table-like task list with density first.
- Right detail panel: fixed-width editor for the selected task.
- Bottom drawer: resizable inspector.

For the first Todo slice, use a sidebar layout instead of top tabs. Top navigation should stay minimal and should not compete with the Todo capture/review workflow.

## 14. ReactBits Usage

ReactBits should be used as a motion and interaction layer, not as the whole design system.

Good candidates:

| ReactBits component | Use |
| --- | --- |
| Animated List | Activity feed, session event list, recent completions. |
| Chroma Card or Depth Card | Highlight the one current focus card or critical blocked project. |
| Simple Graph | Small activity/cost/progress sparkline inside project detail. |
| Modal Cards | Project detail or task detail expansion if drawer is not enough. |
| Hover Preview | Preview transcript snippets or evidence without opening the drawer. |
| Draggable Grid | Optional future custom board layout, not MVP default. |
| Staggered Text / Blur Highlight | Empty states and onboarding hints only. |

Avoid in MVP:

- custom cursor effects
- heavy shader backgrounds
- full-screen 3D scenes
- flashy text animations in dense data views
- parallax cards for core task management

Integration preference:

- Use TypeScript + CSS or TypeScript + Tailwind variant depending on final client styling direction.
- Prefer copy-owned components so they can be tuned to the existing theme tokens.
- Keep ReactBits effects behind `prefers-reduced-motion`.

## 15. Navigation

Proposed top-level tabs:

| Tab | Purpose |
| --- | --- |
| Overview | Today-level command view: inbox pressure, current focus, waiting items, daily load, and major alerts. |
| Inbox | Fast capture and triage for loose ideas, reminders, someday items, and unassigned tasks. |
| Todo | Dedicated task entry, dated planning, editing, and triage surface. |
| Projects | Project inventory, feature progress, health, and execution status. |
| Workboard | Optional project + agent execution dashboard projected from todos and sessions. |
| Sessions | Raw Claude/Codex sessions list, with provider filter. |
| Plans | Claude/Codex plan/task artifacts. |
| Memory | Durable session memory and recovery context. |
| Analytics | Usage, quotas, cost, and activity trends. |
| Terminal | Launch/recover active sessions. |

Existing tabs can stay, but `Overview` should be the default once MVP is ready.

For the basic Todo MVP, use a left sidebar as the primary navigation. Inbox, Today, Upcoming, Someday, Waiting, All active, and Areas should be visible in the sidebar before any agent-monitoring page.

Main page ownership:

| Page | Owns | Does not own |
| --- | --- | --- |
| Overview | Daily command summary, inbox pressure, and alerts. | Deep editing of every task. |
| Inbox | Raw capture, idea parking, review actions, someday handling. | Project execution analytics. |
| Todo | Task creation, dates, status, priority, notes, and accepting suggestions. | Agent transcript browsing. |
| Projects | Feature/project progress, health, blockers, review timing. | Raw task entry for every task. |
| Sessions | Claude/Codex session inventory, provider status, transcript preview. | Deciding task priority. |
| Evidence | Traceability across chat, tool calls, files, plans, and manual notes. | Changing task truth silently. |
| Analytics | Usage, quota, cost, activity trends. | Project execution state. |

## 16. API Requirements

### 16.1 Work Items

```text
GET    /api/work-items
POST   /api/work-items
PATCH  /api/work-items/:id
DELETE /api/work-items/:id
POST   /api/work-items/:id/link-session
DELETE /api/work-items/:id/link-session/:sessionId
```

### 16.2 Workboard

```text
GET /api/workboard
```

Response shape:

```ts
type WorkboardResponse = {
  projects: ProjectWorkSummary[]
  now: NowSummary
  stale: StaleWorkSummary[]
  waiting: WaitingItem[]
}
```

### 16.3 Agent Sessions

```text
GET /api/agent-sessions?provider=claude|codex|all
GET /api/agent-sessions/:id
GET /api/agent-sessions/:id/events
```

Existing `/api/sessions` can remain for backward compatibility. New UI should prefer the provider-neutral endpoint when both sources are enabled.

## 17. Persistence

Add SQLite tables:

```sql
work_items(
  id text primary key,
  project_id text,
  area_id text,
  parent_id text,
  title text not null,
  description text,
  kind text not null,
  status text not null,
  priority text not null,
  source text not null,
  confidence text not null,
  assignee text not null,
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
)
```

```sql
areas(
  id text primary key,
  name text not null,
  description text,
  review_cadence text not null,
  created_at text not null,
  updated_at text not null
)
```

```sql
work_item_sessions(
  work_item_id text not null,
  provider text not null,
  session_id text not null,
  linked_at text not null,
  primary key (work_item_id, provider, session_id)
)
```

```sql
progress_evidence(
  id text primary key,
  work_item_id text not null,
  provider text,
  session_id text,
  kind text not null,
  text text not null,
  source_path text,
  timestamp text not null
)
```

Project identity can initially be derived from paths. Add a persisted `projects` table only when user-defined aliases, pins, or archived projects are needed.

## 18. MVP Scope

MVP should ship in four vertical slices:

### Slice 1: Inbox And Manual Todo Core

- Add `work_items` persistence.
- Add optional `areas` persistence.
- Add CRUD API.
- Add fast capture flow where only title/body is required.
- Add dedicated Todo page with dated planning and task editor.
- Add Inbox/Review/Someday views.
- Add a basic Overview projection from manual tasks only.

### Slice 2: Link Existing Claude Sessions

- Reuse current sessions and projects aggregation.
- Allow user to link a session to a work item.
- Show linked session chips and last evidence in Workboard.

### Slice 3: Codex Session Adapter

- Parse `~/.codex/sessions/**/rollout-*.jsonl`.
- Normalize Codex records to `AgentSession`.
- Add provider filter and provider badges.
- Show Codex chats in selected task/project drawer.

### Slice 4: Progress Evidence

- Store evidence generated from plan tasks, session summaries, tool calls, and manual notes.
- Show feature progress and stale/waiting indicators.
- Add confirmation flow for inferred completion candidates.

## 19. Acceptance Criteria

### Inbox

- User can capture an item with only text.
- User can leave an item unassigned to any project.
- User can classify captured items as task, idea, research, decision, reminder, or someday.
- User can triage an item to Today, Planned, Someday, Project, Area, or Dropped.
- Inbox items older than a configurable threshold surface in Review.

### Todo

- User can add and edit tasks on a dedicated Todo page.
- User can set project, kind, status, priority, labels, scheduled date, start date, due date, reminder, repeat rule, and notes.
- User can add outcome/done-when text, execution context, checklist items, estimate, links, waiting-on, and blocked-by fields.
- User can view tasks grouped by Today, This week, Later, No date, Waiting, and Done.
- Agent suggestions do not become formal todos until the user accepts them.

### Workboard

- User can see active project execution status without leaving the project/workboard pages.
- User can open linked todo items from Workboard and edit them in the Todo/detail surface.
- User can filter by project, status, provider, and priority.
- User can tell which project has waiting or blocked work without opening a transcript.

### Claude/Codex Monitoring

- Claude sessions continue to display as they do today.
- Codex sessions from `~/.codex/sessions` appear with provider badge and cwd-derived project.
- Provider-specific parsing errors do not break the whole dashboard.
- A failed parser records an error state instead of silently hiding a source.

### Progress

- Progress is not shown when there is no task/plan basis.
- Inferred progress is clearly labeled.
- Manual status is not overwritten by inferred agent status.
- Every shown evidence item links back to a session, plan, manual note, or file source.

### UX

- Quick add works without mouse.
- Dashboard remains readable at 1440px desktop width.
- No overlapping text at 1280px desktop and tablet width.
- Motion respects reduced-motion settings.

## 20. Risks

| Risk | Mitigation |
| --- | --- |
| Inferred task status lies. | Keep inferred states separate and require confirmation for completion. |
| Codex and Claude JSONL schemas drift. | Provider-specific parsers, parser tests with local fixtures, error reporting per source. |
| Dashboard becomes too busy. | Default to Work Matrix + Now Panel; move transcript/tool detail into drawer. |
| ReactBits motion hurts density. | Use only targeted micro-interactions; avoid heavy shader/cursor components. |
| Project grouping by basename collides. | Store full path as identity; show basename as display name. |
| `planned` becomes vague like a generic backlog. | Require manual entry or explicit acceptance, and make dates first-class on the Todo page. |
| Every idea gets forced into fake projects. | Make project optional and introduce Areas/Someday/Inbox as first-class concepts. |

## 21. Open Decisions

1. Product name inside UI: `Workboard`, `Mission Control`, or `Tasker`.
2. Whether to rename the package/UI from Claude Hub to a provider-neutral name before adding Codex.
3. Whether Codex parser should ingest only current host sessions or also imported/snapshot sessions.
4. Whether the planned status label should be `Planned`, `Ready`, or `Queue`.
5. Whether Inbox review should stay as a full top-level page or become a split view inside Todo after MVP.
6. Whether to support drag-and-drop task status changes in MVP or keep keyboard/edit-menu first.
7. Whether inferred tasks should be opt-in per project.

## 22. Recommended First Implementation

Start with `Inbox`, `Todo`, and `Overview` as new tabs and keep existing tabs untouched.

First code slice:

```text
src/domain/work-item/
src/infrastructure/database/migrations/005_work_items.ts
src/web/api/routes/inbox.ts
src/web/api/routes/work-items.ts
src/web/api/routes/overview.ts
src/web/client/src/components/InboxPage/
src/web/client/src/components/TodoPage/
src/web/client/src/components/OverviewPage/
src/web/client/src/hooks/useWorkItems.ts
src/web/client/src/hooks/useInbox.ts
src/web/client/src/hooks/useOverview.ts
```

Do not start with Codex parsing. The dedicated todo layer should be stable first, because it becomes the anchor that both Claude and Codex sessions attach to.

## 23. References

- Existing project view design: `docs/PROJECTS_VIEW_DESIGN.md`
- Existing implementation roadmap: `docs/IMPLEMENTATION_PLAN.md`
- Existing Claude scanner: `src/adapters/claude/scanner.ts`
- Existing Claude JSONL parser: `src/adapters/claude/parser/jsonl.ts`
- Existing Work/Project hooks: `src/web/client/src/hooks/useProjects.ts`
- ReactBits: https://reactbits.dev
- ReactBits repository: https://github.com/DavidHDev/react-bits
