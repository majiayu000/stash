import type { BurnSnapshot, WeeklySnapshot } from '@stash/shared';
import { apiGet } from './client';

interface BurnResponse { data: BurnSnapshot }
interface WeeklyResponse { data: WeeklySnapshot }

export async function getBurnSnapshot(days?: number): Promise<BurnSnapshot> {
  const qs = days !== undefined ? `?days=${days}` : '';
  const res = await apiGet<BurnResponse>(`/analytics/burn${qs}`);
  return res.data;
}

export async function getWeeklySnapshot(week?: string): Promise<WeeklySnapshot> {
  const qs = week ? `?week=${week}` : '';
  const res = await apiGet<WeeklyResponse>(`/analytics/weekly${qs}`);
  return res.data;
}
