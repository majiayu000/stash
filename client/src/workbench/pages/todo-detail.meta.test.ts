import { describe, expect, test } from 'vitest';
import { toLocalDateTime } from './todo-detail.meta';

describe('toLocalDateTime', () => {
  test('projects UTC reminders into the server zone, not the browser zone', () => {
    expect(toLocalDateTime('2026-05-14T10:30:00.000Z', 'Asia/Shanghai'))
      .toBe('2026-05-14T18:30');
    expect(toLocalDateTime('2026-05-14T10:30:00.000Z', 'America/Los_Angeles'))
      .toBe('2026-05-14T03:30');
  });

  test('returns blank for invalid persisted instants instead of inventing a time', () => {
    expect(toLocalDateTime('not-an-instant', 'UTC')).toBe('');
  });
});
