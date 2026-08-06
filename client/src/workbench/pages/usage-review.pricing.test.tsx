import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  Budget,
  BudgetPeriodSpend,
  BudgetSpendSnapshot,
  BurnPricingCoverage,
  BurnSnapshot,
} from '@stash/shared';
import { getBudgetSpendSnapshot, getBurnSnapshot } from '../../api/analytics';
import { listBudgets } from '../../api/budgets';
import type { WBData } from '../data';
import { UsageReviewPage } from './UsageReviewPage';

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

const NO_GAPS: BurnPricingCoverage = { unknownModels: [], unpricedTokens: 0 };

const data: WBData = {
  runtime: { timeZone: 'UTC', calendarDate: '2026-07-11', now: '2026-07-11T00:00:00.000Z' },
  projects: [],
  sessions: [],
  todos: [],
  sourceErrors: [],
  stats: {
    activeSessions: 0,
    totalEstimatedTokens: 0,
    projects: 0,
    todosOpen: 0,
    todosDone: 0,
  },
};

function periodSpend(startDate: string, endDateExclusive: string): BudgetPeriodSpend {
  return {
    range: {
      start: `${startDate}T00:00:00.000Z`,
      end: `${endDateExclusive}T00:00:00.000Z`,
      startDate,
      endDateExclusive,
    },
    totals: { cost: 0 },
    perProject: [],
  };
}

function burnSnapshot(pricing: BurnPricingCoverage): BurnSnapshot {
  return {
    calendar: {
      timeZone: 'UTC',
      bucketRange: {
        start: '2026-06-11T00:00:00.000Z',
        end: '2026-07-12T00:00:00.000Z',
        startDate: '2026-06-12',
        endDateExclusive: '2026-07-12',
      },
      evaluationRange: { start: '2026-06-11T00:00:00.000Z', end: null },
    },
    totals: { tokens: 5_952_673, cost: 0, sessions: 24 },
    dailySpend: [{ date: '2026-07-11', tokens: 5_952_673, cost: 0 }],
    hourlyHeatmap: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
    modelMix: [
      { model: 'claude-opus-4-8', share: 1, tokens: 2_877_166, cost: undefined },
      { model: 'claude-sonnet-4-6', share: 0, tokens: 100, cost: 1.5 },
    ],
    perProjectLeaderboard: [],
    pricing,
  };
}

function budgetSnapshot(pricing: BurnPricingCoverage): BudgetSpendSnapshot {
  return {
    calendar: { timeZone: 'UTC', generatedAt: '2026-07-11T00:00:00.000Z' },
    periods: {
      day: periodSpend('2026-07-11', '2026-07-12'),
      week: periodSpend('2026-07-06', '2026-07-13'),
      month: periodSpend('2026-07-01', '2026-08-01'),
      quarter: periodSpend('2026-07-01', '2026-10-01'),
    },
    pricing,
  };
}

const monthlyBudget: Budget = {
  id: 'b1',
  scope: 'all',
  capUsd: 100,
  period: 'month',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(listBudgets).mockResolvedValue([monthlyBudget]);
});

function renderPage() {
  return render(<MemoryRouter><UsageReviewPage data={data} reload={vi.fn()} /></MemoryRouter>);
}

describe('usage review pricing coverage', () => {
  test('names the unpriced models instead of presenting $0.00 as real spend', async () => {
    // Regression: a rate card that matched none of the user's models reported
    // $0.00 spend and a 0% budget with nothing on screen to reveal the gap.
    const gaps: BurnPricingCoverage = {
      unknownModels: ['claude-opus-4-8', 'claude-opus-5', 'k3'],
      unpricedTokens: 5_952_673,
    };
    vi.mocked(getBurnSnapshot).mockResolvedValue(burnSnapshot(gaps));
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(budgetSnapshot(gaps));

    renderPage();

    const banner = await screen.findByTestId('usage-pricing-gap');
    expect(banner).toHaveTextContent('Cost figures are incomplete');
    expect(banner).toHaveTextContent('claude-opus-4-8, claude-opus-5, k3');

    // Every dollar figure must read as a floor, not a measurement.
    expect((await screen.findAllByText('≥ $0.00')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('usage-evaluation-range')).toHaveTextContent('indexed spend (partial)');
    // A model with no rate says so rather than showing $0.00.
    expect(screen.getByText('no rate')).toBeInTheDocument();
    expect(screen.getByText(/unpriced usage not counted/)).toBeInTheDocument();
  });

  test('stays quiet when every model is covered by a rate', async () => {
    vi.mocked(getBurnSnapshot).mockResolvedValue(burnSnapshot(NO_GAPS));
    vi.mocked(getBudgetSpendSnapshot).mockResolvedValue(budgetSnapshot(NO_GAPS));

    renderPage();

    expect(await screen.findByTestId('usage-evaluation-range')).toHaveTextContent('indexed spend ·');
    expect(screen.queryByTestId('usage-pricing-gap')).not.toBeInTheDocument();
    expect(screen.queryByText(/unpriced usage not counted/)).not.toBeInTheDocument();
  });
});
