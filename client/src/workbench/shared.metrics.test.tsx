import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
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
  estimatedCost: 0.005,
  estimatedDuration: 60,
  at: Date.now(),
};

const data: WBData = {
  projects: [],
  sessions: [session],
  todos: [],
  sourceErrors: [],
  stats: {
    activeSessions: 0,
    totalEstimatedTokens: 400,
    totalEstimatedCost: 0.005,
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
      </MemoryRouter>,
    );

    expect(screen.getByText('estimated tokens')).toBeInTheDocument();
    expect(screen.getByText('estimated cost')).toBeInTheDocument();
    expect(screen.getByText('400 est. tokens')).toBeInTheDocument();
    expect(screen.getByText('$0.01 est. · 1m est.')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-stats')).not.toHaveTextContent('24h');
  });
});
