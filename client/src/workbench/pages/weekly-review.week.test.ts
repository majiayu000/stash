import { describe, expect, test } from 'vitest';
import { isIsoWeekLabel, isoWeekRange, nextIsoWeekRange, shiftIsoWeek } from './weekly-review.week';

describe('Weekly review ISO week helpers', () => {
  test('builds the current week range and weekday slots', () => {
    const range = isoWeekRange('2026-W20');

    expect(range.startDate).toBe('2026-05-11');
    expect(range.endDate).toBe('2026-05-17');
    expect(range.endExclusiveDate).toBe('2026-05-18');
    expect(range.days.map((day) => `${day.key}:${day.isoDate}`)).toEqual([
      'mon:2026-05-11',
      'tue:2026-05-12',
      'wed:2026-05-13',
      'thu:2026-05-14',
      'fri:2026-05-15',
    ]);
  });

  test('navigates across ISO week boundaries', () => {
    expect(shiftIsoWeek('2026-W20', -1)).toBe('2026-W19');
    expect(shiftIsoWeek('2026-W20', 1)).toBe('2026-W21');
    expect(shiftIsoWeek('2026-W01', -1)).toBe('2025-W52');
  });

  test('rejects syntactically valid week labels that do not exist', () => {
    expect(isIsoWeekLabel('2025-W53')).toBe(false);
    expect(() => isoWeekRange('2025-W53')).toThrow('invalid ISO week');
  });

  test('returns the persisted planning range for the next week', () => {
    const range = nextIsoWeekRange('2026-W20');

    expect(range.week).toBe('2026-W21');
    expect(range.days.map((day) => day.isoDate)).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
    ]);
  });
});
