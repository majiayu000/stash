const DAY_MS = 86_400_000;
const ISO_WEEK_RE = /^(\d{4})-W(\d{2})$/;

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export interface WeekdaySlot {
  key: WeekdayKey;
  label: string;
  isoDate: string;
}

export interface IsoWeekRange {
  week: string;
  startDate: string;
  endDate: string;
  endExclusiveDate: string;
  days: WeekdaySlot[];
}

const WEEKDAYS: Array<{ key: WeekdayKey; label: string }> = [
  { key: 'mon', label: 'mon' },
  { key: 'tue', label: 'tue' },
  { key: 'wed', label: 'wed' },
  { key: 'thu', label: 'thu' },
  { key: 'fri', label: 'fri' },
];

export function isIsoWeekLabel(input: string | null | undefined): input is string {
  return typeof input === 'string' && ISO_WEEK_RE.test(input);
}

export function shiftIsoWeek(week: string, deltaWeeks: number): string {
  const startMs = startMsForIsoWeekLabel(week);
  return isoWeekLabelFromDate(new Date(startMs + deltaWeeks * 7 * DAY_MS));
}

export function isoWeekRange(week: string): IsoWeekRange {
  const normalized = normalizeIsoWeek(week);
  const startMs = startMsForIsoWeekLabel(normalized);
  const days = WEEKDAYS.map((day, index) => ({
    ...day,
    isoDate: toIsoDateOnly(startMs + index * DAY_MS),
  }));

  return {
    week: normalized,
    startDate: toIsoDateOnly(startMs),
    endDate: toIsoDateOnly(startMs + 6 * DAY_MS),
    endExclusiveDate: toIsoDateOnly(startMs + 7 * DAY_MS),
    days,
  };
}

export function nextIsoWeekRange(week: string): IsoWeekRange {
  return isoWeekRange(shiftIsoWeek(week, 1));
}

export function dateInRange(date: string | undefined, range: IsoWeekRange): boolean {
  return !!date && date >= range.startDate && date <= range.endDate;
}

function normalizeIsoWeek(week: string): string {
  const match = ISO_WEEK_RE.exec(week);
  if (!match?.[1] || !match[2]) throw new Error(`invalid ISO week: ${week}`);
  return `${match[1]}-W${match[2]}`;
}

function startMsForIsoWeekLabel(week: string): number {
  const match = ISO_WEEK_RE.exec(week);
  if (!match?.[1] || !match[2]) throw new Error(`invalid ISO week: ${week}`);
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Mon = jan4 - jan4Dow * DAY_MS;
  return week1Mon + (isoWeek - 1) * 7 * DAY_MS;
}

function isoWeekLabelFromDate(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);

  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function toIsoDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
