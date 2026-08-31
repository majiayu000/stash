import { describe, expect, test } from 'vitest';
import type { WBTodo } from '../workbench/data';
import { buildDailyRecommendations, estimatedPlanMinutes, isMyDayTodo, sortMyDay } from './planning';

function nextTodo(overrides: Partial<WBTodo>): WBTodo {
  return {
    id: 'todo', text: 'A task', project: null, tags: [], done: false,
    status: 'planned', priority: 'p2', kind: 'task', todayPinned: false,
    updatedAt: '2026-08-20T08:00:00.000Z', recurring: false, reminding: false,
    ...overrides,
  };
}

describe('Stash Next daily planning', () => {
  test('ranks active and time-critical work with visible reasons', () => {
    const recommendations = buildDailyRecommendations([
      nextTodo({ id: 'normal', text: 'Normal task', priority: 'p2' }),
      nextTodo({ id: 'active', text: 'Active task', status: 'active', priority: 'p3' }),
      nextTodo({ id: 'overdue', text: 'Overdue task', scheduledFor: '2026-08-26', priority: 'p1' }),
      nextTodo({ id: 'blocked', text: 'Blocked task', status: 'blocked', priority: 'p0' }),
      nextTodo({ id: 'inbox', text: 'Inbox task', status: 'inbox', priority: 'p0' }),
    ], '2026-08-27', '2026-08-27T09:00:00.000Z');

    expect(recommendations.map((item) => item.todo.id)).toEqual(['active', 'overdue', 'normal']);
    expect(recommendations[0]?.reasons).toContain('Already in progress');
    expect(recommendations[1]?.reasons).toContain('Overdue');
  });

  test('builds My Day from active, pinned, due, and scheduled work', () => {
    const calendarDate = '2026-08-27';
    const items = [
      nextTodo({ id: 'active', status: 'active' }),
      nextTodo({ id: 'pinned', todayPinned: true, sortOrder: 2 }),
      nextTodo({ id: 'due', dueAt: calendarDate, sortOrder: 1 }),
      nextTodo({ id: 'later', scheduledFor: '2026-08-30' }),
    ];

    expect(items.filter((item) => isMyDayTodo(item, calendarDate)).map((item) => item.id)).toEqual(['active', 'pinned', 'due']);
    expect(sortMyDay(items.slice(0, 3)).map((item) => item.id)).toEqual(['due', 'pinned', 'active']);
  });

  test('uses explicit estimates and a visible fallback for plan capacity', () => {
    const recommendations = buildDailyRecommendations([
      nextTodo({ id: 'estimated', priority: 'p0', estimateMinutes: 75 }),
      nextTodo({ id: 'fallback', priority: 'p1' }),
    ], '2026-08-27', '2026-08-27T09:00:00.000Z');

    expect(estimatedPlanMinutes(recommendations)).toBe(105);
  });
});
