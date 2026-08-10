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
let weekly_snapshot_generation = 0;

export function invalidate_weekly_snapshot_cache(): void {
  weekly_snapshot_generation += 1;
  weekly_snapshot_cache.clear();
}

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
  const request_generation = weekly_snapshot_generation;
  let inflight!: Promise<WeeklySnapshot>;
  inflight = apiGet<WeeklyResponse>(`/analytics/weekly${qs}`)
    .then((res) => {
      if (request_generation === weekly_snapshot_generation) {
        weekly_snapshot_cache.set(key, {
          data: res.data,
          updated_at: Date.now(),
        });
      }
      return res.data;
    })
    .catch((error: unknown) => {
      const cached = weekly_snapshot_cache.get(key);
      if (
        request_generation === weekly_snapshot_generation
        && cached?.inflight === inflight
      ) {
        weekly_snapshot_cache.delete(key);
      }
      throw error;
    });
  if (request_generation === weekly_snapshot_generation) {
    weekly_snapshot_cache.set(key, { inflight });
  }
  return inflight;
}

export function prefetchWeeklySnapshot(week?: string): Promise<WeeklySnapshot> {
  return getWeeklySnapshot(week);
}
