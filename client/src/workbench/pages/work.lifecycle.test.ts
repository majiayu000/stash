import { describe, expect, test } from 'vitest';
import type { WBTodo } from '../data';
import { groupTodosForBoard, moveInputForColumn } from './work.lifecycle';

describe('Work lifecycle grouping', () => {
  const now = new Date('2026-05-14T10:00:00.000Z');

  test('uses status and canonical today fields instead of project presence', () => {
    const groups = groupTodosForBoard([
      todo({ id: 'inbox', status: 'inbox', project: 'area-a' }),
      todo({ id: 'pin', status: 'planned', todayPinned: true }),
      todo({ id: 'scheduled', status: 'planned', scheduledFor: '2026-05-14' }),
      todo({ id: 'started', status: 'planned', startAt: '2026-05-14T09:00:00.000Z' }),
      todo({ id: 'overdue', status: 'planned', dueAt: '2026-05-13T20:00:00.000Z' }),
      todo({ id: 'active', status: 'active', scheduledFor: '2026-05-14' }),
      todo({ id: 'later', status: 'planned', scheduledFor: '2026-05-20' }),
      todo({ id: 'done', status: 'done', done: true, completedAt: '2026-05-14T09:00:00.000Z' }),
    ], new Set(), now);

    expect(groups.inbox.map((item) => item.id)).toEqual(['inbox']);
    expect(groups.today[0]?.id).toBe('pin');
    expect(new Set(groups.today.map((item) => item.id))).toEqual(new Set(['pin', 'overdue', 'scheduled', 'started']));
    expect(groups.doing.map((item) => item.id)).toEqual(['active']);
    expect(groups.later.map((item) => item.id)).toEqual(['later']);
    expect(groups.done.map((item) => item.id)).toEqual(['done']);
  });

  test('moving out of today clears fields that would keep the item in canonical today', () => {
    expect(moveInputForColumn('later', '2026-05-14')).toMatchObject({
      status: 'planned',
      todayPinned: false,
      scheduledFor: null,
      startAt: null,
      dueAt: null,
      sortOrder: null,
    });
  });
});

function todo(input: Partial<WBTodo> & { id: string }): WBTodo {
  return {
    text: input.id,
    project: null,
    tags: [],
    done: false,
    status: 'planned',
    priority: 'p2',
    kind: 'task',
    todayPinned: false,
    updatedAt: '2026-05-14T08:00:00.000Z',
    recurring: false,
    reminding: false,
    ...input,
  };
}
