import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getBurnSnapshot, getWeeklySnapshot } from '../../api/analytics';
import { listBudgets } from '../../api/budgets';
import { listSkills } from '../../api/skills';
import { listStale, listWorkItems } from '../../api/work-items';
import type { WBData } from '../data';
import { ConceptH } from './ConceptH';
import { ConceptJ } from './ConceptJ';
import { ConceptM } from './ConceptM';

vi.mock('../../components/effects', () => ({
  CountUp: ({ to, format }: { to: number; format?: (n: number) => string }) => <span>{format ? format(to) : to}</span>,
  CursorGlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  LiveDot: () => <span />,
  ParticleField: () => null,
  ShinyText: ({ children }: { children: ReactNode }) => <>{children}</>,
  Typewriter: ({ phrases }: { phrases: string[] }) => <span>{phrases[0]}</span>,
}));

vi.mock('../../api/analytics', () => ({
  getBurnSnapshot: vi.fn(),
  getWeeklySnapshot: vi.fn(),
}));

vi.mock('../../api/budgets', () => ({
  listBudgets: vi.fn(),
}));

vi.mock('../../api/skills', () => ({
  listSkills: vi.fn(),
}));

vi.mock('../../api/work-items', () => ({
  listStale: vi.fn(),
  listWorkItems: vi.fn(),
}));

const data: WBData = {
  projects: [],
  sessions: [],
  todos: [],
  stats: {
    activeSessions: 0,
    totalTokens24h: 0,
    totalCost24h: 0,
    projects: 0,
    todosOpen: 0,
    todosDone: 0,
  },
};

beforeEach(() => {
  vi.mocked(listBudgets).mockResolvedValue([]);
  vi.mocked(listWorkItems).mockResolvedValue([]);
  vi.mocked(listStale).mockResolvedValue([]);
  vi.mocked(listSkills).mockResolvedValue([]);
});

describe('concept API load errors', () => {
  test('Concept H surfaces burn analytics failures', async () => {
    vi.mocked(getBurnSnapshot).mockRejectedValue(new Error('burn exploded'));

    render(<ConceptH data={data} reload={vi.fn()} />);

    expect(await screen.findByText('analytics failed to load')).toBeInTheDocument();
    expect(screen.getByText('/api/analytics/burn?days=30')).toBeInTheDocument();
    expect(screen.getByText('burn exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  test('Concept J surfaces weekly review failures', async () => {
    vi.mocked(getWeeklySnapshot).mockRejectedValue(new Error('weekly exploded'));

    render(<ConceptJ data={data} reload={vi.fn()} />);

    expect(await screen.findByText('weekly review failed to load')).toBeInTheDocument();
    expect(screen.getByText('/api/analytics/weekly + /api/work-items?status=done + /api/work-items/stale?days=30')).toBeInTheDocument();
    expect(screen.getByText('weekly exploded')).toBeInTheDocument();
  });

  test('Concept M surfaces skill registry failures', async () => {
    vi.mocked(listSkills).mockRejectedValue(new Error('skills exploded'));

    render(<ConceptM data={data} reload={vi.fn()} />);

    expect(await screen.findByText('skills failed to load')).toBeInTheDocument();
    expect(screen.getByText('/api/skills + /api/projects/:id/skills')).toBeInTheDocument();
    expect(screen.getByText('skills exploded')).toBeInTheDocument();
  });
});
