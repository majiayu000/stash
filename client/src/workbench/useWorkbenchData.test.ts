import { describe, expect, test } from 'vitest';
import type { WorkItem } from '@stash/shared';
import {
  next_calendar_refresh_at,
  workboardProjectsFromItems,
} from './useWorkbenchData';

function item(id: string, projectId: string | undefined, status: WorkItem['status']): WorkItem {
  return {
    id,
    projectId,
    title: id,
    kind: 'task',
    status,
    priority: 'p2',
    source: 'manual',
    confidence: 'explicit',
    assignee: 'human',
    labels: [],
    checklist: [],
    links: [],
    todayPinned: false,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  };
}

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

describe('workboardProjectsFromItems', () => {
  test('builds truthful review-core project counts without waiting for sessions', () => {
    expect(workboardProjectsFromItems([
      item('active', 'project-a', 'active'),
      item('blocked', 'project-a', 'blocked'),
      item('planned', 'project-b', 'planned'),
      item('unassigned', undefined, 'inbox'),
    ])).toEqual([
      expect.objectContaining({
        projectId: 'project-a',
        itemCount: 2,
        activeCount: 1,
        blockedCount: 1,
        sessions: [],
      }),
      expect.objectContaining({
        projectId: 'project-b',
        itemCount: 1,
        activeCount: 0,
        blockedCount: 0,
        sessions: [],
      }),
    ]);
  });
});
