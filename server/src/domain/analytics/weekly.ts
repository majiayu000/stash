import {
  systemClock,
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
}

export interface WeeklyQuery {
  /** ISO week label, e.g. "2026-W19". Defaults to the clock's current week. */
  week?: string;
}

export class WeeklyReviewService {
  private readonly clock: Clock;

  constructor(private readonly deps: WeeklyReviewServiceDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  snapshot(q: WeeklyQuery = {}, scanResult?: AggregateResult): WeeklySnapshot {
    const { startMs, endMs, label } = resolveWeek(q.week, this.clock);
    const prevStartMs = startMs - 7 * 86_400_000;

    const { doneItems, doneByProject, featuresAdvanced } = this.collectDoneWork(startMs, endMs);
    const { sessionsByDay, focusHours, sessionsThisWeek, sessionsPrevWeek } = this.collectSessions(
      startMs,
      endMs,
      prevStartMs,
      scanResult,
    );

    const thisBurn = this.deps.burnService.snapshot({ days: daysSpan(startMs, endMs) }, scanResult);
    const prevBurn = this.deps.burnService.snapshot({ days: daysSpan(prevStartMs, startMs) }, scanResult);
    const tokens: WoWPair = { now: thisBurn.totals.tokens, prev: prevBurn.totals.tokens };
    const cost: WoWPair = { now: thisBurn.totals.cost, prev: prevBurn.totals.cost };
    const sessions: WoWPair = { now: sessionsThisWeek, prev: sessionsPrevWeek };

    return {
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
    const scan = await this.deps.aggregator.scanAsync({});
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
        const dow = Math.floor((t - startMs) / 86_400_000);
        if (dow >= 0 && dow < 7) {
          sessionsByDay[dow] = (sessionsByDay[dow] ?? 0) + 1;
        }
      } else if (t >= prevStartMs && t < startMs) {
        prevSet.add(s.sourcePath);
      }
      if (t >= startMs && t < endMs) {
        // Use the usage event timestamps so focus hours reflect real engagement.
        for (const u of this.deps.aggregator.getUsage(s.provider, s.sourcePath)) {
          const ut = Date.parse(u.ts);
          if (Number.isNaN(ut) || ut < startMs || ut >= endMs) continue;
          hourBuckets.add(hourKey(ut));
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

function hourKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

function daysSpan(startMs: number, endMs: number): number {
  return Math.max(1, Math.round((endMs - startMs) / 86_400_000));
}

interface ResolvedWeek { startMs: number; endMs: number; label: string }

export function resolveWeek(input: string | undefined, clock: Clock): ResolvedWeek {
  if (input) {
    const m = /^(\d{4})-W(\d{2})$/.exec(input);
    if (m && m[1] && m[2]) {
      const year = Number(m[1]);
      const week = Number(m[2]);
      const monMs = isoWeekStartMs(year, week);
      return {
        startMs: monMs,
        endMs: monMs + 7 * 86_400_000,
        label: `${year}-W${String(week).padStart(2, '0')}`,
      };
    }
  }
  const now = new Date(clock.now());
  const { year, week } = isoWeekOf(now);
  const monMs = isoWeekStartMs(year, week);
  return {
    startMs: monMs,
    endMs: monMs + 7 * 86_400_000,
    label: `${year}-W${String(week).padStart(2, '0')}`,
  };
}

/** ISO 8601 week-numbering: Monday-anchored, week 1 contains the year's first Thursday. */
function isoWeekStartMs(isoYear: number, isoWeek: number): number {
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7; // 0 = Mon
  const week1Mon = jan4 - jan4Dow * 86_400_000;
  return week1Mon + (isoWeek - 1) * 7 * 86_400_000;
}

function isoWeekOf(d: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // 0 = Mon
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // shift to Thursday of that week
  const firstThursday = Date.UTC(target.getUTCFullYear(), 0, 4);
  const firstThursdayDow = (new Date(firstThursday).getUTCDay() + 6) % 7;
  const firstThursdayDate = firstThursday - firstThursdayDow * 86_400_000 + 3 * 86_400_000;
  const week = 1 + Math.round((target.getTime() - firstThursdayDate) / (7 * 86_400_000));
  return { year: target.getUTCFullYear(), week };
}
