import { describe, expect, test } from 'vitest';
import type { AgentSession, Area } from '@stash/shared';
import { adaptToWorkbenchData, estimateSessionActivity } from './data';

const runtime = {
  timeZone: 'UTC',
  calendarDate: '2026-07-10',
  now: '2026-07-10T08:00:00.000Z',
};

const agentSession: AgentSession = {
  id: 'session-1',
  provider: 'codex',
  sourcePath: '/tmp/session.jsonl',
  cwd: '/tmp/project-a',
  projectId: 'project-a',
  status: 'completed',
  title: 'fixture session',
  filesTouched: [],
  toolCount: 2,
  messageCount: 3,
  lastActiveAt: '2026-07-10T08:00:00.000Z',
};

const emptyArea: Area = {
  id: 'empty-project',
  name: 'Empty project',
  emoji: '🪴',
  reviewCadence: 'weekly',
  createdAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T08:00:00.000Z',
};

describe('workbench activity estimates', () => {
  test('derives explicitly named fallback metrics from activity counts', () => {
    expect(estimateSessionActivity(2, 3)).toEqual({
      estimatedTokens: 400,
      estimatedCost: 0.005,
      estimatedDuration: 60,
    });
  });

  test('adapts sessions and aggregate stats without a false 24h shape', () => {
    const data = adaptToWorkbenchData({
      runtime,
      items: [],
      sessions: [agentSession],
      sourceErrors: [],
      workboardProjects: [{
        projectId: 'project-a',
        itemCount: 0,
        activeCount: 0,
        blockedCount: 0,
        items: [],
        sessions: [agentSession],
      }],
      areas: [],
    });

    expect(data.projects[0]).toMatchObject({ estimatedTokens: 400, estimatedCost: 0.05 });
    expect(data.sessions[0]).toMatchObject({
      estimatedTokens: 400,
      estimatedCost: 0.005,
      estimatedDuration: 60,
    });
    expect(data.stats).toMatchObject({ totalEstimatedTokens: 400, totalEstimatedCost: 0.005 });
    expect(data.projects[0]).not.toHaveProperty('tokens24h');
    expect(data.projects[0]).not.toHaveProperty('cost24h');
    expect(data.sessions[0]).not.toHaveProperty('tokens');
    expect(data.sessions[0]).not.toHaveProperty('cost');
    expect(data.sessions[0]).not.toHaveProperty('duration');
    expect(data.stats).not.toHaveProperty('totalTokens24h');
    expect(data.stats).not.toHaveProperty('totalCost24h');
  });

  test('keeps durable areas visible before they receive a work item', () => {
    const data = adaptToWorkbenchData({
      runtime,
      items: [],
      sessions: [],
      sourceErrors: [],
      workboardProjects: [],
      areas: [emptyArea],
    });

    expect(data.projects).toEqual([
      expect.objectContaining({
        id: emptyArea.id,
        name: emptyArea.name,
        emoji: emptyArea.emoji,
        progress: 0,
        status: 'paused',
        todoCount: 0,
        todoDone: 0,
        sessions: 0,
      }),
    ]);
    expect(data.stats.projects).toBe(1);
  });
});
