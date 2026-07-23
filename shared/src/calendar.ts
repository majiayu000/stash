export type CalendarPeriod = 'day' | 'week' | 'month' | 'quarter';

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export interface ZonedDateTimeParts extends CalendarDateParts {
  hour: number;
  minute: number;
  second: number;
}

export interface CalendarRange {
  start: string;
  end: string;
  startDate: string;
  endDateExclusive: string;
}

const formatter_cache = new Map<string, Intl.DateTimeFormat>();
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function assert_time_zone(value: string): string {
  const supported = Intl.supportedValuesOf('timeZone');
  if (value !== 'UTC' && !supported.includes(value)) {
    throw new Error(`unsupported IANA time zone: ${value}`);
  }
  new Intl.DateTimeFormat('en-CA', { timeZone: value }).format();
  return value;
}

export function zoned_parts(instant: number | Date | string, time_zone: string): ZonedDateTimeParts {
  assert_time_zone(time_zone);
  const instant_ms = to_instant_ms(instant);
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatter_for(time_zone).formatToParts(instant_ms)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const parts: ZonedDateTimeParts = {
    year: required_part(values.year, 'year'),
    month: required_part(values.month, 'month'),
    day: required_part(values.day, 'day'),
    hour: required_part(values.hour, 'hour'),
    minute: required_part(values.minute, 'minute'),
    second: required_part(values.second, 'second'),
  };
  assert_wall_parts(parts);
  return parts;
}

export function calendar_date_at(instant: number | Date | string, time_zone: string): string {
  return format_calendar_date(zoned_parts(instant, time_zone));
}

export function parse_calendar_date(value: string): CalendarDateParts {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`invalid calendar date: ${value}`);
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  assert_calendar_parts(parts);
  return parts;
}

export function parse_local_date_time(value: string): ZonedDateTimeParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) throw new Error(`invalid local date-time: ${value}`);
  const parts: ZonedDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0,
  };
  assert_wall_parts(parts);
  return parts;
}

export function assert_utc_instant(value: string): string {
  if (!value.endsWith('Z') || !Number.isFinite(new Date(value).getTime())) {
    throw new Error(`invalid UTC instant: ${value}`);
  }
  return value;
}

export function format_calendar_date(parts: CalendarDateParts): string {
  assert_calendar_parts(parts);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function add_calendar_days(value: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error(`calendar day delta must be an integer: ${days}`);
  const parts = parse_calendar_date(value);
  return format_calendar_date(civil_from_days(days_from_civil(parts) + days));
}

export function calendar_day_of_week(value: string): number {
  const days = days_from_civil(parse_calendar_date(value));
  return positive_mod(days + 4, 7);
}

export function calendar_period_range(
  period: CalendarPeriod,
  instant: number | Date | string,
  time_zone: string,
): CalendarRange {
  const current = parse_calendar_date(calendar_date_at(instant, time_zone));
  let start = current;
  let end: CalendarDateParts;
  if (period === 'day') {
    end = parse_calendar_date(add_calendar_days(format_calendar_date(start), 1));
  } else if (period === 'week') {
    const monday_delta = (calendar_day_of_week(format_calendar_date(start)) + 6) % 7;
    start = parse_calendar_date(add_calendar_days(format_calendar_date(start), -monday_delta));
    end = parse_calendar_date(add_calendar_days(format_calendar_date(start), 7));
  } else if (period === 'month') {
    start = { year: current.year, month: current.month, day: 1 };
    end = add_calendar_months(start, 1);
  } else {
    const quarter_month = Math.floor((current.month - 1) / 3) * 3 + 1;
    start = { year: current.year, month: quarter_month, day: 1 };
    end = add_calendar_months(start, 3);
  }
  return range_from_dates(format_calendar_date(start), format_calendar_date(end), time_zone);
}

export function range_from_dates(
  start_date: string,
  end_date_exclusive: string,
  time_zone: string,
): CalendarRange {
  const start = zoned_date_time_to_instant(
    { ...parse_calendar_date(start_date), hour: 0, minute: 0, second: 0 },
    time_zone,
  );
  const end = zoned_date_time_to_instant(
    { ...parse_calendar_date(end_date_exclusive), hour: 0, minute: 0, second: 0 },
    time_zone,
  );
  if (end <= start) throw new Error('calendar range end must be after start');
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    startDate: start_date,
    endDateExclusive: end_date_exclusive,
  };
}

export function zoned_date_time_to_instant(
  requested: ZonedDateTimeParts,
  time_zone: string,
): number {
  assert_time_zone(time_zone);
  assert_wall_parts(requested);
  const wall_ms = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
    requested.second,
  );
  const before_offset = offset_at(wall_ms - 36 * 3_600_000, time_zone);
  const after_offset = offset_at(wall_ms + 36 * 3_600_000, time_zone);
  const offsets = new Set([
    before_offset,
    offset_at(wall_ms, time_zone),
    after_offset,
  ]);
  const matches = [...offsets]
    .map((offset) => wall_ms - offset)
    .filter((candidate) => same_wall_parts(zoned_parts(candidate, time_zone), requested))
    .sort((left, right) => left - right);
  if (matches[0] !== undefined) return matches[0];

  const gap_ms = after_offset - before_offset;
  if (gap_ms > 0) {
    const shifted_candidate = wall_ms - before_offset;
    const shifted_request = wall_parts_from_utc_shape(wall_ms + gap_ms);
    if (same_wall_parts(zoned_parts(shifted_candidate, time_zone), shifted_request)) {
      return shifted_candidate;
    }
  }
  throw new Error(
    `cannot resolve local date-time ${format_wall_parts(requested)} in ${time_zone}`,
  );
}

function formatter_for(time_zone: string): Intl.DateTimeFormat {
  const cached = formatter_cache.get(time_zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone: time_zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatter_cache.set(time_zone, formatter);
  return formatter;
}

function offset_at(instant_ms: number, time_zone: string): number {
  const projected = zoned_parts(instant_ms, time_zone);
  const projected_ms = Date.UTC(
    projected.year,
    projected.month - 1,
    projected.day,
    projected.hour,
    projected.minute,
    projected.second,
  );
  return projected_ms - Math.floor(instant_ms / 1_000) * 1_000;
}

function to_instant_ms(value: number | Date | string): number {
  const instant_ms = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(instant_ms)) throw new Error(`invalid instant: ${String(value)}`);
  return instant_ms;
}

function assert_wall_parts(parts: ZonedDateTimeParts): void {
  assert_calendar_parts(parts);
  if (
    !Number.isInteger(parts.hour) || parts.hour < 0 || parts.hour > 23
    || !Number.isInteger(parts.minute) || parts.minute < 0 || parts.minute > 59
    || !Number.isInteger(parts.second) || parts.second < 0 || parts.second > 59
  ) {
    throw new Error(`invalid wall-clock time: ${format_wall_parts(parts)}`);
  }
}

function assert_calendar_parts(parts: CalendarDateParts): void {
  if (
    !Number.isInteger(parts.year) || parts.year < 1 || parts.year > 9_999
    || !Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12
    || !Number.isInteger(parts.day)
    || parts.day < 1
    || parts.day > days_in_month(parts.year, parts.month)
  ) {
    throw new Error(`invalid calendar date parts: ${JSON.stringify(parts)}`);
  }
}

function days_in_month(year: number, month: number): number {
  if (month === 2) return is_leap_year(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function is_leap_year(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function add_calendar_months(parts: CalendarDateParts, months: number): CalendarDateParts {
  const month_index = parts.year * 12 + parts.month - 1 + months;
  const year = Math.floor(month_index / 12);
  const month = positive_mod(month_index, 12) + 1;
  return { year, month, day: Math.min(parts.day, days_in_month(year, month)) };
}

function days_from_civil(parts: CalendarDateParts): number {
  let year = parts.year;
  const month = parts.month;
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const year_of_era = year - era * 400;
  const shifted_month = month + (month > 2 ? -3 : 9);
  const day_of_year = Math.floor((153 * shifted_month + 2) / 5) + parts.day - 1;
  const day_of_era = year_of_era * 365
    + Math.floor(year_of_era / 4)
    - Math.floor(year_of_era / 100)
    + day_of_year;
  return era * 146_097 + day_of_era - 719_468;
}

function civil_from_days(epoch_days: number): CalendarDateParts {
  const shifted = epoch_days + 719_468;
  const era = Math.floor(shifted / 146_097);
  const day_of_era = shifted - era * 146_097;
  const year_of_era = Math.floor(
    (day_of_era - Math.floor(day_of_era / 1_460) + Math.floor(day_of_era / 36_524)
      - Math.floor(day_of_era / 146_096)) / 365,
  );
  let year = year_of_era + era * 400;
  const day_of_year = day_of_era
    - (365 * year_of_era + Math.floor(year_of_era / 4) - Math.floor(year_of_era / 100));
  const month_prime = Math.floor((5 * day_of_year + 2) / 153);
  const day = day_of_year - Math.floor((153 * month_prime + 2) / 5) + 1;
  const month = month_prime + (month_prime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function wall_parts_from_utc_shape(wall_ms: number): ZonedDateTimeParts {
  const value = new Date(wall_ms);
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
  };
}

function same_wall_parts(left: ZonedDateTimeParts, right: ZonedDateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second;
}

function required_part(value: number | undefined, name: string): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`time zone formatter omitted ${name}`);
  }
  return value;
}

function format_wall_parts(parts: ZonedDateTimeParts): string {
  return `${format_calendar_date(parts)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function positive_mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
