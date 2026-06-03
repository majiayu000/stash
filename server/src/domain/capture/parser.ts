import type { Area, Priority } from '@stash/shared';

/**
 * SPEC v0.3 §3b — inline token parser for quick capture.
 *
 * Recognised tokens (extracted left-to-right, stripped from the residual title):
 *   #project    project / area name match (case-insensitive)
 *   @tag        label append
 *   ^p0 ^p1 ^p2 ^p3
 *   !today / !tomorrow / !mon..!sun / !next-tue / !2026-05-20  → scheduledFor
 *   !!due-tomorrow / !!2026-05-20  → dueAt (deadline)
 *   *1h / *30m / *90m            → estimateMinutes
 *
 * The raw input is preserved by the caller; this returns the parsed fields only.
 */
export interface ParsedCapture {
  title: string;
  projectId?: string;
  areaId?: string;
  labels: string[];
  priority?: Priority;
  scheduledFor?: string;
  dueAt?: string;
  estimateMinutes?: number;
  /** Tokens recognised but not resolved (e.g. #project that didn't match an area). */
  unresolved: string[];
}

export interface ParserContext {
  /** Project/area catalog used to resolve `#name` tokens. */
  areas: Area[];
  /** "Now" for relative dates; ISO timestamp. */
  nowIso: string;
}

const TOKEN_RE = /(#[\w-]+|@[\w-]+|\^p[0-3]|!![\w-]+|![\w-]+|\*\d+[hm])/gi;

export function parseCaptureInput(raw: string, ctx: ParserContext): ParsedCapture {
  const labels: string[] = [];
  const unresolved: string[] = [];
  let projectId: string | undefined;
  let areaId: string | undefined;
  let priority: Priority | undefined;
  let scheduledFor: string | undefined;
  let dueAt: string | undefined;
  let estimateMinutes: number | undefined;

  const stripped = raw.replace(TOKEN_RE, (match) => {
    const lower = match.toLowerCase();
    if (lower.startsWith('#')) {
      const name = normalizeProjectToken(match.slice(1));
      const area = ctx.areas.find((a) => normalizeProjectToken(a.name) === name);
      if (area) {
        projectId = area.id;
        areaId = area.id;
      } else {
        unresolved.push(match);
      }
      return '';
    }
    if (lower.startsWith('@')) {
      const tag = match.slice(1);
      if (tag && !labels.includes(tag)) labels.push(tag);
      return '';
    }
    if (lower.startsWith('^p')) {
      priority = lower.slice(1) as Priority;
      return '';
    }
    if (lower.startsWith('!!')) {
      const date = parseDateToken(match.slice(2), ctx.nowIso);
      if (date) dueAt = date;
      else unresolved.push(match);
      return '';
    }
    if (lower.startsWith('!')) {
      const date = parseDateToken(match.slice(1), ctx.nowIso);
      if (date) scheduledFor = date;
      else unresolved.push(match);
      return '';
    }
    if (lower.startsWith('*')) {
      const m = /^\*(\d+)([hm])$/i.exec(match);
      if (m) {
        const n = Number(m[1]);
        estimateMinutes = m[2]!.toLowerCase() === 'h' ? n * 60 : n;
      } else {
        unresolved.push(match);
      }
      return '';
    }
    return match;
  });

  const title = stripped.replace(/\s+/g, ' ').trim();

  return {
    title,
    projectId,
    areaId,
    labels,
    priority,
    scheduledFor,
    dueAt,
    estimateMinutes,
    unresolved,
  };
}

function normalizeProjectToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

/**
 * Lightweight date phrase parser. Returns ISO date (YYYY-MM-DD) when input
 * matches; undefined otherwise. Supports:
 *   today, tomorrow, tomo, tom
 *   mon..sun, monday..sunday (next occurrence ≥ tomorrow if today is same)
 *   next-mon..next-sun
 *   YYYY-MM-DD
 *   due-today / due-tomorrow / due-<weekday> are tolerated for the !! prefix
 */
export function parseDateToken(raw: string, nowIso: string): string | undefined {
  const phrase = raw.toLowerCase().replace(/^due-/, '').replace(/_/g, '-');
  const now = new Date(nowIso);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  if (phrase === 'today') return iso(todayUtc);
  if (phrase === 'tomorrow' || phrase === 'tomo' || phrase === 'tom') {
    return iso(todayUtc + 86_400_000);
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(phrase);
  if (isoMatch) return phrase;

  const weekdayMap: Record<string, number> = {
    mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
    wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5, sat: 6, saturday: 6, sun: 0, sunday: 0,
  };
  const next = phrase.startsWith('next-');
  const wdName = next ? phrase.slice(5) : phrase;
  const targetDow = weekdayMap[wdName];
  if (targetDow === undefined) return undefined;

  const todayDow = new Date(todayUtc).getUTCDay();
  let delta = (targetDow - todayDow + 7) % 7;
  if (delta === 0) delta = 7;          // "fri" on a Friday → next Friday
  if (next) delta += 7;                 // "next-fri" → +7 again
  return iso(todayUtc + delta * 86_400_000);
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
