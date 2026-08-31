# Stash Next — Fresh Product Surface

Status: implementation preview
Route: `/next/*`

## Decision

Build a new daily task product inside the existing repository without reusing
the current Workbench shell, navigation, themes, page components, or visual
language. Keep the current application and database intact until the new
surface is accepted. Reuse only the existing local data loader and task APIs.

## Product promise

Opening Stash Next should answer two questions without requiring drag-and-drop:

1. What should I do today?
2. What should I do next?

The default screen is `My Day`, not a dashboard. It starts from a short,
explainable recommendation set derived from existing task facts. The user can
accept the set once, then work through a calm ordered list.

## V1 information architecture

- `My Day`: accepted today items or an explainable recommendation review.
- `Inbox`: unsorted captures.
- `Planned`: dated, waiting, and someday work outside today.
- `Projects`: a quiet project index derived from task data.
- Search and settings are deferred from this preview.

Agent sessions, analytics, usage, skills, decisions, lessons, evidence, and
weekly review do not appear in the V1 navigation. They remain available in the
existing application and may return later as task-level context.

## Recommendation rules

Blocked, waiting, done, dropped, system templates, and Inbox items are excluded
from automatic daily recommendations. Remaining tasks receive deterministic
scores and visible reasons:

1. Active work: highest weight.
2. Overdue deadline or schedule.
3. Due or scheduled today.
4. Manually pinned to today.
5. P0/P1 priority.
6. Older unfinished work receives a small tie-breaking weight.

Recommend at most five tasks. Estimate the day from `estimateMinutes`, using a
30-minute fallback only for the displayed total. Never silently accept or
reorder recommendations.

## Persistence boundary

`Plan my day` applies the existing `todayPinned` and `sortOrder` fields through
the existing work-item API. Because the backend has no atomic batch endpoint,
the UI must report a partial failure explicitly and refresh the authoritative
state; it must never claim the whole plan succeeded when one write fails.

Task completion, start, removal from today, and capture also use existing APIs.
The detail drawer is a lightweight V1 editor/inspector; advanced Workbench
fields remain out of the default experience.

## Visual direction

Tone: calm desktop utility with a soft coastal-morning atmosphere. The product
uses a powder-blue sidebar, luminous sky canvas, one navy action color, white
task rows, generous spacing, and a characterful humanist display face. It must
feel friendly enough to open every morning and precise enough for daily work.

No neon, terminal chrome, metric tiles, dense kanban columns, nested cards, or
global agent telemetry. Desktop uses a stable sidebar and right detail drawer;
narrow screens use a compact top navigation and a single task column.

## Files

- `client/src/next/StashNextApp.tsx`
- `client/src/next/stash-next.styles.ts`
- `client/src/next/planning.ts`
- `client/src/next/StashNextApp.test.tsx`
- `client/src/App.tsx`
- `client/src/workbench/Workbench.tsx`
- `client/src/workbench/data.ts`

## Acceptance

- `/next` opens My Day in the new independent shell.
- A user can capture, accept recommendations, start, complete, and remove a task
  from today without visiting the old Workbench.
- Every suggested task has a visible reason.
- Inbox, Planned, and Projects are usable views of real local data.
- Mutation failures remain visible.
- Component tests, client typecheck, full client tests, and production build pass.
- Browser verification covers desktop and 390px narrow layouts.
