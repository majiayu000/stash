# GH126 Technical Spec — Single-scan period evaluation

## API contract

Add `GET /api/analytics/budget-spend`:

```ts
interface BudgetSpendSnapshot {
  calendar: {
    timeZone: string;
    generatedAt: string;
  };
  periods: Record<BudgetPeriod, {
    range: CalendarRange;
    totals: { cost: number };
    perProject: Array<{
      projectId: string;
      projectName: string;
      cost: number;
    }>;
  }>;
}
```

The route returns `{ data, cache }`, matching the other analytics routes.
Every `range` is the complete active configured-zone calendar period. The
response contains all four periods independently of the number of budgets, so
adding budgets never adds source scans.

## Aggregation

`BurnService.budgetSpendSnapshotAsync()` computes day/week/month/quarter ranges
with `calendar_period_range(clock.now(), timeZone)`. It constructs their
smallest union and sends one bounded `BurnAggregationRequest` to the existing
Worker.

The request opts into compact daily/project buckets. `BurnAccumulator` records
`date`, `projectId`, and `cost` while it already projects each event into the
configured zone. Ordinary Burn requests return an empty internal array and do
not pay the extra map cost. The new field is Worker-internal and is not added to
`BurnSnapshot`.

The service partitions those compact rows by each period's local
`startDate <= date < endDateExclusive`, resolves project names through
`AreaService`, and returns exact global/project costs. Event timestamp
filtering remains bounded by the union's UTC instants, so boundary timestamps
are exact even across DST.

Worker response validation and singleflight keys include the new request mode.
Malformed Worker payloads still fail visibly.

## Client

`UsageReviewPage` loads the rolling Burn snapshot, persisted budgets, and one
budget-spend snapshot. Each budget row chooses `periods[budget.period]` and:

- uses `totals.cost` for case-insensitive scope `all`;
- otherwise matches a project name case-insensitively;
- returns zero only for a successfully evaluated unmatched free-form scope.

Rows display the inclusive local date range and `timeZone`. The global monthly
headline uses `periods.month.totals.cost`. A budget-spend request error is
rendered as an API error and never replaced with rolling Burn data.

## Verification map

| Invariant | Verification |
| --- | --- |
| Four configured-zone periods | Burn domain tests |
| Exact `[start,end)` boundaries | Burn domain and route integration tests |
| One aggregation for all budgets | counting executor/service test |
| Compact Worker contract | SessionScanWorker tests |
| Global/project/empty scope | service and client tests |
| Range labels and over-limit state | client component tests |
| No performance regression | existing Burn performance and `verify:ci` |
