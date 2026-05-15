import type { WorkItem } from '@stash/shared';
import { apiGet } from './client';

export interface NeedsAttentionItem {
  kind: 'inbox_pressure' | 'blocked' | 'stale_waiting' | 'review_due';
  message: string;
  count?: number;
  itemId?: string;
}

export interface OverviewData {
  date: string;
  counts: {
    inbox: number;
    today: number;
    planned: number;
    waiting: number;
    blocked: number;
    someday: number;
    activeProjects: number;
  };
  today: WorkItem[];
  waiting: WorkItem[];
  needsAttention: NeedsAttentionItem[];
}

interface OverviewResponse {
  data: OverviewData;
}

export async function getOverview(): Promise<OverviewData> {
  const res = await apiGet<OverviewResponse>('/overview');
  return res.data;
}
