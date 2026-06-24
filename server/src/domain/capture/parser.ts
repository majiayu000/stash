import type { Area, Priority } from '@stash/shared';

/**
 * SPEC v0.3 §3b + v0.5 §7.1 — inline token parser for quick capture.
 *
 * Recognised tokens are extracted left-to-right and stripped from the residual title:
 *   #project / #项目        project / area name match (case-insensitive)
 *   @tag / @标签            label append
 *   ^p0 ^p1 ^p2 ^p3
 *   !today / !tomorrow / !mon..!sun / !next-tue / !2026-05-20  → scheduledFor
 *   !!due-tomorrow / !!2026-05-20  → dueAt (deadline)
 *   今天 / 明天 / 后天 / 大后天 / 周一..周日 / 下周 / +3d / +2w → scheduledFor
 *   上午9点 / 下午3点半 / 20:30 / 今晚 → startAt + scheduledFor
 *   *1h / *30m / *90m      → estimateMinutes
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
  startAt?: string;
  estimateMinutes?: number;
  /** Tokens recognised but not resolved (e.g. #project that didn't match an area). */
  unresolved: string[];
}

export type CapturePreviewChipType = 'proj' | 'tag' | 'pri' | 'date' | 'due' | 'time' | 'est' | 'unresolved';

export interface CapturePreviewChip {
  type: CapturePreviewChipType;
  label: string;
  value?: string;
}

export interface ParsedCapturePreview extends ParsedCapture {
  projectName?: string;
  chips: CapturePreviewChip[];
}

export interface ParserContext {
  /** Project/area catalog used to resolve `#name` tokens. */
  areas: Area[];
  /** "Now" for relative dates; ISO timestamp. */
  nowIso: string;
}

const TOKEN_RE =
  /(#[\p{L}\p{N}_-]+|@[\p{L}\p{N}_-]+|\^p[0-3]|!![\p{L}\p{N}_:+-]+|![\p{L}\p{N}_:+-]+|\*\d+[hm]|\+\d+[dw]|大后天|下周[一二三四五六日天]?|周[一二三四五六日天]|今天|今晚|明天|后天|(?:上午|下午|晚上|早上|中午)\d{1,2}点半?|\d{1,2}:\d{2})/giu;

interface TimeOfDay {
  hour: number;
  minute: number;
}

export function parseCaptureInput(raw: string, ctx: ParserContext): ParsedCapture {
  const labels: string[] = [];
  const unresolved: string[] = [];
  let projectId: string | undefined;
  let areaId: string | undefined;
  let priority: Priority | undefined;
  let scheduledFor: string | undefined;
  let dueAt: string | undefined;
  let timeOfDay: TimeOfDay | undefined;
  let estimateMinutes: number | undefined;
  const today = iso(todayUtc(ctx.nowIso));

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

    const date = parseDateToken(match, ctx.nowIso);
    if (date) {
      scheduledFor = date;
      if (match === '今晚') timeOfDay = { hour: 20, minute: 0 };
      return '';
    }
    const time = parseTimeToken(match);
    if (time) {
      timeOfDay = time;
      return '';
    }
    return match;
  });

  const title = stripped.replace(/\s+/g, ' ').trim();
  const startAt = timeOfDay ? formatDateTime(scheduledFor ?? today, timeOfDay) : undefined;
  if (startAt && !scheduledFor) scheduledFor = today;

  return {
    title,
    projectId,
    areaId,
    labels,
    priority,
    scheduledFor,
    dueAt,
    startAt,
    estimateMinutes,
    unresolved,
  };
}

export function buildCapturePreview(parsed: ParsedCapture, areas: Area[]): ParsedCapturePreview {
  const projectName = parsed.projectId
    ? areas.find((a) => a.id === parsed.projectId)?.name
    : undefined;
  const chips: CapturePreviewChip[] = [];

  if (projectName) chips.push({ type: 'proj', label: `#${projectName}`, value: parsed.projectId });
  for (const label of parsed.labels) chips.push({ type: 'tag', label: `@${label}`, value: label });
  if (parsed.priority) chips.push({ type: 'pri', label: `^${parsed.priority}`, value: parsed.priority });
  if (parsed.scheduledFor) chips.push({ type: 'date', label: `scheduled ${parsed.scheduledFor}`, value: parsed.scheduledFor });
  if (parsed.dueAt) chips.push({ type: 'due', label: `due ${parsed.dueAt}`, value: parsed.dueAt });
  if (parsed.startAt) chips.push({ type: 'time', label: `start ${parsed.startAt.slice(11, 16)}`, value: parsed.startAt });
  if (parsed.estimateMinutes !== undefined) {
    chips.push({ type: 'est', label: `estimate ${formatEstimate(parsed.estimateMinutes)}`, value: String(parsed.estimateMinutes) });
  }
  for (const token of parsed.unresolved) chips.push({ type: 'unresolved', label: `unresolved ${token}`, value: token });

  return { ...parsed, projectName, chips };
}

function normalizeProjectToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

/**
 * Lightweight date phrase parser. Returns ISO date (YYYY-MM-DD) when input
 * matches; undefined otherwise. Supports:
 *   today, tomorrow, tomo, tom
 *   mon..sun, monday..sunday (next occurrence >= tomorrow if today is same)
 *   next-mon..next-sun
 *   YYYY-MM-DD
 *   今天, 今晚, 明天, 后天, 大后天, 周一..周日, 下周, 下周一..下周日
 *   +3d, +2w
 *   due-today / due-tomorrow / due-<weekday> are tolerated for the !! prefix
 */
export function parseDateToken(raw: string, nowIso: string): string | undefined {
  const phrase = raw.toLowerCase().replace(/^due-/, '').replace(/_/g, '-').trim();
  const today = todayUtc(nowIso);

  if (phrase === 'today' || phrase === '今天' || phrase === '今晚') return iso(today);
  if (phrase === 'tomorrow' || phrase === 'tomo' || phrase === 'tom' || phrase === '明天') {
    return iso(today + 86_400_000);
  }
  if (phrase === '后天') return iso(today + 2 * 86_400_000);
  if (phrase === '大后天') return iso(today + 3 * 86_400_000);

  const offsetMatch = /^\+(\d+)([dw])$/.exec(phrase);
  if (offsetMatch) {
    const n = Number(offsetMatch[1]);
    const days = offsetMatch[2] === 'w' ? n * 7 : n;
    return iso(today + days * 86_400_000);
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
  let targetDow = weekdayMap[wdName];

  const chineseWeekdayMap: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0,
  };
  if (phrase === '下周') return iso(today + daysUntilWeekday(today, 1) * 86_400_000);
  const chineseWeekday = /^(下)?周([一二三四五六日天])$/.exec(phrase);
  const chineseNext = chineseWeekday?.[1] === '下';
  if (chineseWeekday) targetDow = chineseWeekdayMap[chineseWeekday[2]!];
  if (targetDow === undefined) return undefined;

  let delta = daysUntilWeekday(today, targetDow);
  if (next || chineseNext) delta += 7; // "next-fri" / "下周五" -> Friday of next week.
  return iso(today + delta * 86_400_000);
}

function parseTimeToken(raw: string): TimeOfDay | undefined {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (clock) return validTime(Number(clock[1]), Number(clock[2]));

  const chinese = /^(上午|下午|晚上|早上|中午)(\d{1,2})点(半?)$/.exec(raw);
  if (!chinese) return undefined;
  const period = chinese[1]!;
  let hour = Number(chinese[2]);
  const minute = chinese[3] ? 30 : 0;

  if (period === '上午' || period === '早上') {
    if (hour === 12) hour = 0;
  } else if (period === '下午' || period === '晚上') {
    if (hour < 12) hour += 12;
  } else if (period === '中午' && hour < 11) {
    hour += 12;
  }
  return validTime(hour, minute);
}

function validTime(hour: number, minute: number): TimeOfDay | undefined {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return { hour, minute };
}

function todayUtc(nowIso: string): number {
  const now = new Date(nowIso);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function daysUntilWeekday(today: number, targetDow: number): number {
  const todayDow = new Date(today).getUTCDay();
  let delta = (targetDow - todayDow + 7) % 7;
  if (delta === 0) delta = 7;
  return delta;
}

function formatDateTime(date: string, time: TimeOfDay): string {
  const hh = String(time.hour).padStart(2, '0');
  const mm = String(time.minute).padStart(2, '0');
  return `${date}T${hh}:${mm}:00.000Z`;
}

function formatEstimate(minutes: number): string {
  if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
