import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getBurnSnapshot, getWeeklySnapshot } from '../../api/analytics';
import { listBudgets } from '../../api/budgets';
import { listSkills } from '../../api/skills';
import { listStale, listWorkItems } from '../../api/work-items';
import type { WBData } from '../data';
import { UsageReviewPage } from './UsageReviewPage';
import { WeeklyReviewPage } from './WeeklyReviewPage';
import { SkillsSettingsPage } from './SkillsSettingsPage';

vi.mock('../../components/effects', () => ({
  CountUp: ({ to, format }: { to: number; format?: (n: number) => string }) => <span>{format ? format(to) : to}</span>,
  CursorGlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  LiveDot: () => <span />,
  ParticleField: () => null,
  ShinyText: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../api/analytics', () => ({
  getBurnSnapshot: vi.fn(),
  getWeeklySnapshot: vi.fn(),
}));

vi.mock('../../api/budgets', () => ({
  listBudgets: vi.fn(),
}));

vi.mock('../../api/skills', () => ({
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
  listProjectSkills: vi.fn(),
  listSkills: vi.fn(),
  toggleProjectSkill: vi.fn(),
  updateSkill: vi.fn(),
}));

vi.mock('../../api/work-items', () => ({
  listStale: vi.fn(),
  listWorkItems: vi.fn(),
}));

const data: WBData = {
  runtime: { timeZone: 'UTC', calendarDate: '2026-07-11', now: '2026-07-11T00:00:00.000Z' },
  projects: [],
  sessions: [],
  todos: [],
  sourceErrors: [],
  stats: {
    activeSessions: 0,
    totalEstimatedTokens: 0,
    totalEstimatedCost: 0,
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

function renderPage(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('page API load errors', () => {
  test('Usage review surfaces burn analytics failures', async () => {
    vi.mocked(getBurnSnapshot).mockRejectedValue(new Error('burn exploded'));

    renderPage(<UsageReviewPage data={data} reload={vi.fn()} />);

    expect(await screen.findByText('analytics failed to load')).toBeInTheDocument();
    expect(screen.getByText('/api/analytics/burn?days=30')).toBeInTheDocument();
    expect(screen.getByText('burn exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  test('Weekly review surfaces load failures', async () => {
    vi.mocked(getWeeklySnapshot).mockRejectedValue(new Error('weekly exploded'));

    renderPage(<WeeklyReviewPage data={data} reload={vi.fn()} />);

    expect(await screen.findByText('weekly review failed to load')).toBeInTheDocument();
    expect(
      screen.getByText('/api/analytics/weekly + /api/work-items?status=done + /api/work-items/stale?days=30'),
    ).toBeInTheDocument();
    expect(screen.getByText('weekly exploded')).toBeInTheDocument();
  });

  test('Skills settings surfaces registry failures', async () => {
    vi.mocked(listSkills).mockRejectedValue(new Error('skills exploded'));

    renderPage(<SkillsSettingsPage data={data} reload={vi.fn()} />);

    expect(await screen.findByText('skills failed to load')).toBeInTheDocument();
    expect(screen.getByText('/api/skills + /api/projects/:id/skills')).toBeInTheDocument();
    expect(screen.getByText('skills exploded')).toBeInTheDocument();
  });
});
