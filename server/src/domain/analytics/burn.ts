import {
  add_calendar_days,
  assert_time_zone,
  calendar_date_at,
  calendar_day_of_week,
  DEFAULT_MODEL_RATES,
  eventCost,
  format_calendar_date,
  type AgentSession,
  type BurnSnapshot,
  type Clock,
  type DailySpendBucket,
  type ModelRate,
  type UsageEvent,
  range_from_dates,
  systemClock,
  zoned_parts,
} from '@stash/shared';
import type {
  AgentSourceAggregator,
  AggregateResult,
  AggregateScanCacheStats,
} from '../../adapters/aggregator.js';
import type { AreaService } from '../area/service.js';

export interface BurnServiceDeps {
  aggregator: AgentSourceAggregator;
  areaService: AreaService;
  clock?: Clock;
  rates?: ModelRate[];
  time_zone?: string;
}

export interface BurnQuery {
  days?: number;
  endMs?: number;
}

export interface BurnAggregationRequest {
  startMs: number;
  bucketEndMs: number;
  endMs?: number;
  startDate: string;
  endDateExclusive: string;
  timeZone: string;
  days: number;
  rates: ModelRate[];
}

interface CompactModelBurn {
  model: string;
  tokens: number;
  cost: number;
}

interface CompactProjectBurn {
  projectId: string;
  tokens: number;
  cost: number;
  sessions: number;
}

export interface BurnAggregate {
  calendar: BurnSnapshot['calendar'];
  totals: BurnSnapshot['totals'];
  dailySpend: DailySpendBucket[];
  hourlyHeatmap: number[][];
  modelMix: CompactModelBurn[];
  perProjectLeaderboard: CompactProjectBurn[];
  cache: AggregateScanCacheStats;
}

interface MutableProjectBurn {
  tokens: number;
  cost: number;
  sources: Set<string>;
}

export class BurnService {
  private readonly aggregator: AgentSourceAggregator;
  private readonly areaService: AreaService;
  private readonly clock: Clock;
  private readonly rates: ModelRate[];
  private readonly time_zone: string;

  constructor(deps: BurnServiceDeps) {
    this.aggregator = deps.aggregator;
    this.areaService = deps.areaService;
    this.clock = deps.clock ?? systemClock;
    this.rates = deps.rates ?? DEFAULT_MODEL_RATES;
    this.time_zone = assert_time_zone(deps.time_zone ?? 'UTC');
  }

  snapshot(q: BurnQuery = {}, scanResult?: AggregateResult): BurnSnapshot {
    const request = this.rollingRequest(q);
    const scan = scanResult ?? this.aggregator.scan({});
    return this.finalize(aggregateBurnFromScan(this.aggregator, scan, request));
  }

  async snapshotAsync(
    q: BurnQuery = {},
  ): Promise<{ data: BurnSnapshot; cache: AggregateScanCacheStats }> {
    const aggregate = await this.aggregator.aggregateBurnAsync(this.rollingRequest(q));
    return { data: this.finalize(aggregate), cache: aggregate.cache };
  }

  /**
   * Exact totals for a caller-supplied half-open time range. Weekly analytics
   * uses this instead of the rolling `days` query so adjacent ISO weeks do not
   * accidentally resolve to the same clock-relative window.
   */
  totalsBetween(
    startMs: number,
    endMs: number,
    scanResult?: AggregateResult,
  ): BurnSnapshot['totals'] {
    const scan = scanResult ?? this.aggregator.scan({});
    return aggregateBurnFromScan(this.aggregator, scan, {
      startMs,
      bucketEndMs: endMs,
      endMs,
      startDate: calendar_date_at(startMs, this.time_zone),
      endDateExclusive: calendar_date_at(endMs, this.time_zone),
      timeZone: this.time_zone,
      days: 1,
      rates: this.rates,
    }).totals;
  }

  private rollingRequest(q: BurnQuery): BurnAggregationRequest {
    const days = clampDays(q.days);
    const current_date = calendar_date_at(this.clock.now(), this.time_zone);
    const start_date = add_calendar_days(current_date, -(days - 1));
    const end_date_exclusive = add_calendar_days(current_date, 1);
    const bucket_range = range_from_dates(start_date, end_date_exclusive, this.time_zone);
    const requested_end = valid_end_ms(q.endMs);
    if (requested_end !== undefined && requested_end <= Date.parse(bucket_range.start)) {
      throw new RangeError('endMs must be after the burn range start');
    }
    return {
      startMs: Date.parse(bucket_range.start),
      bucketEndMs: requested_end ?? Date.parse(bucket_range.end),
      endMs: requested_end,
      startDate: start_date,
      endDateExclusive: requested_end === undefined
        ? end_date_exclusive
        : calendar_date_at(requested_end, this.time_zone),
      timeZone: this.time_zone,
      days,
      rates: this.rates,
    };
  }

  private finalize(aggregate: BurnAggregate): BurnSnapshot {
    const totalTokens = aggregate.totals.tokens;
    return {
      calendar: aggregate.calendar,
      totals: aggregate.totals,
      dailySpend: aggregate.dailySpend,
      hourlyHeatmap: aggregate.hourlyHeatmap,
      modelMix: aggregate.modelMix.map((item) => ({
        ...item,
        share: totalTokens > 0 ? item.tokens / totalTokens : 0,
      })),
      perProjectLeaderboard: aggregate.perProjectLeaderboard.map((item) => ({
        ...item,
        projectName: item.projectId === '__unlinked__'
          ? 'unlinked'
          : this.areaService.get(item.projectId)?.name ?? item.projectId,
        share: totalTokens > 0 ? item.tokens / totalTokens : 0,
      })),
    };
  }
}

/**
 * Shared bounded aggregation path used by the Worker and synchronous tests.
 * At most one session's usage array is retained by the caller at a time.
 */
export function aggregateBurnFromScan(
  aggregator: AgentSourceAggregator,
  scan: AggregateResult,
  request: BurnAggregationRequest,
): BurnAggregate {
  if (scan.errors.length > 0) {
    const details = scan.errors
      .map((error) => `${error.provider}:${error.sourcePath}: ${error.message}`)
      .join('; ');
    throw new Error(`burn metadata scan failed: ${details}`);
  }

  const accumulator = new BurnAccumulator(request);
  for (const session of scan.sessions) {
    const lastActiveMs = Date.parse(session.lastActiveAt);
    if (!Number.isNaN(lastActiveMs) && lastActiveMs < request.startMs) continue;
    accumulator.addSession(
      session,
      aggregator.getUsageForScan(scan, session.provider, session.sourcePath),
    );
  }
  return accumulator.finish(scan.cache);
}

class BurnAccumulator {
  private readonly totals = { tokens: 0, cost: 0, sessions: 0 };
  private readonly dailySpend: DailySpendBucket[];
  private readonly hourlyHeatmap: number[][] =
    Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  private readonly models = new Map<string, { tokens: number; cost: number }>();
  private readonly projects = new Map<string, MutableProjectBurn>();
  private readonly sources = new Set<string>();
  private readonly daily_index_by_date: Map<string, number>;

  constructor(private readonly request: BurnAggregationRequest) {
    this.dailySpend = Array.from({ length: request.days }, (_, index) => ({
      date: add_calendar_days(request.startDate, index),
      tokens: 0,
      cost: 0,
    }));
    this.daily_index_by_date = new Map(
      this.dailySpend.map((bucket, index) => [bucket.date, index]),
    );
  }

  addSession(session: AgentSession, usage: UsageEvent[]): void {
    for (const event of usage) {
      const eventMs = Date.parse(event.ts);
      if (Number.isNaN(eventMs) || eventMs < this.request.startMs) continue;
      if (this.request.endMs !== undefined && eventMs >= this.request.endMs) continue;

      const tokens = event.inputTokens + event.outputTokens;
      const cost = eventCost(event, this.request.rates);
      this.totals.tokens += tokens;
      this.totals.cost += cost;
      this.sources.add(event.sourcePath);

      if (eventMs < this.request.bucketEndMs) {
        const local = zoned_parts(eventMs, this.request.timeZone);
        const calendar_date = format_calendar_date(local);
        const daily_index = this.daily_index_by_date.get(calendar_date);
        const daily = daily_index === undefined ? undefined : this.dailySpend[daily_index];
        if (daily) {
          daily.tokens += tokens;
          daily.cost += cost;
        }

        const weekday = (calendar_day_of_week(calendar_date) + 6) % 7;
        const hourly = this.hourlyHeatmap[weekday];
        if (hourly) hourly[local.hour] = (hourly[local.hour] ?? 0) + tokens;
      }

      const model = this.models.get(event.model) ?? { tokens: 0, cost: 0 };
      model.tokens += tokens;
      model.cost += cost;
      this.models.set(event.model, model);

      const projectId = session.projectId ?? '__unlinked__';
      const project = this.projects.get(projectId) ?? {
        tokens: 0,
        cost: 0,
        sources: new Set<string>(),
      };
      project.tokens += tokens;
      project.cost += cost;
      project.sources.add(event.sourcePath);
      this.projects.set(projectId, project);
    }
  }

  finish(cache: AggregateScanCacheStats): BurnAggregate {
    this.totals.sessions = this.sources.size;
    const modelMix = Array.from(this.models, ([model, value]) => ({ model, ...value }))
      .sort((a, b) => b.tokens - a.tokens);
    const perProjectLeaderboard = Array.from(this.projects, ([projectId, value]) => ({
      projectId,
      tokens: value.tokens,
      cost: value.cost,
      sessions: value.sources.size,
    })).sort((a, b) => b.tokens - a.tokens);
    return {
      calendar: {
        timeZone: this.request.timeZone,
        bucketRange: {
          start: new Date(this.request.startMs).toISOString(),
          end: new Date(this.request.bucketEndMs).toISOString(),
          startDate: this.request.startDate,
          endDateExclusive: this.request.endDateExclusive,
        },
        evaluationRange: {
          start: new Date(this.request.startMs).toISOString(),
          end: this.request.endMs === undefined
            ? null
            : new Date(this.request.endMs).toISOString(),
        },
      },
      totals: this.totals,
      dailySpend: this.dailySpend,
      hourlyHeatmap: this.hourlyHeatmap,
      modelMix,
      perProjectLeaderboard,
      cache,
    };
  }
}

function clampDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return 30;
  if (days < 1) return 1;
  if (days > 365) return 365;
  return Math.floor(days);
}

function valid_end_ms(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) throw new RangeError('endMs must be a finite epoch millisecond');
  return value;
}
