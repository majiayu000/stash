import { describe, expect, test } from 'vitest';
import type { AgentSession } from '@stash/shared';
import { adaptToWorkbenchData, estimateSessionActivity } from './data';

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
});
