import {
  DEFAULT_MODEL_RATES,
  eventCost,
  type BurnSnapshot,
  type DailySpendBucket,
  type ModelMixItem,
  type ModelRate,
  type ProjectBurnRow,
  type UsageEvent,
  systemClock,
  type Clock,
} from '@stash/shared';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
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

  snapshot(q: BurnQuery = {}): BurnSnapshot {
    const days = clampDays(q.days);
    const startMs = startOfDayUtcMs(new Date(this.clock.now())) - (days - 1) * 86_400_000;
    const startIso = new Date(startMs).toISOString();

    const events = this.collectEvents(startIso);
    const totals = this.computeTotals(events);
    const dailySpend = this.bucketDaily(events, startMs, days);
    const hourlyHeatmap = this.bucketHourly(events);
    const modelMix = this.modelMix(events, totals.tokens);
    const perProjectLeaderboard = this.projectLeaderboard(events, totals.tokens);

    return { totals, dailySpend, hourlyHeatmap, modelMix, perProjectLeaderboard };
  }

  // ─── pipeline ───────────────────────────────────────────────────────────

  private collectEvents(sinceIso: string): UsageEvent[] {
    const out: UsageEvent[] = [];
    const { sessions } = this.aggregator.scan({});
    for (const s of sessions) {
      for (const e of this.aggregator.getUsage(s.provider, s.sourcePath)) {
        if (e.ts < sinceIso) continue;
        out.push({ ...e, projectId: s.projectId });
      }
    }
    return out;
  }

  private computeTotals(events: UsageEvent[]): { tokens: number; cost: number; sessions: number } {
    const sources = new Set<string>();
    let tokens = 0;
    let cost = 0;
    for (const e of events) {
      tokens += e.inputTokens + e.outputTokens;
      cost += eventCost(e, this.rates);
      sources.add(e.sourcePath);
    }
    return { tokens, cost, sessions: sources.size };
  }

  private bucketDaily(events: UsageEvent[], startMs: number, days: number): DailySpendBucket[] {
    const buckets: DailySpendBucket[] = [];
    for (let i = 0; i < days; i++) {
      buckets.push({ date: isoDate(startMs + i * 86_400_000), tokens: 0, cost: 0 });
    }
    const dayMs = 86_400_000;
    for (const e of events) {
      const idx = Math.floor((Date.parse(e.ts) - startMs) / dayMs);
      if (idx < 0 || idx >= days) continue;
      const bucket = buckets[idx];
      if (!bucket) continue;
      bucket.tokens += e.inputTokens + e.outputTokens;
      bucket.cost += eventCost(e, this.rates);
    }
    return buckets;
  }

  private bucketHourly(events: UsageEvent[]): number[][] {
    const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const e of events) {
      const d = new Date(e.ts);
      if (Number.isNaN(d.getTime())) continue;
      const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const hour = d.getUTCHours();
      const row = grid[dow];
      if (!row) continue;
      row[hour] = (row[hour] ?? 0) + e.inputTokens + e.outputTokens;
    }
    return grid;
  }

  private modelMix(events: UsageEvent[], totalTokens: number): ModelMixItem[] {
    const byModel = new Map<string, { tokens: number; cost: number }>();
    for (const e of events) {
      const cur = byModel.get(e.model) ?? { tokens: 0, cost: 0 };
      cur.tokens += e.inputTokens + e.outputTokens;
      cur.cost += eventCost(e, this.rates);
      byModel.set(e.model, cur);
    }
    const out: ModelMixItem[] = [];
    for (const [model, agg] of byModel) {
      out.push({
        model,
        tokens: agg.tokens,
        cost: agg.cost,
        share: totalTokens > 0 ? agg.tokens / totalTokens : 0,
      });
    }
    out.sort((a, b) => b.tokens - a.tokens);
    return out;
  }

  private projectLeaderboard(events: UsageEvent[], totalTokens: number): ProjectBurnRow[] {
    const byProject = new Map<string, { tokens: number; cost: number; sources: Set<string> }>();
    for (const e of events) {
      const key = e.projectId ?? '__unlinked__';
      const cur = byProject.get(key) ?? { tokens: 0, cost: 0, sources: new Set<string>() };
      cur.tokens += e.inputTokens + e.outputTokens;
      cur.cost += eventCost(e, this.rates);
      cur.sources.add(e.sourcePath);
      byProject.set(key, cur);
    }
    const out: ProjectBurnRow[] = [];
    for (const [projectId, agg] of byProject) {
      const name = projectId === '__unlinked__' ? 'unlinked' : this.areaName(projectId);
      out.push({
        projectId,
        projectName: name,
        tokens: agg.tokens,
        cost: agg.cost,
        sessions: agg.sources.size,
        share: totalTokens > 0 ? agg.tokens / totalTokens : 0,
      });
    }
    out.sort((a, b) => b.tokens - a.tokens);
    return out;
  }

  private areaName(id: string): string {
    return this.areaService.get(id)?.name ?? id;
  }
}

function clampDays(d: number | undefined): number {
  if (d === undefined || !Number.isFinite(d)) return 30;
  if (d < 1) return 1;
  if (d > 365) return 365;
  return Math.floor(d);
}

function startOfDayUtcMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
