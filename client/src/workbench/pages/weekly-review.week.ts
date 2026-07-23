import {
  add_calendar_days,
  calendar_day_of_week,
  format_calendar_date,
  parse_calendar_date,
} from '@stash/shared';

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
  if (typeof input !== 'string') return false;
  try {
    return normalizeIsoWeek(input) === input;
  } catch {
    return false;
  }
}

export function shiftIsoWeek(week: string, deltaWeeks: number): string {
  if (!Number.isInteger(deltaWeeks)) throw new Error(`week delta must be an integer: ${deltaWeeks}`);
  const startDate = isoWeekRange(week).startDate;
  return isoWeekLabelFromCalendarDate(add_calendar_days(startDate, deltaWeeks * 7));
}

export function isoWeekRange(week: string): IsoWeekRange {
  const normalized = normalizeIsoWeek(week);
  const startDate = startDateForIsoWeekLabel(normalized);
  const days = WEEKDAYS.map((day, index) => ({
    ...day,
    isoDate: add_calendar_days(startDate, index),
  }));

  return {
    week: normalized,
    startDate,
    endDate: add_calendar_days(startDate, 6),
    endExclusiveDate: add_calendar_days(startDate, 7),
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
  const normalized = `${match[1]}-W${match[2]}`;
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  if (isoWeek < 1 || isoWeek > 53) throw new Error(`invalid ISO week: ${week}`);
  const startDate = startDateForIsoWeek(isoYear, isoWeek);
  if (isoWeekLabelFromCalendarDate(startDate) !== normalized) {
    throw new Error(`invalid ISO week: ${week}`);
  }
  return normalized;
}

function startDateForIsoWeekLabel(week: string): string {
  const match = ISO_WEEK_RE.exec(week);
  if (!match?.[1] || !match[2]) throw new Error(`invalid ISO week: ${week}`);
  return startDateForIsoWeek(Number(match[1]), Number(match[2]));
}

function startDateForIsoWeek(isoYear: number, isoWeek: number): string {
  const jan4 = format_calendar_date({ year: isoYear, month: 1, day: 4 });
  const mondayIndex = (calendar_day_of_week(jan4) + 6) % 7;
  return add_calendar_days(jan4, -mondayIndex + (isoWeek - 1) * 7);
}

function isoWeekLabelFromCalendarDate(date: string): string {
  const mondayIndex = (calendar_day_of_week(date) + 6) % 7;
  const monday = add_calendar_days(date, -mondayIndex);
  const thursday = add_calendar_days(monday, 3);
  const isoYear = parse_calendar_date(thursday).year;
  const weekOne = startDateForIsoWeek(isoYear, 1);
  for (let week = 1; week <= 53; week += 1) {
    if (add_calendar_days(weekOne, (week - 1) * 7) === monday) {
      return `${isoYear}-W${String(week).padStart(2, '0')}`;
    }
  }
  throw new Error(`cannot resolve ISO week for ${date}`);
}
