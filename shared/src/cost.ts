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
  cost: number;
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
  totals: { tokens: number; cost: number; sessions: number };
  dailySpend: DailySpendBucket[];
  hourlyHeatmap: number[][];
  modelMix: ModelMixItem[];
  perProjectLeaderboard: ProjectBurnRow[];
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
  week: string;            // ISO week label, e.g. "2026-W19"
  rangeStart: string;      // ISO datetime (Mon 00:00 UTC)
  rangeEnd: string;        // ISO datetime (next Mon 00:00 UTC, exclusive)
  doneCount: number;
  focusHours: number;
  featuresAdvanced: FeatureAdvancedRow[];
  sessionsByDay: number[]; // length 7, Mon..Sun
  donePerProject: DoneProjectRow[];
  wow: { tokens: WoWPair; cost: WoWPair; sessions: WoWPair };
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

/** Cost USD for one event, using the matching default rate (zero if unknown model). */
export function eventCost(e: UsageEvent, rates: ModelRate[] = DEFAULT_MODEL_RATES): number {
  const rate = rates.find((r) => r.model === e.model);
  if (!rate) return 0;
  const input = (e.inputTokens / 1_000_000) * rate.inputPerM;
  const output = (e.outputTokens / 1_000_000) * rate.outputPerM;
  const cacheRead = ((e.cacheReadTokens ?? 0) / 1_000_000) * (rate.cacheReadPerM ?? 0);
  const cacheWrite = ((e.cacheWriteTokens ?? 0) / 1_000_000) * (rate.cacheWritePerM ?? 0);
  return input + output + cacheRead + cacheWrite;
}
