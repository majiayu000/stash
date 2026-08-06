import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { ConnectedFlow } from './ConnectedFlow';
import type { WBData, WBSession } from './data';
import { SessionRow, Topbar } from './shared';

const session: WBSession = {
  id: 'session-1',
  provider: 'codex',
  project: 'project-a',
  model: 'gpt-5',
  tool: 'codex',
  state: 'done',
  title: 'fixture session',
  preview: '',
  estimatedTokens: 400,
  estimatedDuration: 60,
  at: Date.now(),
};

const data: WBData = {
  runtime: { timeZone: 'UTC', calendarDate: '2026-07-11', now: '2026-07-11T00:00:00.000Z' },
  projects: [],
  sessions: [session],
  todos: [],
  sourceErrors: [],
  stats: {
    activeSessions: 0,
    totalEstimatedTokens: 400,
    projects: 0,
    todosOpen: 0,
    todosDone: 0,
  },
};

describe('workbench estimated metric labels', () => {
  test('labels aggregate and session-row fallback values as estimates', () => {
    render(
      <MemoryRouter>
        <Topbar data={data} />
        <SessionRow s={session} projects={[]} />
        <ConnectedFlow data={data} />
      </MemoryRouter>,
    );

    expect(screen.getByText('estimated tokens')).toBeInTheDocument();
    expect(screen.getByText('400 est. tokens')).toBeInTheDocument();
    expect(screen.getByText('1m est.')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-stats')).not.toHaveTextContent('24h');
    // Activity counts yield tokens and duration, never dollars. A fabricated
    // "$x est." here sat one click away from the measured spend on Usage Review.
    expect(screen.getByTestId('topbar-stats')).not.toHaveTextContent('$');
    expect(screen.getByTestId('flow-burn')).not.toHaveTextContent('$');
    expect(screen.getByTestId('flow-burn')).toHaveTextContent('derived from session activity counts');
    expect(screen.getByTestId('flow-burn')).not.toHaveTextContent('0 active sessions');
  });
});
