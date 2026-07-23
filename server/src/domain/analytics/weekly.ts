import {
  add_calendar_days,
  assert_time_zone,
  calendar_date_at,
  calendar_day_of_week,
  format_calendar_date,
  parse_calendar_date,
  range_from_dates,
  systemClock,
  zoned_parts,
  type CalendarRange,
  type Clock,
  type DoneProjectRow,
  type FeatureAdvancedRow,
  type WeeklySnapshot,
  type WoWPair,
} from '@stash/shared';
import type { AgentSourceAggregator, AggregateResult } from '../../adapters/aggregator.js';
import type { AreaService } from '../area/service.js';
import type { WorkItemService } from '../work-item/service.js';
import type { BurnService } from './burn.js';

export interface WeeklyReviewServiceDeps {
  workItemService: WorkItemService;
  areaService: AreaService;
  aggregator: AgentSourceAggregator;
  burnService: BurnService;
  clock?: Clock;
  time_zone?: string;
}

export interface WeeklyQuery {
  /** ISO week label, e.g. "2026-W19". Defaults to the clock's current week. */
  week?: string;
}

export class WeeklyReviewService {
  private readonly clock: Clock;
  private readonly time_zone: string;

  constructor(private readonly deps: WeeklyReviewServiceDeps) {
    this.clock = deps.clock ?? systemClock;
    this.time_zone = assert_time_zone(deps.time_zone ?? 'UTC');
  }

  snapshot(q: WeeklyQuery = {}, scanResult?: AggregateResult): WeeklySnapshot {
    const { startMs, endMs, label, range } = resolveWeek(q.week, this.clock, this.time_zone);
    const previous_range = range_from_dates(
      add_calendar_days(range.startDate, -7),
      range.startDate,
      this.time_zone,
    );
    const prevStartMs = Date.parse(previous_range.start);

    const { doneItems, doneByProject, featuresAdvanced } = this.collectDoneWork(startMs, endMs);
    const { sessionsByDay, focusHours, sessionsThisWeek, sessionsPrevWeek } = this.collectSessions(
      startMs,
      endMs,
      prevStartMs,
      range.startDate,
      scanResult,
    );

    const thisBurn = this.deps.burnService.totalsBetween(startMs, endMs, scanResult);
    const prevBurn = this.deps.burnService.totalsBetween(prevStartMs, startMs, scanResult);
    const tokens: WoWPair = { now: thisBurn.tokens, prev: prevBurn.tokens };
    const cost: WoWPair = { now: thisBurn.cost, prev: prevBurn.cost };
    const sessions: WoWPair = { now: sessionsThisWeek, prev: sessionsPrevWeek };

    return {
      calendar: { timeZone: this.time_zone, range },
      week: label,
      rangeStart: new Date(startMs).toISOString(),
      rangeEnd: new Date(endMs).toISOString(),
      doneCount: doneItems.length,
      focusHours,
      featuresAdvanced,
      sessionsByDay,
      donePerProject: doneByProject,
      wow: { tokens, cost, sessions },
    };
  }

  async snapshotAsync(q: WeeklyQuery = {}): Promise<{ data: WeeklySnapshot; cache: AggregateResult['cache'] }> {
    const { range } = resolveWeek(q.week, this.clock, this.time_zone);
    const prevStartMs = Date.parse(range_from_dates(
      add_calendar_days(range.startDate, -7),
      range.startDate,
      this.time_zone,
    ).start);
    const scan = await this.deps.aggregator.scanActivityAsync({ modifiedSinceMs: prevStartMs });
    if (scan.errors.length > 0) {
      const first = scan.errors[0]!;
      throw new Error(
        `weekly analytics source scan failed (${scan.errors.length}): `
        + `${first.provider}:${first.sourcePath}: ${first.message}`,
      );
    }
    return { data: this.snapshot(q, scan), cache: scan.cache };
  }

  // ─── done work-items ────────────────────────────────────────────────────

  private collectDoneWork(startMs: number, endMs: number): {
    doneItems: { id: string; areaId?: string; kind: string; title: string; completedAt?: string }[];
    doneByProject: DoneProjectRow[];
    featuresAdvanced: FeatureAdvancedRow[];
  } {
    const items = this.deps.workItemService.list({ status: 'done' });
    const within = items.filter((it) => {
      if (!it.completedAt) return false;
      const t = Date.parse(it.completedAt);
      return t >= startMs && t < endMs;
    });

    const byProject = new Map<string, number>();
    for (const it of within) {
      const key = it.areaId ?? '__unassigned__';
      byProject.set(key, (byProject.get(key) ?? 0) + 1);
    }
    const doneByProject: DoneProjectRow[] = [];
    for (const [pid, count] of byProject) {
      const name = pid === '__unassigned__' ? 'unassigned' : this.deps.areaService.get(pid)?.name ?? pid;
      doneByProject.push({ projectId: pid, projectName: name, count });
    }
    doneByProject.sort((a, b) => b.count - a.count);

    const featuresAdvanced: FeatureAdvancedRow[] = within
      .filter((it) => it.kind === 'feature' || it.kind === 'epic')
      .map((it) => ({ id: it.id, title: it.title, from: 'active', to: 'done' }));

    return { doneItems: within, doneByProject, featuresAdvanced };
  }

  // ─── sessions ───────────────────────────────────────────────────────────

  private collectSessions(
    startMs: number,
    endMs: number,
    prevStartMs: number,
    start_date: string,
    scanResult?: AggregateResult,
  ): {
    sessionsByDay: number[];
    focusHours: number;
    sessionsThisWeek: number;
    sessionsPrevWeek: number;
  } {
    const sessionsByDay = Array<number>(7).fill(0);
    const hourBuckets = new Set<string>();
    const thisSet = new Set<string>();
    const prevSet = new Set<string>();

    const { sessions } = scanResult ?? this.deps.aggregator.scan({});
    for (const s of sessions) {
      const t = Date.parse(s.lastActiveAt);
      if (Number.isNaN(t)) continue;
      if (t >= startMs && t < endMs) {
        thisSet.add(s.sourcePath);
        const session_date = calendar_date_at(t, this.time_zone);
        const dow = date_index_in_week(session_date, start_date);
        if (dow !== undefined) {
          sessionsByDay[dow] = (sessionsByDay[dow] ?? 0) + 1;
        }
      } else if (t >= prevStartMs && t < startMs) {
        prevSet.add(s.sourcePath);
      }
      if (t >= startMs) {
        // Use the usage event timestamps so focus hours reflect real engagement.
        for (const u of this.deps.aggregator.getUsageForScan(scanResult, s.provider, s.sourcePath)) {
          const ut = Date.parse(u.ts);
          if (Number.isNaN(ut) || ut < startMs || ut >= endMs) continue;
          hourBuckets.add(hourKey(ut, this.time_zone));
        }
      }
    }

    return {
      sessionsByDay,
      focusHours: hourBuckets.size,
      sessionsThisWeek: thisSet.size,
      sessionsPrevWeek: prevSet.size,
    };
  }
}

function hourKey(ms: number, time_zone: string): string {
  const local = zoned_parts(ms, time_zone);
  return `${format_calendar_date(local)}-${String(local.hour).padStart(2, '0')}`;
}

interface ResolvedWeek {
  startMs: number;
  endMs: number;
  label: string;
  range: CalendarRange;
}

export function resolveWeek(
  input: string | undefined,
  clock: Clock,
  time_zone: string,
): ResolvedWeek {
  assert_time_zone(time_zone);
  let label: string;
  if (input) {
    if (!isValidIsoWeekLabel(input)) throw new RangeError(`invalid ISO week: ${input}`);
    label = input;
  } else {
    label = iso_week_label_for_date(calendar_date_at(clock.now(), time_zone));
  }
  const match = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!match?.[1] || !match[2]) throw new RangeError(`invalid ISO week: ${label}`);
  const start_date = iso_week_start_date(Number(match[1]), Number(match[2]));
  const end_date = add_calendar_days(start_date, 7);
  const range = range_from_dates(start_date, end_date, time_zone);
  return {
    startMs: Date.parse(range.start),
    endMs: Date.parse(range.end),
    label,
    range,
  };
}

export function isValidIsoWeekLabel(input: string): boolean {
  const match = /^(\d{4})-W(\d{2})$/.exec(input);
  if (!match?.[1] || !match[2]) return false;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return false;
  return iso_week_label_for_date(iso_week_start_date(year, week)) === input;
}

/** ISO 8601 week-numbering: Monday-anchored, week 1 contains the year's first Thursday. */
function iso_week_start_date(iso_year: number, iso_week: number): string {
  const jan4 = format_calendar_date({ year: iso_year, month: 1, day: 4 });
  const jan4_monday_index = (calendar_day_of_week(jan4) + 6) % 7;
  return add_calendar_days(jan4, -jan4_monday_index + (iso_week - 1) * 7);
}

function iso_week_label_for_date(date: string): string {
  const monday_index = (calendar_day_of_week(date) + 6) % 7;
  const monday = add_calendar_days(date, -monday_index);
  const thursday = add_calendar_days(monday, 3);
  const iso_year = parse_calendar_date(thursday).year;
  const week_one = iso_week_start_date(iso_year, 1);
  for (let week = 1; week <= 53; week += 1) {
    if (add_calendar_days(week_one, (week - 1) * 7) === monday) {
      return `${iso_year}-W${String(week).padStart(2, '0')}`;
    }
  }
  throw new RangeError(`cannot resolve ISO week for ${date}`);
}

function date_index_in_week(date: string, start_date: string): number | undefined {
  for (let index = 0; index < 7; index += 1) {
    if (add_calendar_days(start_date, index) === date) return index;
  }
  return undefined;
}
