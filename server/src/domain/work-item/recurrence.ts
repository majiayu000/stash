import type { RecurrenceRule, WorkItem } from '@stash/shared';

/**
 * SPEC v0.3 §3c — minimal recurrence engine.
 *
 * computeNextDate(): given a recurrence rule + the anchor date (scheduledFor
 * or completedAt for after_completion), returns the next ISO date (YYYY-MM-DD)
 * the next instance should land on, or undefined if the rule has expired.
 */
export function computeNextDate(rule: RecurrenceRule, anchor: string): string | undefined {
  if (rule.type === 'after_completion') {
    const offset = rule.offsetDays ?? 1;
    return shiftIsoDate(anchor, offset);
  }
  if (rule.type !== 'rrule') return undefined;
  if (!rule.freq) return undefined;
  if (rule.until && anchor >= rule.until) return undefined;

  const interval = rule.interval ?? 1;
  if (rule.freq === 'DAILY') {
    return shiftIsoDate(anchor, interval);
  }
  if (rule.freq === 'WEEKLY') {
    if (rule.byDay && rule.byDay.length > 0) {
      const target = nextWeekdayMatch(anchor, rule.byDay);
      if (target) return target;
      // fall through: jump full interval
    }
    return shiftIsoDate(anchor, 7 * interval);
  }
  if (rule.freq === 'MONTHLY') {
    return shiftIsoMonths(anchor, interval);
  }
  return undefined;
}

const WEEKDAY_INDEX: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function nextWeekdayMatch(anchorIso: string, byDay: string[]): string | undefined {
  const targets = byDay.map((d) => WEEKDAY_INDEX[d]).filter((n): n is number => n !== undefined);
  if (targets.length === 0) return undefined;
  const anchor = parseDate(anchorIso);
  for (let d = 1; d <= 7; d++) {
    const next = anchor + d * 86_400_000;
    if (targets.includes(new Date(next).getUTCDay())) return isoDate(next);
  }
  return undefined;
}

function shiftIsoDate(iso: string, days: number): string {
  return isoDate(parseDate(iso) + days * 86_400_000);
}

function shiftIsoMonths(iso: string, months: number): string {
  // Clamp day to target month's last day so Jan 31 + 1mo lands on Feb 28/29,
  // not March 3 (which is what raw `new Date(UTC(y, m+1, 31))` does).
  const d = new Date(parseDate(iso));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(y, m + months, Math.min(day, lastDayOfTarget)));
  return isoDate(target.getTime());
}

function parseDate(iso: string): number {
  // Accepts YYYY-MM-DD or full ISO; both round to UTC midnight of that date.
  const date = iso.length >= 10 ? iso.slice(0, 10) : iso;
  return Date.parse(date + 'T00:00:00.000Z');
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build the next-instance WorkItem payload from a completed recurring item.
 * Caller passes the now ISO + new id; this returns a CreateWorkItemInput-shape
 * object the service can `create()`.
 */
export function nextInstanceFromCompleted(
  completed: WorkItem,
  nowIso: string,
): { scheduledFor?: string; dueAt?: string; startAt?: string } | undefined {
  if (!completed.recurrence) return undefined;
  const rule = completed.recurrence;
  const anchorIso =
    rule.type === 'after_completion'
      ? (completed.completedAt ?? nowIso)
      : (completed.scheduledFor ?? nowIso.slice(0, 10));
  const nextScheduled = computeNextDate(rule, anchorIso);
  if (!nextScheduled) return undefined;
  return {
    scheduledFor: nextScheduled,
    dueAt: completed.dueAt ? shiftIsoDate(completed.dueAt, daysBetween(anchorIso, nextScheduled)) : undefined,
    startAt: completed.startAt ? shiftIsoDate(completed.startAt.slice(0, 10), daysBetween(anchorIso, nextScheduled)) : undefined,
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b) - parseDate(a)) / 86_400_000);
}
