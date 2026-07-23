import {
  DEFAULT_MODEL_RATES,
  eventCost,
  type AgentSession,
  type BurnSnapshot,
  type Clock,
  type DailySpendBucket,
  type ModelRate,
  type UsageEvent,
  systemClock,
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
}

export interface BurnQuery {
  days?: number;
}

export interface BurnAggregationRequest {
  startMs: number;
  beforeMs?: number;
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

  constructor(deps: BurnServiceDeps) {
    this.aggregator = deps.aggregator;
    this.areaService = deps.areaService;
    this.clock = deps.clock ?? systemClock;
    this.rates = deps.rates ?? DEFAULT_MODEL_RATES;
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
      beforeMs: endMs,
      days: 1,
      rates: this.rates,
    }).totals;
  }

  private rollingRequest(q: BurnQuery): BurnAggregationRequest {
    const days = clampDays(q.days);
    return {
      startMs: startOfDayUtcMs(new Date(this.clock.now())) - (days - 1) * 86_400_000,
      days,
      rates: this.rates,
    };
  }

  private finalize(aggregate: BurnAggregate): BurnSnapshot {
    const totalTokens = aggregate.totals.tokens;
    return {
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

  constructor(private readonly request: BurnAggregationRequest) {
    this.dailySpend = Array.from({ length: request.days }, (_, index) => ({
      date: isoDate(request.startMs + index * 86_400_000),
      tokens: 0,
      cost: 0,
    }));
  }

  addSession(session: AgentSession, usage: UsageEvent[]): void {
    for (const event of usage) {
      const eventMs = Date.parse(event.ts);
      if (Number.isNaN(eventMs) || eventMs < this.request.startMs) continue;
      if (this.request.beforeMs !== undefined && eventMs >= this.request.beforeMs) continue;

      const tokens = event.inputTokens + event.outputTokens;
      const cost = eventCost(event, this.request.rates);
      this.totals.tokens += tokens;
      this.totals.cost += cost;
      this.sources.add(event.sourcePath);

      const dailyIndex = Math.floor((eventMs - this.request.startMs) / 86_400_000);
      const daily = this.dailySpend[dailyIndex];
      if (daily) {
        daily.tokens += tokens;
        daily.cost += cost;
      }

      const date = new Date(eventMs);
      const weekday = (date.getUTCDay() + 6) % 7;
      const hourly = this.hourlyHeatmap[weekday];
      if (hourly) hourly[date.getUTCHours()] = (hourly[date.getUTCHours()] ?? 0) + tokens;

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

function startOfDayUtcMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
