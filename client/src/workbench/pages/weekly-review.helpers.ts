import type { UpdateWorkItemInput, WorkItem } from '@stash/shared';
import type { WBProject } from '../data';
import { dateInRange, type IsoWeekRange } from './weekly-review.week';

/** Data shaping for the weekly review: grouping, ordering, deltas, and export. */

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

export function pctDelta(cur: number, prev: number): number {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

export function groupDoneByProject(items: WorkItem[], projects: WBProject[]): { project: WBProject; items: WorkItem[] }[] {
  const byArea = new Map<string, WorkItem[]>();
  for (const it of items) {
    const key = it.areaId ?? '__unassigned__';
    const bucket = byArea.get(key);
    if (bucket) bucket.push(it); else byArea.set(key, [it]);
  }
  const out: { project: WBProject; items: WorkItem[] }[] = [];
  for (const p of projects) {
    const buc = byArea.get(p.id);
    if (buc && buc.length > 0) out.push({ project: p, items: buc });
  }
  const unassigned = byArea.get('__unassigned__');
  if (unassigned && unassigned.length > 0) {
    out.push({
      project: {
        id: '__unassigned__',
        name: 'No project',
        emoji: '•',
        progress: 0,
        status: 'fresh',
        doing: 'unassigned work',
        features: [],
        todoCount: unassigned.length,
        todoDone: unassigned.length,
        sessions: 0,
        estimatedTokens: 0,
        lastModel: '—',
        lastTouched: Date.now(),
      },
      items: unassigned,
    });
  }
  out.sort((a, b) => b.items.length - a.items.length);
  return out;
}

export function itemsForDate(items: WorkItem[], date: string): WorkItem[] {
  return items.filter((item) => item.scheduledFor === date);
}

export function reconcilePlannedItem(items: WorkItem[], updated: WorkItem, range: IsoWeekRange): WorkItem[] {
  const withoutUpdated = items.filter((item) => item.id !== updated.id);
  if (updated.status !== 'planned' || !dateInRange(updated.scheduledFor, range)) {
    return withoutUpdated;
  }
  return sortPlanItems([...withoutUpdated, updated]);
}

export function sortPlanItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const date = (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '');
    if (date !== 0) return date;
    const priority = priorityRank(a.priority) - priorityRank(b.priority);
    if (priority !== 0) return priority;
    return a.title.localeCompare(b.title);
  });
}

export function priorityRank(priority: WorkItem['priority']): number {
  return { p0: 0, p1: 1, p2: 2, p3: 3 }[priority];
}

export function isShareCancellation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

export function downloadMarkdown(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
