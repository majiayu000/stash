import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { computeNextDate } from './recurrence.js';
import { WorkItemService } from './service.js';

describe('computeNextDate', () => {
  test('DAILY interval 1', () => {
    expect(computeNextDate({ type: 'rrule', freq: 'DAILY', interval: 1 }, '2026-05-14')).toBe('2026-05-15');
  });

  test('DAILY interval 3', () => {
    expect(computeNextDate({ type: 'rrule', freq: 'DAILY', interval: 3 }, '2026-05-14')).toBe('2026-05-17');
  });

  test('WEEKLY byDay picks the next matching weekday', () => {
    // 2026-05-14 is a Thursday. Next FR is 2026-05-15.
    expect(
      computeNextDate({ type: 'rrule', freq: 'WEEKLY', byDay: ['FR'] }, '2026-05-14'),
    ).toBe('2026-05-15');
    // From Friday, byDay=[MO] → next Mon = 2026-05-18.
    expect(
      computeNextDate({ type: 'rrule', freq: 'WEEKLY', byDay: ['MO'] }, '2026-05-15'),
    ).toBe('2026-05-18');
  });

  test('WEEKLY no byDay jumps by 7 days × interval', () => {
    expect(
      computeNextDate({ type: 'rrule', freq: 'WEEKLY', interval: 2 }, '2026-05-14'),
    ).toBe('2026-05-28');
  });

  test('MONTHLY shifts by N months', () => {
    expect(
      computeNextDate({ type: 'rrule', freq: 'MONTHLY', interval: 1 }, '2026-05-14'),
    ).toBe('2026-06-14');
  });

  test('MONTHLY clamps day to target month length (Jan 31 → Feb 28/29, not Mar 3)', () => {
    // 2026 is not a leap year — Feb has 28 days
    expect(
      computeNextDate({ type: 'rrule', freq: 'MONTHLY', interval: 1 }, '2026-01-31'),
    ).toBe('2026-02-28');
    // 2028 is a leap year — Feb has 29 days
    expect(
      computeNextDate({ type: 'rrule', freq: 'MONTHLY', interval: 1 }, '2028-01-31'),
    ).toBe('2028-02-29');
    // 30th of a month that maps to a 30-day target → unchanged
    expect(
      computeNextDate({ type: 'rrule', freq: 'MONTHLY', interval: 1 }, '2026-05-30'),
    ).toBe('2026-06-30');
  });

  test('UNTIL guard returns undefined when anchor reaches the limit', () => {
    expect(
      computeNextDate(
        { type: 'rrule', freq: 'DAILY', until: '2026-05-14' },
        '2026-05-15',
      ),
    ).toBeUndefined();
  });

  test('after_completion offsets from anchor', () => {
    expect(
      computeNextDate({ type: 'after_completion', offsetDays: 3 }, '2026-05-14'),
    ).toBe('2026-05-17');
  });
});

describe('WorkItemService recurrence auto-instance', () => {
  test('marking a recurring item done inserts the next instance', () => {
    const db = freshDb();
    const service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    const item = service.create({
      title: 'standup notes',
      kind: 'task',
      status: 'planned',
      scheduledFor: '2026-05-14',
      recurrence: { type: 'rrule', freq: 'DAILY', interval: 1 },
    });
    service.update(item.id, { status: 'done' });

    const all = service.list({ includeDropped: true });
    const open = all.filter((i) => i.status !== 'done' && i.id !== item.id);
    expect(open.length).toBe(1);
    expect(open[0]?.scheduledFor).toBe('2026-05-15');
    expect(open[0]?.recurrence?.type).toBe('rrule');
  });

  test('after_completion mode shifts from completedAt', () => {
    const db = freshDb();
    const service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    const item = service.create({
      title: 'water plants',
      kind: 'task',
      status: 'planned',
      recurrence: { type: 'after_completion', offsetDays: 4 },
    });
    service.update(item.id, { status: 'done' });

    const next = service.list({ includeDropped: true }).find((i) => i.status !== 'done' && i.id !== item.id);
    expect(next?.scheduledFor).toBe('2026-05-18');
  });

  test('non-recurring done does not insert anything', () => {
    const db = freshDb();
    const service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    const item = service.create({ title: 'one-off' });
    service.update(item.id, { status: 'done' });
    const remaining = service.list({}).filter((i) => i.status !== 'done');
    expect(remaining.length).toBe(0);
  });
});

describe('WorkItemService.today canonical query', () => {
  test('includes pinned, scheduled-for-today, overdue, and started items', () => {
    const db = freshDb();
    const service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    const pinned    = service.create({ title: 'pin',   todayPinned: true });
    const sched     = service.create({ title: 'sched', scheduledFor: '2026-05-14' });
    const overdue   = service.create({ title: 'over',  dueAt: '2026-05-10T00:00:00.000Z' });
    const future    = service.create({ title: 'next',  scheduledFor: '2026-05-20' });
    service.create({ title: 'someday',  status: 'someday' });

    const ids = service.today().map((i) => i.id);
    expect(ids).toContain(pinned.id);
    expect(ids).toContain(sched.id);
    expect(ids).toContain(overdue.id);
    expect(ids).not.toContain(future.id);
    expect(ids[0]).toBe(pinned.id);
  });

  test('done items are excluded', () => {
    const db = freshDb();
    const service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    const item = service.create({ title: 'old', scheduledFor: '2026-05-14' });
    service.update(item.id, { status: 'done' });
    expect(service.today().some((i) => i.id === item.id)).toBe(false);
  });
});
