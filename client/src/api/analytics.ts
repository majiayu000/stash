import type { BudgetSpendSnapshot, BurnSnapshot, WeeklySnapshot } from '@stash/shared';
import { apiGet } from './client';

interface BurnResponse { data: BurnSnapshot }
interface BudgetSpendResponse { data: BudgetSpendSnapshot }
interface WeeklyResponse { data: WeeklySnapshot }

const WEEKLY_SNAPSHOT_FRESHNESS_MS = 30_000;

interface WeeklySnapshotCacheEntry {
  data?: WeeklySnapshot;
  updated_at?: number;
  inflight?: Promise<WeeklySnapshot>;
}

const weekly_snapshot_cache = new Map<string, WeeklySnapshotCacheEntry>();

export async function getBurnSnapshot(days?: number): Promise<BurnSnapshot> {
  const qs = days !== undefined ? `?days=${days}` : '';
  const res = await apiGet<BurnResponse>(`/analytics/burn${qs}`);
  return res.data;
}

export async function getBudgetSpendSnapshot(): Promise<BudgetSpendSnapshot> {
  const res = await apiGet<BudgetSpendResponse>('/analytics/budget-spend');
  return res.data;
}

export async function getWeeklySnapshot(week?: string): Promise<WeeklySnapshot> {
  const key = week ?? 'current';
  const current = weekly_snapshot_cache.get(key);
  if (
    current?.data
    && current.updated_at !== undefined
    && Date.now() - current.updated_at < WEEKLY_SNAPSHOT_FRESHNESS_MS
  ) {
    return current.data;
  }
  if (current?.inflight) return current.inflight;

  const qs = week ? `?week=${week}` : '';
  const inflight = apiGet<WeeklyResponse>(`/analytics/weekly${qs}`)
    .then((res) => {
      weekly_snapshot_cache.set(key, {
        data: res.data,
        updated_at: Date.now(),
      });
      return res.data;
    })
    .catch((error: unknown) => {
      weekly_snapshot_cache.delete(key);
      throw error;
    });
  weekly_snapshot_cache.set(key, { inflight });
  return inflight;
}

export function prefetchWeeklySnapshot(week?: string): Promise<WeeklySnapshot> {
  return getWeeklySnapshot(week);
}
