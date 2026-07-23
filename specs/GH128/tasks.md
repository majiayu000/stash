# GH128 Implementation Tasks

## SP128-T1 — Shared calendar primitives

- Owner: shared foundation
- Covers: T-003, T-004, T-005
- Files: `shared/src/calendar.ts`, exports, unit tests
- Done when: positive/negative offset, New York gap/overlap, Lord Howe
  30-minute transition, 23/25-hour days, leap/month/quarter, and ISO week
  boundaries are deterministic.

## SP128-T2 — Runtime configuration and metadata

- Owner: server platform
- Dependencies: T1
- Covers: T-001, T-002, T-010
- Files: server config, app factory, runtime route, doctor, README/config docs,
  integration tests
- Done when: default/override are explicit, invalid zones fail, and the client
  can consume authoritative `timeZone` plus `calendarDate`.

## SP128-T3 — Calendar workflows

- Owner: product workflow
- Dependencies: T1, T2
- Covers: T-003, T-004, T-008, T-009
- Files: shared WorkItem and AI Draft inputs, WorkItem/AI Draft Zod schemas and
  acceptance path, migration 019, capture, recurrence, `WorkItemService.today`
  and its route, overview, Workbench data adapter/resource, every
  lifecycle/grouping/Today label helper, Todo reminder editing, Work/Weekly
  actions
- Done when: POST and PATCH relative schedule/local reminder mutations resolve
  on the server, Today-column creation is semantic, invalid/conflicting fields
  return 400, the Today route passes positive/negative-offset boundary tests,
  every placement helper requires server `calendarDate`, failed
  midnight refresh blocks calendar groupings/controls visibly, due dates remain
  non-overdue through their local day, AI Drafts cannot bypass validation, and
  persisted instant/date formats are migrated.

## SP128-T4 — Analytics and labels

- Owner: analytics
- Dependencies: T1, T2
- Covers: T-006, T-007, T-011
- Files: shared `BurnSnapshot`/`WeeklySnapshot` DTOs, Burn
  request/worker/domain/route, Weekly domain/route, client analytics and export
  labels
- Done when: local buckets/ranges are exact, unbounded legacy totals and bounded
  callers have the specified field-level range metadata, daily/hourly versus
  totals consumers use the correct range, repeated hours aggregate correctly,
  metadata is displayed, only output-sensitive cache keys include zone, and
  existing performance budgets are unchanged. #126 budget evaluation is not
  implemented by this task.

## SP128-T5 — Full gate

- Owner: verification
- Dependencies: T1–T4
- Covers: T-001–T-011
- Verify:
  - `bun run typecheck`
  - `bun run test:all`
  - targeted Burn/Weekly performance tests
  - `bun run verify:ci`
