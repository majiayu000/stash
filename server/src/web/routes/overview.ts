import { Hono } from 'hono';
import { systemClock, type Clock, type WorkItem } from '@stash/shared';
import type { WorkItemService } from '../../domain/work-item/service.js';
import { handleError } from '../errors.js';

interface NeedsAttentionItem {
  kind: 'inbox_pressure' | 'blocked' | 'stale_waiting' | 'review_due';
  message: string;
  count?: number;
  itemId?: string;
}

export interface OverviewResponse {
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

function isoDate(now: string): string {
  // YYYY-MM-DD
  return now.slice(0, 10);
}

function isStale(updatedAt: string, todayIso: string, days: number): boolean {
  const u = new Date(updatedAt).getTime();
  const t = new Date(todayIso).getTime();
  return !Number.isNaN(u) && !Number.isNaN(t) && (t - u) / 86400000 >= days;
}

export function buildOverview(service: WorkItemService, clock: Clock): OverviewResponse {
  const nowIso = clock.nowIso();
  const todayDate = isoDate(nowIso);
  const all = service.list({ includeDropped: false });

  const inbox = all.filter((i) => i.status === 'inbox');
  const today = all.filter(
    (i) => i.scheduledFor === todayDate && ['planned', 'active', 'waiting'].includes(i.status),
  );
  const planned = all.filter((i) => i.status === 'planned');
  const waiting = all.filter((i) => i.status === 'waiting');
  const blocked = all.filter((i) => i.status === 'blocked');
  const someday = all.filter((i) => i.status === 'someday');
  const activeProjectIds = new Set(
    all.filter((i) => i.status === 'active' && i.projectId).map((i) => i.projectId!),
  );

  const needsAttention: NeedsAttentionItem[] = [];
  if (inbox.length >= 5) {
    needsAttention.push({
      kind: 'inbox_pressure',
      message: `${inbox.length} loose thoughts need triage`,
      count: inbox.length,
    });
  }
  for (const b of blocked.slice(0, 3)) {
    needsAttention.push({
      kind: 'blocked',
      message: b.title,
      itemId: b.id,
    });
  }
  for (const w of waiting) {
    if (isStale(w.updatedAt, nowIso, 3)) {
      needsAttention.push({
        kind: 'stale_waiting',
        message: `${w.title} (waiting ≥3 days)`,
        itemId: w.id,
      });
    }
  }

  return {
    date: todayDate,
    counts: {
      inbox: inbox.length,
      today: today.length,
      planned: planned.length,
      waiting: waiting.length,
      blocked: blocked.length,
      someday: someday.length,
      activeProjects: activeProjectIds.size,
    },
    today,
    waiting,
    needsAttention,
  };
}

export function createOverviewRouter(
  service: WorkItemService,
  clock: Clock = systemClock,
): Hono {
  const r = new Hono();
  r.get('/', (c) => {
    try {
      return c.json({ data: buildOverview(service, clock) });
    } catch (e) {
      return handleError(c, e);
    }
  });
  return r;
}
