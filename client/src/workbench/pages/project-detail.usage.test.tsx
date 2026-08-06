import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { BurnPricingCoverage, BurnSnapshot } from '@stash/shared';
import { getBurnSnapshot } from '../../api/analytics';
import { WorkbenchDialogProvider } from '../../components/ui/workbench-dialogs';
import { getDecisionCandidates } from '../../api/agent-sessions';
import {
  getProjectIntent,
  getProjectNotes,
  listDecisions,
  listLessons,
  listMilestones,
} from '../../api/project-knowledge';
import { listProjectSkills, listSkills } from '../../api/skills';
import type { WBData, WBProject } from '../data';
import { ProjectDetailPage } from './ProjectDetailPage';

vi.mock('../../components/effects', () => ({
  CountUp: ({ to, format }: { to: number; format?: (n: number) => string }) => <span>{format ? format(to) : to}</span>,
  CursorGlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  LiveDot: () => <span />,
  ParticleField: () => null,
  ShinyText: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../api/analytics', () => ({ getBurnSnapshot: vi.fn() }));
vi.mock('../../api/agent-sessions', () => ({
  acceptDecisionCandidate: vi.fn(),
  getDecisionCandidates: vi.fn(),
  ignoreDecisionCandidate: vi.fn(),
}));
vi.mock('../../api/project-knowledge', () => ({
  getProjectIntent: vi.fn(),
  setProjectIntent: vi.fn(),
  listMilestones: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  listDecisions: vi.fn(),
  createDecision: vi.fn(),
  updateDecision: vi.fn(),
  deleteDecision: vi.fn(),
  getProjectNotes: vi.fn(),
  setProjectNotes: vi.fn(),
  listLessons: vi.fn(),
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
}));
vi.mock('../../api/skills', () => ({
  listProjectSkills: vi.fn(),
  listSkills: vi.fn(),
}));

const project: WBProject = {
  id: 'proj-1',
  name: 'Aurora',
  emoji: '🌌',
  progress: 40,
  status: 'active',
  doing: 'wiring analytics',
  features: [],
  todoCount: 1,
  todoDone: 0,
  sessions: 3,
  estimatedTokens: 1200,
  lastModel: 'claude-opus-4-8',
  lastTouched: Date.now(),
};

const data: WBData = {
  runtime: { timeZone: 'UTC', calendarDate: '2026-07-11', now: '2026-07-11T00:00:00.000Z' },
  projects: [project],
  sessions: [],
  todos: [],
  sourceErrors: [],
  stats: { activeSessions: 0, totalEstimatedTokens: 1200, projects: 1, todosOpen: 1, todosDone: 0 },
};

function burn(cost: number, pricing: BurnPricingCoverage): BurnSnapshot {
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
    totals: { tokens: 900_000, cost, sessions: 3 },
    dailySpend: [],
    hourlyHeatmap: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
    modelMix: [],
    perProjectLeaderboard: [
      { projectId: 'proj-1', projectName: 'Aurora', tokens: 900_000, cost, sessions: 3, share: 1 },
    ],
    pricing,
  };
}

beforeEach(() => {
  const at = '2026-07-11T00:00:00.000Z';
  vi.mocked(getProjectIntent).mockResolvedValue({ projectId: 'proj-1', text: '', updatedAt: at });
  vi.mocked(getProjectNotes).mockResolvedValue({ projectId: 'proj-1', markdown: '', updatedAt: at });
  vi.mocked(listMilestones).mockResolvedValue([]);
  vi.mocked(listDecisions).mockResolvedValue([]);
  vi.mocked(listLessons).mockResolvedValue([]);
  vi.mocked(listProjectSkills).mockResolvedValue([]);
  vi.mocked(listSkills).mockResolvedValue([]);
  vi.mocked(getDecisionCandidates).mockResolvedValue([]);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1']}>
      <WorkbenchDialogProvider>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage data={data} reload={vi.fn()} />} />
        </Routes>
      </WorkbenchDialogProvider>
    </MemoryRouter>,
  );
}

describe('project detail usage tiles', () => {
  test('shows measured burn usage rather than a figure derived from session count', async () => {
    // Regression: cost here was `sessions.length * 0.05` — a number that moved
    // with how many sessions existed and had no relation to real spend.
    vi.mocked(getBurnSnapshot).mockResolvedValue(
      burn(12.34, { unknownModels: [], unpricedTokens: 0 }),
    );

    renderPage();

    expect(await screen.findByText('$12.34')).toBeInTheDocument();
    expect(screen.getByText('cost · 30d')).toBeInTheDocument();
    expect(screen.getByText('900.0k')).toBeInTheDocument();
    // 3 sessions × $0.05 was the old fabricated value.
    expect(screen.queryByText('$0.15')).not.toBeInTheDocument();
  });

  test('marks the cost tile as partial when some model had no rate', async () => {
    vi.mocked(getBurnSnapshot).mockResolvedValue(
      burn(0, { unknownModels: ['claude-opus-4-8'], unpricedTokens: 900_000 }),
    );

    renderPage();

    expect(await screen.findByText('≥ $0.00')).toBeInTheDocument();
    expect(screen.getByText('cost · 30d (partial)')).toBeInTheDocument();
  });

  test('shows a dash instead of a number when usage cannot be loaded', async () => {
    vi.mocked(getBurnSnapshot).mockRejectedValue(new Error('burn exploded'));

    renderPage();

    // The rest of the project page still renders; only the two tiles degrade.
    expect(await screen.findByText('wiring analytics')).toBeInTheDocument();
    expect(screen.getByText('cost · 30d')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});
