import { parse_calendar_date, type CalendarRange } from './calendar.js';

/**
 * Per-million-token rates (USD). Sources: published Anthropic/OpenAI rate cards.
 * These are the shipped floor; the user owns the rest via `mergeModelRates`.
 */
export interface ModelRate {
  model: string;
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM?: number;
  cacheWritePerM?: number;
}

/** Defensive ceiling that keeps persisted user input far below numeric overflow. */
export const MAX_MODEL_RATE_PER_M = 1_000_000;

export const DEFAULT_MODEL_RATES: ModelRate[] = [
  // Anthropic — Claude family
  { model: 'claude-opus-4-7',     inputPerM: 5,  outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  { model: 'claude-opus-4-6',     inputPerM: 5,  outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  { model: 'claude-sonnet-4-6',   inputPerM: 3,  outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  { model: 'claude-sonnet-4-5',   inputPerM: 3,  outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  { model: 'claude-haiku-4-5',    inputPerM: 1,  outputPerM: 5,  cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  // OpenAI — Codex / GPT family (current published rates)
  { model: 'gpt-5',               inputPerM: 1.25, outputPerM: 10,  cacheReadPerM: 0.125 },
  { model: 'gpt-4.1',             inputPerM: 2,    outputPerM: 8,   cacheReadPerM: 0.5 },
  { model: 'o4-mini',             inputPerM: 1.1,  outputPerM: 4.4, cacheReadPerM: 0.275 },
];

/** A stored rate override, owned by the user rather than by the shipped card. */
export interface ModelRateOverride extends ModelRate {
  createdAt: string;
  updatedAt: string;
}

export interface UpsertModelRateInput {
  model: string;
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM?: number;
  cacheWritePerM?: number;
}

/**
 * The effective rate card: user overrides win over the shipped defaults, keyed
 * on exact model id.
 *
 * An override for a model the defaults never mention is an addition, not an
 * error — a third-party model reached through a proxy (`qwen3.8-max-preview`,
 * `k3`) will never appear in a first-party rate card, so the user has to be
 * able to introduce one. Nothing here invents a price for a model the user has
 * not priced: an unlisted model stays unlisted, and `eventCost` keeps reporting
 * it as unpriced rather than free.
 */
export function mergeModelRates(
  defaults: ModelRate[],
  overrides: ModelRate[],
): ModelRate[] {
  const byModel = new Map<string, ModelRate>();
  for (const rate of [...defaults, ...overrides]) {
    const previous = byModel.get(rate.model);
    const merged: ModelRate = {
      model: rate.model,
      inputPerM: rate.inputPerM,
      outputPerM: rate.outputPerM,
    };
    const cache_read_per_m = rate.cacheReadPerM ?? previous?.cacheReadPerM;
    const cache_write_per_m = rate.cacheWritePerM ?? previous?.cacheWritePerM;
    if (cache_read_per_m !== undefined) merged.cacheReadPerM = cache_read_per_m;
    if (cache_write_per_m !== undefined) merged.cacheWritePerM = cache_write_per_m;
    byModel.set(rate.model, merged);
  }
  return Array.from(byModel.values()).sort((a, b) => a.model.localeCompare(b.model));
}

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
  const family = normalize_model_rate_id(model);
  return family === model ? undefined : rates.find((r) => r.model === family);
}

/** Canonical family id used by provider rate cards for dated transcript ids. */
export function normalize_model_rate_id(model: string): string {
  const trimmed_model = model.trim();
  const suffix = /-(\d{8}|\d{4}-\d{2}-\d{2})$/.exec(trimmed_model);
  if (!suffix) return trimmed_model;

  const raw_date = suffix[1]!;
  const calendar_date = raw_date.includes('-')
    ? raw_date
    : `${raw_date.slice(0, 4)}-${raw_date.slice(4, 6)}-${raw_date.slice(6, 8)}`;
  try {
    parse_calendar_date(calendar_date);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid calendar date')) {
      return trimmed_model;
    }
    throw error;
  }
  return trimmed_model.slice(0, suffix.index);
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
  if ((e.cacheReadTokens ?? 0) > 0 && rate.cacheReadPerM === undefined) return undefined;
  if ((e.cacheWriteTokens ?? 0) > 0 && rate.cacheWritePerM === undefined) return undefined;
  const input = (e.inputTokens / 1_000_000) * rate.inputPerM;
  const output = (e.outputTokens / 1_000_000) * rate.outputPerM;
  const cacheRead = ((e.cacheReadTokens ?? 0) / 1_000_000) * (rate.cacheReadPerM ?? 0);
  const cacheWrite = ((e.cacheWriteTokens ?? 0) / 1_000_000) * (rate.cacheWritePerM ?? 0);
  const total = input + output + cacheRead + cacheWrite;
  if (!Number.isFinite(total)) {
    throw new Error(`cost overflow for model ${e.model}`);
  }
  return total;
}

export interface UsageModelBreakdown {
  model: string;
  tokens: number;
  /** `undefined` when the model has no rate — never collapsed to 0. */
  cost: number | undefined;
}

export interface UsageSummary {
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    /** input + output, counted the same way the burn aggregate counts them. */
    tokens: number;
    /** Priced usage only — a floor whenever `pricing` reports gaps. */
    cost: number;
  };
  /** Per-model split, so a caller can name which model is missing a rate. */
  modelMix: UsageModelBreakdown[];
  pricing: BurnPricingCoverage;
}

/** API payload for one session, including activity freshness for live refresh. */
export interface SessionUsageSummary extends UsageSummary {
  /** Last activity seen during the scan that produced this usage summary. */
  sessionLastActiveAt: string | null;
}

/**
 * Totals for an arbitrary set of usage events.
 *
 * The accounting rules here are the burn aggregate's, deliberately: tokens are
 * input + output, cost sums priced events only, and an unpriced event still
 * contributes its tokens while its model is recorded in `pricing`. Any surface
 * showing a cost has to answer "is this the whole number?", and it can only do
 * that consistently if there is one definition of the answer.
 */
export function summarizeUsage(
  events: UsageEvent[],
  rates: ModelRate[] = DEFAULT_MODEL_RATES,
): UsageSummary {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    tokens: 0,
    cost: 0,
  };
  const models = new Map<string, UsageModelBreakdown>();
  const unknown = new Set<string>();
  let unpricedTokens = 0;

  for (const event of events) {
    const tokens = event.inputTokens + event.outputTokens;
    const priced = eventCost(event, rates);

    totals.inputTokens += event.inputTokens;
    totals.outputTokens += event.outputTokens;
    totals.cacheReadTokens += event.cacheReadTokens ?? 0;
    totals.cacheWriteTokens += event.cacheWriteTokens ?? 0;
    totals.tokens += tokens;
    totals.cost += priced ?? 0;

    if (priced === undefined) {
      unknown.add(event.model);
      unpricedTokens += tokens;
    }

    const model = models.get(event.model) ?? { model: event.model, tokens: 0, cost: 0 };
    model.tokens += tokens;
    // Once any event for a model is unpriced, its aggregate stays incomplete.
    if (priced === undefined) model.cost = undefined;
    else if (model.cost !== undefined) model.cost += priced;
    models.set(event.model, model);
  }

  return {
    totals,
    modelMix: Array.from(models.values()).sort((a, b) => b.tokens - a.tokens),
    pricing: { unknownModels: Array.from(unknown).sort(), unpricedTokens },
  };
}
