import type { CalendarRange } from './calendar.js';

/**
 * Per-million-token rates (USD). Sources: published Anthropic/OpenAI rate cards.
 * Hardcoded defaults; future PR adds settings-override.
 */
export interface ModelRate {
  model: string;
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM?: number;
  cacheWritePerM?: number;
}

export const DEFAULT_MODEL_RATES: ModelRate[] = [
  // Anthropic — Claude family
  { model: 'claude-opus-4-7',     inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 },
  { model: 'claude-opus-4-6',     inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 },
  { model: 'claude-sonnet-4-6',   inputPerM: 3,  outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  { model: 'claude-sonnet-4-5',   inputPerM: 3,  outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  { model: 'claude-haiku-4-5',    inputPerM: 1,  outputPerM: 5,  cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  // OpenAI — Codex / GPT family (current published rates)
  { model: 'gpt-5',               inputPerM: 5,  outputPerM: 15 },
  { model: 'gpt-4.1',             inputPerM: 2,  outputPerM: 8 },
  { model: 'o4-mini',             inputPerM: 1.1, outputPerM: 4.4 },
];

export interface UsageEvent {
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  sourcePath: string;
  /** Optional projection from the session that emitted this event. */
  projectId?: string;
}

export interface DailySpendBucket {
  date: string;
  tokens: number;
  cost: number;
}

export interface ModelMixItem {
  model: string;
  share: number;
  tokens: number;
  /** `undefined` when no rate covers this model — not the same as $0.00. */
  cost: number | undefined;
}

/**
 * How much of a cost figure is actually backed by a rate card. `cost` totals
 * only ever sum priced usage, so any non-empty `unknownModels` means the
 * reported cost is a floor, not the real spend.
 */
export interface BurnPricingCoverage {
  /** Distinct model ids seen with usage but no matching rate, ascending. */
  unknownModels: string[];
  /** Input+output tokens that could not be priced. */
  unpricedTokens: number;
}

/** True when every token in the window was covered by a rate. */
export function isFullyPriced(coverage: BurnPricingCoverage): boolean {
  return coverage.unknownModels.length === 0;
}

/** Union of two coverages, for figures aggregated over more than one window. */
export function merge_pricing_coverage(
  ...coverages: BurnPricingCoverage[]
): BurnPricingCoverage {
  const unknown = new Set<string>();
  let unpricedTokens = 0;
  for (const coverage of coverages) {
    for (const model of coverage.unknownModels) unknown.add(model);
    unpricedTokens += coverage.unpricedTokens;
  }
  return { unknownModels: Array.from(unknown).sort(), unpricedTokens };
}

export interface ProjectBurnRow {
  projectId: string;
  projectName: string;
  tokens: number;
  cost: number;
  sessions: number;
  share: number;
}

export interface BurnSnapshot {
  calendar: {
    timeZone: string;
    bucketRange: CalendarRange;
    evaluationRange: {
      start: string;
      end: string | null;
    };
  };
  totals: { tokens: number; cost: number; sessions: number };
  dailySpend: DailySpendBucket[];
  hourlyHeatmap: number[][];
  modelMix: ModelMixItem[];
  perProjectLeaderboard: ProjectBurnRow[];
  /** Every `cost` above sums priced usage only; this says what was left out. */
  pricing: BurnPricingCoverage;
}

export interface WoWPair { now: number; prev: number }

export interface FeatureAdvancedRow {
  id: string;
  title: string;
  from: string;
  to: string;
}

export interface DoneProjectRow {
  projectId: string;
  projectName: string;
  count: number;
}

export interface WeeklySnapshot {
  calendar: {
    timeZone: string;
    range: CalendarRange;
  };
  week: string;            // ISO week label, e.g. "2026-W19"
  rangeStart: string;      // UTC ISO instant for configured-zone Monday 00:00
  rangeEnd: string;        // UTC ISO instant for next configured-zone Monday 00:00, exclusive
  doneCount: number;
  focusHours: number;
  featuresAdvanced: FeatureAdvancedRow[];
  sessionsByDay: number[]; // length 7, Mon..Sun
  donePerProject: DoneProjectRow[];
  wow: { tokens: WoWPair; cost: WoWPair; sessions: WoWPair };
  /** Coverage for the union of both compared weeks. */
  pricing: BurnPricingCoverage;
}

export type BudgetPeriod = 'day' | 'week' | 'month' | 'quarter';

export interface Budget {
  id: string;
  scope: string;
  capUsd: number;
  period: BudgetPeriod;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetInput {
  scope: string;
  capUsd: number;
  period?: BudgetPeriod;
  notes?: string;
}

export type UpdateBudgetInput = Partial<CreateBudgetInput>;

export interface BudgetPeriodSpend {
  range: CalendarRange;
  totals: { cost: number };
  perProject: Array<{
    projectId: string;
    projectName: string;
    cost: number;
  }>;
}

export interface BudgetSpendSnapshot {
  calendar: {
    timeZone: string;
    generatedAt: string;
  };
  periods: Record<BudgetPeriod, BudgetPeriodSpend>;
  /**
   * Non-empty `unknownModels` means every period's spend is understated, so a
   * budget that reads "under cap" may in fact be over it. Callers must not
   * render a reassuring percentage while this is set.
   */
  pricing: BurnPricingCoverage;
}

/**
 * Provider model ids carry a release-date suffix in real transcripts
 * (`claude-sonnet-4-5-20250929`) but rate cards are published without it.
 * Match the exact id first, then retry against the date-stripped family id.
 */
export function findModelRate(
  model: string,
  rates: ModelRate[] = DEFAULT_MODEL_RATES,
): ModelRate | undefined {
  const exact = rates.find((r) => r.model === model);
  if (exact) return exact;
  const family = model.replace(/-\d{8}$/, '');
  return family === model ? undefined : rates.find((r) => r.model === family);
}

/**
 * Cost USD for one event, or `undefined` when no rate covers the model.
 *
 * Returning `undefined` rather than `0` is deliberate: an unpriced event and a
 * genuinely free one are not the same fact, and collapsing them silently
 * reported $0.00 spend — and a permanently un-trippable budget — for every user
 * whose models were missing from the rate card. Callers must decide explicitly
 * what to do with unpriced usage; see `BurnPricingCoverage`.
 */
export function eventCost(
  e: UsageEvent,
  rates: ModelRate[] = DEFAULT_MODEL_RATES,
): number | undefined {
  const rate = findModelRate(e.model, rates);
  if (!rate) return undefined;
  const input = (e.inputTokens / 1_000_000) * rate.inputPerM;
  const output = (e.outputTokens / 1_000_000) * rate.outputPerM;
  const cacheRead = ((e.cacheReadTokens ?? 0) / 1_000_000) * (rate.cacheReadPerM ?? 0);
  const cacheWrite = ((e.cacheWriteTokens ?? 0) / 1_000_000) * (rate.cacheWritePerM ?? 0);
  return input + output + cacheRead + cacheWrite;
}
