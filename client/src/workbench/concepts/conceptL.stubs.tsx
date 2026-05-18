import type { ReactNode } from 'react';
import { fmt, type WBTodo } from '../data';

/**
 * Visual stub generators kept around so ConceptL still renders something
 * believable when real data is empty (e.g. before subtasks/sessions/journal
 * load on first open). Real data wins as soon as it arrives.
 */

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'untitled';
}

export function stubSubTasks(t: WBTodo): { done: boolean; text: string }[] {
  const base = [
    'sketch the smallest viable version',
    'list the unknowns first',
    'pick the riskiest assumption + test it',
    'wire the smallest end-to-end path',
    'decide cut points (what to defer)',
  ];
  const n = 3 + (hash(t.id) % 3);
  return base.slice(0, n).map((text, i) => ({ done: i < Math.min(2, n - 1), text }));
}

export function stubLinkedSessions(t: WBTodo): { id: string; who: string; title: string; at: string }[] {
  if (!t.project) return [];
  return [
    { id: 's4', who: t.project + ' · sonnet-4.5', title: 'recent edit related to this todo', at: fmt.ago(Date.now() - 1000 * 60 * 42) },
    { id: 's8', who: t.project + ' · codex-1',    title: 'investigation pass for the same area', at: fmt.ago(Date.now() - 1000 * 60 * 60 * 4) },
  ];
}

export function stubJournal(t: WBTodo): { date: string; body: ReactNode }[] {
  return [
    { date: 'today', body: <>captured from {t.kind === 'idea' ? 'the inbox' : 'the board'}. priority sits at <code className="md-code">{t.priority}</code> — revisit when scope is clearer.</> },
    { date: '−2d',   body: <>noted that this overlaps with the active workboard cycle; tagged for next refinement pass.</> },
  ];
}

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
