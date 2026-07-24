import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { listAgentSessions } from '../../api/agent-sessions';
import type { WBData } from '../data';
import {
  useWeeklyReviewSessions,
  WeeklyReviewSessions,
} from './weekly-review.sessions';

vi.mock('../../api/agent-sessions', () => ({
  listAgentSessions: vi.fn(),
}));

const data: WBData = {
  runtime: {
    timeZone: 'Asia/Shanghai',
    calendarDate: '2026-07-24',
    now: '2026-07-24T00:00:00.000Z',
  },
  projects: [],
  sessions: [],
  todos: [],
  stats: {
    activeSessions: 0,
    totalEstimatedTokens: 0,
    totalEstimatedCost: 0,
    projects: 0,
    todosOpen: 0,
    todosDone: 0,
  },
  sourceErrors: [],
  sessionDataState: 'loading',
};

describe('weekly review background sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('marks session metrics as ready after a successful background scan', async () => {
    vi.mocked(listAgentSessions).mockResolvedValue({
      sessions: [{
        id: 'session-1',
        provider: 'codex',
        sourcePath: '/tmp/session.jsonl',
        cwd: '/tmp/project',
        status: 'running',
        title: 'active session',
        filesTouched: [],
        toolCount: 2,
        messageCount: 3,
        lastActiveAt: '2026-07-24T00:00:00.000Z',
        linkedWorkItemIds: [],
      }],
      errors: [],
    });

    const { result } = renderHook(() => useWeeklyReviewSessions(data));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.displayData).toMatchObject({
      sessionDataState: 'ready',
      stats: {
        activeSessions: 1,
        totalEstimatedTokens: 400,
        totalEstimatedCost: 0.005,
      },
    });
  });

  test('shows a visible retry when the background scan fails', async () => {
    vi.mocked(listAgentSessions)
      .mockRejectedValueOnce(new Error('session scan failed'))
      .mockResolvedValueOnce({ sessions: [], errors: [] });

    function Harness() {
      const state = useWeeklyReviewSessions(data);
      return <WeeklyReviewSessions projects={[]} state={state} />;
    }

    render(<MemoryRouter><Harness /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('session scan failed');

    fireEvent.click(screen.getByRole('button', { name: 'retry sessions' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('(no sessions this week)')).toBeInTheDocument();
    expect(listAgentSessions).toHaveBeenCalledTimes(2);
  });
});
