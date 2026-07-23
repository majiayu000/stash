import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Budget, BudgetSpendSnapshot, BurnSnapshot, WeeklySnapshot } from '@stash/shared';
import {
  getBudgetSpendSnapshot,
  getBurnSnapshot,
  getWeeklySnapshot,
} from '../../api/analytics';
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
  getBudgetSpendSnapshot: vi.fn(),
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
  vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(budgetSpendSnapshot);
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
    expect(
      screen.getByText('/api/analytics/burn?days=30 + /api/analytics/budget-spend'),
    ).toBeInTheDocument();
    expect(screen.getByText('burn exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  test('Usage review surfaces budget spend failures without substituting rolling data', async () => {
    vi.mocked(getBurnSnapshot).mockResolvedValue(burnSnapshot);
    vi.mocked(getBudgetSpendSnapshot).mockRejectedValue(new Error('budget spend exploded'));

    renderPage(<UsageReviewPage data={data} reload={vi.fn()} />);

    expect(await screen.findByText('analytics failed to load')).toBeInTheDocument();
    expect(screen.getByText('budget spend exploded')).toBeInTheDocument();
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

describe('analytics calendar labels', () => {
  test('Usage review distinguishes bucket dates from unbounded evaluation totals', async () => {
    vi.mocked(getBurnSnapshot).mockResolvedValue(burnSnapshot);

    renderPage(<UsageReviewPage data={data} reload={vi.fn()} />);

    expect(await screen.findByTestId('usage-bucket-range')).toHaveTextContent(
      '2026-06-12–2026-07-11 · Asia/Shanghai',
    );
    expect(screen.getByTestId('usage-evaluation-range')).toHaveTextContent(
      'from 2026-06-12 onward · Asia/Shanghai',
    );
    expect(screen.getByText('cost · current calendar day')).toBeInTheDocument();
  });

  test('Usage review evaluates each budget against its own global or project period', async () => {
    vi.mocked(getBurnSnapshot).mockResolvedValue(burnSnapshot);
    vi.mocked(listBudgets).mockResolvedValue(budgets);

    renderPage(<UsageReviewPage data={data} reload={vi.fn()} />);

    const day = await screen.findByTestId('budget-row-day');
    expect(day).toHaveTextContent('$12.00 / $10.00 · 120%');
    expect(day).toHaveTextContent('2026-07-11–2026-07-11 · Asia/Shanghai');
    expect(day).toHaveAttribute('data-over-limit', 'true');

    expect(screen.getByTestId('budget-row-week')).toHaveTextContent('$25.00 / $100.00');
    expect(screen.getByTestId('budget-row-month')).toHaveTextContent('$40.00 / $100.00');
    expect(screen.getByTestId('budget-row-project')).toHaveTextContent('$50.00 / $100.00');
    expect(screen.getByTestId('budget-row-missing')).toHaveTextContent('$0.00 / $100.00');
    expect(screen.getByText(/global monthly budget:/)).toHaveTextContent('$40.00 / $100.00');
  });

  test('Weekly review displays the exact configured-zone calendar range', async () => {
    vi.mocked(getWeeklySnapshot).mockResolvedValue(weeklySnapshot);

    renderPage(<WeeklyReviewPage data={data} reload={vi.fn()} />);

    expect(await screen.findByTestId('weekly-calendar-range')).toHaveTextContent(
      '2026-07-06–2026-07-12 · America/Los_Angeles',
    );
  });
});

const burnSnapshot: BurnSnapshot = {
  calendar: {
    timeZone: 'Asia/Shanghai',
    bucketRange: {
      start: '2026-06-11T16:00:00.000Z',
      end: '2026-07-11T16:00:00.000Z',
      startDate: '2026-06-12',
      endDateExclusive: '2026-07-12',
    },
    evaluationRange: { start: '2026-06-11T16:00:00.000Z', end: null },
  },
  totals: { tokens: 100, cost: 1, sessions: 1 },
  dailySpend: [{ date: '2026-07-11', tokens: 100, cost: 1 }],
  hourlyHeatmap: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
  modelMix: [{ model: 'gpt-5', share: 1, tokens: 100, cost: 1 }],
  perProjectLeaderboard: [],
};

const budgetSpendSnapshot: BudgetSpendSnapshot = {
  calendar: {
    timeZone: 'Asia/Shanghai',
    generatedAt: '2026-07-11T04:00:00.000Z',
  },
  periods: {
    day: periodSpend('2026-07-11', '2026-07-12', 12, 8),
    week: periodSpend('2026-07-06', '2026-07-13', 25, 20),
    month: periodSpend('2026-07-01', '2026-08-01', 40, 30),
    quarter: periodSpend('2026-07-01', '2026-10-01', 60, 50),
  },
};

const budgets: Budget[] = [
  budget('day', 'all', 'day', 10),
  budget('week', 'all', 'week', 100),
  budget('month', 'all', 'month', 100),
  budget('project', 'Aurora', 'quarter', 100),
  budget('missing', 'Missing', 'month', 100),
];

function periodSpend(
  startDate: string,
  endDateExclusive: string,
  cost: number,
  projectCost: number,
): BudgetSpendSnapshot['periods']['day'] {
  return {
    range: {
      start: `${startDate}T00:00:00.000Z`,
      end: `${endDateExclusive}T00:00:00.000Z`,
      startDate,
      endDateExclusive,
    },
    totals: { cost },
    perProject: [{ projectId: 'project-1', projectName: 'Aurora', cost: projectCost }],
  };
}

function budget(
  id: string,
  scope: string,
  period: Budget['period'],
  capUsd: number,
): Budget {
  return {
    id,
    scope,
    period,
    capUsd,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

const weeklySnapshot: WeeklySnapshot = {
  calendar: {
    timeZone: 'America/Los_Angeles',
    range: {
      start: '2026-07-06T07:00:00.000Z',
      end: '2026-07-13T07:00:00.000Z',
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-13',
    },
  },
  week: '2026-W28',
  rangeStart: '2026-07-06T07:00:00.000Z',
  rangeEnd: '2026-07-13T07:00:00.000Z',
  doneCount: 0,
  focusHours: 0,
  featuresAdvanced: [],
  sessionsByDay: Array<number>(7).fill(0),
  donePerProject: [],
  wow: {
    tokens: { now: 0, prev: 0 },
    cost: { now: 0, prev: 0 },
    sessions: { now: 0, prev: 0 },
  },
};
