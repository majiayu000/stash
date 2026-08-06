import { describe, expect, test } from 'vitest';
import type { AgentSession, WorkItem } from '@stash/shared';
import {
  next_calendar_refresh_at,
  withProjectSessions,
  workboardProjectsFromItems,
} from './useWorkbenchData';

function session(id: string): AgentSession {
  return {
    id,
    provider: 'claude',
    sourcePath: `/tmp/${id}.jsonl`,
    cwd: '/tmp',
    status: 'idle',
    title: id,
    filesTouched: [],
    toolCount: 0,
    messageCount: 0,
    lastActiveAt: '2026-07-11T00:00:00.000Z',
  };
}

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

describe('withProjectSessions', () => {
  // /api/workboard no longer echoes work items, so the client shapes projects
  // from its own list and only merges in the link-derived sessions.
  const projects = workboardProjectsFromItems([
    item('a', 'project-a', 'active'),
    item('b', 'project-b', 'planned'),
  ]);

  test('attaches each group to its project and leaves the counts alone', () => {
    const merged = withProjectSessions(projects, [
      { projectId: 'project-b', sessions: [session('sess-1'), session('sess-2')] },
    ]);

    expect(merged.find((p) => p.projectId === 'project-b')).toMatchObject({
      itemCount: 1,
      activeCount: 0,
      sessions: [{ id: 'sess-1' }, { id: 'sess-2' }],
    });
  });

  test('gives projects with no linked sessions an empty list, not a missing one', () => {
    const merged = withProjectSessions(projects, []);

    expect(merged).toHaveLength(2);
    expect(merged.every((p) => Array.isArray(p.sessions) && p.sessions.length === 0)).toBe(true);
  });

  test('ignores groups for projects that hold no work items', () => {
    const merged = withProjectSessions(projects, [
      { projectId: 'project-gone', sessions: [session('orphan')] },
    ]);

    expect(merged.map((p) => p.projectId)).toEqual(['project-a', 'project-b']);
  });
});
