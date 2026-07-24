import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WeeklySnapshot } from '@stash/shared';
import { apiGet } from './client';

vi.mock('./client', () => ({
  apiGet: vi.fn(),
}));

function weeklySnapshot(week: string): WeeklySnapshot {
  return {
    calendar: {
      timeZone: 'Asia/Shanghai',
      range: {
        start: '2026-07-20T16:00:00.000Z',
        end: '2026-07-27T16:00:00.000Z',
        startDate: '2026-07-21',
        endDateExclusive: '2026-07-28',
      },
    },
    week,
    rangeStart: '2026-07-20T16:00:00.000Z',
    rangeEnd: '2026-07-27T16:00:00.000Z',
    doneCount: 0,
    focusHours: 0,
    featuresAdvanced: [],
    sessionsByDay: [0, 0, 0, 0, 0, 0, 0],
    donePerProject: [],
    wow: {
      tokens: { now: 0, prev: 0 },
      cost: { now: 0, prev: 0 },
      sessions: { now: 0, prev: 0 },
    },
  };
}

describe('weekly analytics prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  test('shares an in-flight prefetch with the page request and reuses its fresh result', async () => {
    let resolveRequest!: (value: { data: WeeklySnapshot }) => void;
    vi.mocked(apiGet).mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const analytics = await import('./analytics');

    const prefetch = analytics.prefetchWeeklySnapshot();
    const pageRequest = analytics.getWeeklySnapshot();
    expect(apiGet).toHaveBeenCalledTimes(1);

    const expected = weeklySnapshot('2026-W30');
    resolveRequest({ data: expected });
    await expect(prefetch).resolves.toEqual(expected);
    await expect(pageRequest).resolves.toEqual(expected);
    await expect(analytics.getWeeklySnapshot()).resolves.toEqual(expected);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  test('does not cache a failed prefetch, so the visible page request can retry', async () => {
    const expected = weeklySnapshot('2026-W30');
    vi.mocked(apiGet)
      .mockRejectedValueOnce(new Error('prefetch failed'))
      .mockResolvedValueOnce({ data: expected });
    const analytics = await import('./analytics');

    await expect(analytics.prefetchWeeklySnapshot()).rejects.toThrow('prefetch failed');
    await expect(analytics.getWeeklySnapshot()).resolves.toEqual(expected);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
