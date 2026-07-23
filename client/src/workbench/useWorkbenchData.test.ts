import { describe, expect, test } from 'vitest';
import { next_calendar_refresh_at } from './useWorkbenchData';

describe('next_calendar_refresh_at', () => {
  test('targets the next configured-zone midnight across DST changes', () => {
    expect(next_calendar_refresh_at({
      timeZone: 'America/Los_Angeles',
      calendarDate: '2026-03-08',
      now: '2026-03-08T08:30:00.000Z',
    })).toBe(Date.parse('2026-03-09T07:00:00.250Z'));
    expect(next_calendar_refresh_at({
      timeZone: 'Asia/Shanghai',
      calendarDate: '2026-07-24',
      now: '2026-07-24T12:00:00.000Z',
    })).toBe(Date.parse('2026-07-24T16:00:00.250Z'));
  });
});
