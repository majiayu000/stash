# GH128 Technical Spec — Zoned calendar foundation

## Configuration and contract

Add `timeZone` to server configuration:

- source: `STASH_TIME_ZONE`;
- default: `Intl.DateTimeFormat().resolvedOptions().timeZone`;
- validation: accept `UTC` or an exact value in
  `Intl.supportedValuesOf('timeZone')`, then verify formatter construction.
  Reject offset-only identifiers (`+01:00`), legacy aliases (`US/Pacific`), and
  unknown values. The host-derived default is subject to the same check; if it
  is noncanonical, startup fails with an explicit `STASH_TIME_ZONE` instruction.

Expose `GET /api/runtime`:

```json
{
  "timeZone": "Asia/Shanghai",
  "calendarDate": "2026-07-24",
  "now": "2026-07-23T16:30:00.000Z"
}
```

`now` is diagnostic; `calendarDate` is authoritative for client calendar
labels. Clients refresh it at the next server-calendar midnight and on focus.
If refresh fails, relative mutation controls are disabled with a visible error.
They never substitute the browser's calendar date.

Relative mutations are resolved at execution time:

- WorkItem POST and PATCH accept
  `scheduledForRelative: "today" | "tomorrow"`, mutually exclusive with
  `scheduledFor`; Today-column creation sends this semantic field.
- WorkItem POST and PATCH accept
  `reminderLocalDateTime: "YYYY-MM-DDTHH:mm"`, mutually exclusive with
  `reminderAt`; the server converts it using compatible DST disambiguation and
  persists only `reminderAt`.
- capture continues to send raw relative language and resolves it server-side.
- invalid local dates/times or conflicting fields return 400; there is no UTC or
  browser-zone fallback.

## Field formats

Zod schemas and shared branded validators enforce:

| Field | Format |
| --- | --- |
| `scheduledFor`, `dueAt`, `reviewAt`, `recurrence.until` | Gregorian `YYYY-MM-DD` |
| `reminderAt`, `startAt` | ISO 8601 UTC instant ending in `Z` |
| `createdAt`, `updatedAt`, `completedAt` and other audit timestamps | ISO 8601 UTC instant ending in `Z` |

Migration 019 normalizes only legacy date fields encoded as exact UTC midnight
(`YYYY-MM-DDT00:00:00.000Z`) to `YYYY-MM-DD`. Any other noncanonical value is
reported as a blocking migration error with table, row, and field; it is never
truncated silently. Instant fields are preserved byte-for-byte when valid.
The same validation and migration cover AI Draft proposed date fields
(`proposedScheduledFor`, `proposedDueAt`) and the draft-acceptance path, so a
draft cannot reintroduce an invalid WorkItem value.

`dueAt` is an inclusive calendar deadline. It becomes overdue only when
`dueAt < runtime.calendarDate`; it is not overdue during its own local day.

## Shared calendar primitives

Create one shared module for:

- `zonedParts(instant, timeZone)`;
- `calendarDateAt(instant, timeZone)`;
- Gregorian calendar-only add/day-of-week/month/quarter helpers;
- `zonedDateTimeToInstant(parts, timeZone, "compatible")`;
- half-open day/week/month/quarter ranges.

Use one cached `Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
timeZone, year, month, day, hour, minute, second, hourCycle: 'h23'
}).formatToParts()` projection. Reject invalid Gregorian parts before lookup.
For a requested wall time:

1. form a UTC-shaped millisecond value from its numeric parts;
2. sample zone offsets at that value and at ±36 hours;
3. de-duplicate offsets and evaluate `wallMs - offset` candidates;
4. keep candidates whose projected parts exactly equal the request;
5. on overlap choose the smallest instant (earlier occurrence);
6. when none match, use the offset sampled before the transition, then require
   the projected result to equal the requested wall time shifted forward by the
   observed gap;
7. throw if no result satisfies these checks.

Tests pin:

- New York gap `2026-03-08T02:30` → `2026-03-08T07:30Z`;
- New York overlap earlier `2026-11-01T01:30` → `2026-11-01T05:30Z`;
- Lord Howe overlap earlier `2026-04-05T01:45` →
  `2026-04-04T14:45Z`;
- Lord Howe gap `2026-10-04T02:15` → `2026-10-03T15:45Z`.

Calendar-only helpers may use integer/Gregorian algorithms internally, but must
not parse `YYYY-MM-DD` with `new Date(value)` or emit it via
`toISOString().slice(0, 10)`.

## Server wiring

- `loadConfig` validates and stores `timeZone`.
- `app-factory` injects the zone and clock into runtime metadata, WorkItem
  mutations, capture, recurrence, Burn, and Weekly.
- `WorkItemService.today()` and `/api/work-items/today` compute
  `calendarDateAt(clock.now(), timeZone)` at request time; they never slice an
  instant string. Their inclusive `dueAt` comparison uses that calendar date.
- Overview computes its request-time calendar date through the injected zone;
  `now.slice(0, 10)` is prohibited.
- Burn Worker requests include `timeZone` and optional `endMs`. Existing
  `/analytics/burn?days=N` keeps its unbounded-future totals contract:
  `bucketRange=[start,end)` describes daily/hourly buckets while
  `evaluationRange=[start,null)` describes totals/model/project evaluation.
  Future bounded callers may pass `endMs` and receive the same `[start,end)`
  range for both. #126 will use that capability after this foundation lands.
  Tests preserve the existing future-event fixture.
- Weekly requests include `timeZone`; ISO week computation begins from zoned
  calendar parts, not UTC parts.
- Existing cache keys and singleflight keys include the zone wherever output
  changes by zone. Session fingerprint/metadata caches remain zone-independent.

Shared DTOs and JSON responses use:

```ts
interface CalendarRange {
  start: string;             // UTC ISO instant, inclusive
  end: string;               // UTC ISO instant, exclusive
  startDate: string;         // local YYYY-MM-DD, inclusive
  endDateExclusive: string;  // local YYYY-MM-DD, exclusive
}

interface BurnCalendarMetadata {
  timeZone: string;
  bucketRange: CalendarRange;
  evaluationRange: {
    start: string;           // UTC ISO instant, inclusive
    end: string | null;      // null preserves legacy unbounded-future totals
  };
}

interface WeeklyCalendarMetadata {
  timeZone: string;
  range: CalendarRange;
}
```

`BurnSnapshot.calendar` is required: daily buckets/hourly heatmap describe
`bucketRange`; totals/model mix/project leaderboard describe `evaluationRange`.
`WeeklySnapshot.calendar` is required and describes every weekly metric.
Field-level route tests assert ISO instants, local dates, nullability, and the
consumer-to-range mapping.

## Client wiring

- Workbench data loads `/api/runtime` with the existing shared refresh cycle.
- `adaptToWorkbenchData`, `boardFor`, lifecycle helpers, and shared Today labels
  require `runtime.calendarDate` as an explicit argument; none has a default
  based on `new Date()` or UTC. The Workbench resource stores runtime metadata
  beside domain data and passes it through every grouping/render path.
- Work/Weekly relative actions submit semantic relative mutations; runtime
  `calendarDate` is for labels and is never sent as the authority.
- Todo reminder editing sends `reminderLocalDateTime` exactly as entered and
  renders returned UTC `reminderAt` by projecting it into `runtime.timeZone`;
  `new Date(datetime-local).toISOString()` is prohibited.
- Analytics pages display the server-returned time zone and inclusive calendar
  date labels derived from the returned half-open ranges.
- Browser zone is presentation-only and cannot change server calendar meaning.
- At the server calendar's next midnight, the resource invalidates runtime and
  calendar-dependent domain reads together. Until refresh succeeds, Today/Later
  groupings and relative-create controls are replaced by a visible blocking
  calendar-refresh error; non-calendar pages may continue using cached data.

## Verification map

| Invariant | Verification |
| --- | --- |
| T-001–T-002 | config tests + runtime route integration |
| T-003 | capture parser, POST/PATCH relative scheduling, WorkItem Today route in positive/negative offsets, overview, all grouping helpers, midnight refresh failure, inclusive due-date, Work/Weekly component tests |
| T-004 | recurrence tests for leap/month/year boundaries |
| T-005 | New York gap/overlap exact-instant tests |
| T-006 | Burn unit/Worker/integration tests in Shanghai and Los Angeles, 23/25-hour days, repeated-hour accumulation |
| T-007 | Weekly ISO year boundary, cross-DST range + response/UI/export tests |
| T-008–T-010 | reminder conversion, WorkItem + AI Draft schema/migration/acceptance, two-start zone-change cache isolation, and explicit error tests |
| T-011 | existing Burn/Weekly performance and full `verify:ci` |

README and configuration documentation name the host-zone default,
`STASH_TIME_ZONE` override, persisted field formats, and the fact that changing
the zone re-buckets analytics without rewriting stored data. `doctor` prints the
canonical active zone.

## Migration and rollback

Migration 019 is reversible only by application rollback because normalized
date-only values are the intended canonical representation. It does not change
the represented calendar date. A pre-migration database backup remains required
by the existing migration runner.
