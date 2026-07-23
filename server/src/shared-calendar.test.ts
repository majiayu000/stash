import { describe, expect, test } from 'bun:test';
import {
  add_calendar_days,
  assert_time_zone,
  calendar_date_at,
  calendar_day_of_week,
  calendar_period_range,
  parse_calendar_date,
  zoned_date_time_to_instant,
} from '@stash/shared';

describe('calendar time-zone contract', () => {
  test('accepts exact IANA identifiers and rejects offsets and legacy aliases', () => {
    expect(assert_time_zone('UTC')).toBe('UTC');
    expect(assert_time_zone('Asia/Shanghai')).toBe('Asia/Shanghai');
    expect(() => assert_time_zone('+01:00')).toThrow('unsupported IANA time zone');
    expect(() => assert_time_zone('US/Pacific')).toThrow('unsupported IANA time zone');
  });

  test('projects the same instant to positive and negative offset calendar dates', () => {
    const instant = '2026-07-23T16:30:00.000Z';
    expect(calendar_date_at(instant, 'Asia/Shanghai')).toBe('2026-07-24');
    expect(calendar_date_at(instant, 'America/Los_Angeles')).toBe('2026-07-23');
  });

  test('uses compatible DST disambiguation for one-hour and half-hour transitions', () => {
    expect(to_iso({
      year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0,
    }, 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
    expect(to_iso({
      year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0,
    }, 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
    expect(to_iso({
      year: 2026, month: 4, day: 5, hour: 1, minute: 45, second: 0,
    }, 'Australia/Lord_Howe')).toBe('2026-04-04T14:45:00.000Z');
    expect(to_iso({
      year: 2026, month: 10, day: 4, hour: 2, minute: 15, second: 0,
    }, 'Australia/Lord_Howe')).toBe('2026-10-03T15:45:00.000Z');
  });

  test('keeps calendar-only arithmetic exact across leap and year boundaries', () => {
    expect(add_calendar_days('2024-02-28', 1)).toBe('2024-02-29');
    expect(add_calendar_days('2024-02-29', 1)).toBe('2024-03-01');
    expect(add_calendar_days('2025-12-31', 1)).toBe('2026-01-01');
    expect(calendar_day_of_week('1970-01-01')).toBe(4);
    expect(() => parse_calendar_date('2026-02-29')).toThrow('invalid calendar date');
  });

  test('returns true 23-hour and 25-hour local-day ranges', () => {
    const spring = calendar_period_range(
      'day',
      '2026-03-08T12:00:00.000Z',
      'America/New_York',
    );
    const fall = calendar_period_range(
      'day',
      '2026-11-01T12:00:00.000Z',
      'America/New_York',
    );
    expect(Date.parse(spring.end) - Date.parse(spring.start)).toBe(23 * 3_600_000);
    expect(Date.parse(fall.end) - Date.parse(fall.start)).toBe(25 * 3_600_000);
  });

  test('computes local week, month, and quarter boundaries', () => {
    const instant = '2026-05-14T12:00:00.000Z';
    expect(calendar_period_range('week', instant, 'Asia/Shanghai')).toMatchObject({
      startDate: '2026-05-11',
      endDateExclusive: '2026-05-18',
    });
    expect(calendar_period_range('month', instant, 'Asia/Shanghai')).toMatchObject({
      startDate: '2026-05-01',
      endDateExclusive: '2026-06-01',
    });
    expect(calendar_period_range('quarter', instant, 'Asia/Shanghai')).toMatchObject({
      startDate: '2026-04-01',
      endDateExclusive: '2026-07-01',
    });
  });
});

function to_iso(
  parts: Parameters<typeof zoned_date_time_to_instant>[0],
  time_zone: string,
): string {
  return new Date(zoned_date_time_to_instant(parts, time_zone)).toISOString();
}
