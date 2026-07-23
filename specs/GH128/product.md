# GH128 Product Spec — One local calendar time zone

Issue: #128

## Goal

stash is a single-user, single-device product. Every user-facing calendar
decision must use one explicit IANA time zone, while persisted instants remain
UTC ISO timestamps and calendar-only dates remain `YYYY-MM-DD`.

## Behavior invariants

1. **T-001** `STASH_TIME_ZONE` is the optional override. When absent, the server
   uses the host's resolved zone. The value must be `UTC` or an exact identifier
   returned by `Intl.supportedValuesOf("timeZone")`; offset-only identifiers and
   legacy aliases fail startup instead of being accepted ambiguously.
2. **T-002** The server is authoritative. A runtime metadata response exposes
   `timeZone` and the current local `calendarDate`; clients do not independently
   reinterpret server calendar data in the browser zone.
3. **T-003** `today`, `tomorrow`, named weekdays, Today/Later placement, and
   scheduling mutations are resolved by the server at request time. A client
   with stale or unavailable runtime metadata cannot fall back to its own zone.
4. **T-004** Calendar-only recurrence performs Gregorian date arithmetic without
   converting the date through a UTC instant.
5. **T-005** When a wall-clock time must become an instant, DST gaps use
   compatible forward shifting and overlaps choose the earlier matching instant.
6. **T-006** Burn daily buckets, weekday/hour heatmaps, and rolling-window
   boundaries use the configured zone. Responses separately describe the
   bounded bucket range and the totals evaluation range.
7. **T-007** Weekly Review uses ISO weeks of the configured local calendar and
   returns the same zone/range metadata; UI labels and exports use those returned
   calendar dates.
8. **T-008** Reminders remain persisted UTC instants. Any calendar-derived
   reminder instant is created through the same zoned conversion policy.
9. **T-009** Changing `STASH_TIME_ZONE` changes future interpretation and
   analytics bucketing only; it does not rewrite persisted timestamps or
   calendar-only dates.
10. **T-010** Empty data and invalid requests remain explicit. Time-zone errors
    never fall back silently to UTC.
11. **T-011** Existing Worker isolation, exact analytics totals, and performance
    budgets remain unchanged.

## Acceptance

- Asia/Shanghai and America/Los_Angeles boundary tests prove `today` on both
  sides of UTC midnight.
- DST spring gap and fall overlap tests prove the documented instant policy.
- ISO week/year, leap-year month end, and quarter boundaries are deterministic.
- Capture, recurrence, Work, Burn, Weekly, and exports share the same calendar
  primitives or server-provided metadata. Budget evaluation remains #126 and
  consumes this foundation after #128 lands.
- API and UI tests prove displayed zone/range labels match the evaluated data.
- Date-only fields (`scheduledFor`, `dueAt`, `reviewAt`, `recurrence.until`) and
  instant fields (`reminderAt`, `startAt`, created/updated/completed timestamps)
  are schema-validated and never accepted interchangeably.
- `bun run verify:ci` passes without increasing performance budgets.
