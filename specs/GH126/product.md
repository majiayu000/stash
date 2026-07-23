# GH126 Product Spec — Calendar-period budget spend

Issue: #126

## Goal

Every persisted budget must compare its cap with usage from the active
configured-zone calendar period declared by that budget: day, ISO week, month,
or quarter.

## Behavior invariants

1. A budget period is the full active half-open calendar range `[start, end)` in
   the server-authoritative IANA time zone.
2. `all` uses total cost in that period. A project-name scope uses only the
   matching project's cost in the same period. An unmatched scope is explicit
   zero usage, preserving the existing free-form scope contract.
3. Day, week, month, and quarter values are computed from one bounded backend
   aggregation, never one history scan per budget.
4. Events at `start` are included and events at `end` are excluded.
5. Empty periods return zero values with their real calendar ranges.
6. Usage Review displays the inclusive local date range and time zone beside
   every evaluated budget. It never describes a rolling 30-day estimate as a
   calendar budget period.
7. Failure to evaluate budget spend is visible; the client does not substitute
   the rolling Burn snapshot or a false zero.

## Acceptance

- Tests cover all four period ranges in a non-UTC zone, exact start/end
  timestamps, empty usage, global and project scopes, unmatched scopes, and an
  over-limit row.
- The monthly headline progress uses the active month result, not the unbounded
  rolling Burn total.
- Worker tests prove the budget request returns compact daily/project buckets,
  and service tests prove one aggregation request supplies all periods.
- Existing Burn totals, Worker isolation, heap limits, and performance budgets
  remain unchanged.
- `bun run verify:ci` passes without relaxing an assertion.

## Non-goals

- Changing the persisted free-form budget scope schema.
- Adding rolling budgets or custom date ranges.
- Changing model pricing configuration.
