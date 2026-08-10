import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { BurnSnapshot, Milestone, Skill } from '@stash/shared';
import { getBurnSnapshot } from '../../api/analytics';
import {
  getProjectIntent,
  getProjectNotes,
  listDecisions,
  listLessons,
  listMilestones,
  updateMilestone,
} from '../../api/project-knowledge';
import { getDecisionCandidates } from '../../api/agent-sessions';
import { listProjectSkills, listSkills } from '../../api/skills';
import { WorkbenchDialogProvider } from '../../components/ui/workbench-dialogs';
import type { WBData } from '../data';
import { ProjectDetailPage } from './ProjectDetailPage';

vi.mock('../../api/analytics', () => ({ getBurnSnapshot: vi.fn() }));

vi.mock('../../api/agent-sessions', () => ({
  acceptDecisionCandidate: vi.fn(),
  getDecisionCandidates: vi.fn(),
  ignoreDecisionCandidate: vi.fn(),
}));

vi.mock('../../api/project-knowledge', () => ({
  createDecision: vi.fn(),
  getProjectIntent: vi.fn(),
  getProjectNotes: vi.fn(),
  listDecisions: vi.fn(),
  listLessons: vi.fn(),
  listMilestones: vi.fn(),
  updateMilestone: vi.fn(),
}));

vi.mock('../../api/skills', () => ({
  listProjectSkills: vi.fn(),
  listSkills: vi.fn(),
}));

const milestone: Milestone = {
  id: 'milestone-1',
  projectId: 'project-1',
  name: 'v1 cut',
  status: 'planned',
  progress: 0,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const oldSkill: Skill = {
  id: 'old-skill',
  name: 'Stale skill',
  emoji: '💀',
  source: 'community',
  stars: 0,
  installed: true,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const latestSkill: Skill = {
  ...oldSkill,
  id: 'latest-skill',
  name: 'Latest skill',
  emoji: '✨',
};

const burnSnapshot: BurnSnapshot = {
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
  totals: { tokens: 0, cost: 0, sessions: 0 },
  dailySpend: [],
  hourlyHeatmap: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
  modelMix: [],
  perProjectLeaderboard: [],
  pricing: { unknownModels: [], unpricedTokens: 0 },
};

const data: WBData = {
  runtime: { timeZone: 'UTC', calendarDate: '2026-07-11', now: '2026-07-11T00:00:00.000Z' },
  projects: [{
    id: 'project-1',
    name: 'Stash',
    emoji: '📦',
    progress: 75,
    status: 'active',
    doing: 'renew SSL cert',
    features: [],
    todoCount: 0,
    todoDone: 0,
    sessions: 0,
    estimatedTokens: 0,
    lastModel: 'codex',
    lastTouched: Date.now(),
  }],
  sessions: [],
  todos: [],
  sourceErrors: [],
  stats: {
    activeSessions: 0,
    totalEstimatedTokens: 0,
    projects: 1,
    todosOpen: 0,
    todosDone: 0,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getBurnSnapshot).mockResolvedValue(burnSnapshot);
  vi.mocked(getProjectIntent).mockResolvedValue(null);
  vi.mocked(getProjectNotes).mockResolvedValue(null);
  vi.mocked(listDecisions).mockResolvedValue([]);
  vi.mocked(listLessons).mockResolvedValue([]);
  vi.mocked(listMilestones).mockResolvedValue([milestone]);
  vi.mocked(listProjectSkills).mockResolvedValue([]);
  vi.mocked(listSkills).mockResolvedValue([]);
  vi.mocked(getDecisionCandidates).mockResolvedValue([]);
  vi.mocked(updateMilestone).mockResolvedValue({ ...milestone, status: 'wip' });
});

describe('ProjectDetailPage', () => {
  test('keeps the current project rendered while milestone data refreshes', async () => {
    let resolveRefresh: (milestones: Milestone[]) => void = () => {};
    const refresh = new Promise<Milestone[]>((resolve) => { resolveRefresh = resolve; });
    vi.mocked(listMilestones)
      .mockResolvedValueOnce([milestone])
      .mockReturnValueOnce(refresh);

    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <WorkbenchDialogProvider>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage data={data} reload={vi.fn()} />} />
          </Routes>
        </WorkbenchDialogProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('v1 cut')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('click to cycle status (currently planned)'));

    await waitFor(() => expect(listMilestones).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('loading project knowledge…')).not.toBeInTheDocument();
    expect(screen.getByText('v1 cut')).toBeInTheDocument();

    await act(async () => {
      resolveRefresh([{ ...milestone, status: 'wip' }]);
      await refresh;
    });

    expect(await screen.findByTitle('click to cycle status (currently wip)')).toBeInTheDocument();
  });

  test('keeps the newest snapshot when two edits refresh out of order', async () => {
    let resolveOld: (milestones: Milestone[]) => void = () => {};
    let resolveLatest: (milestones: Milestone[]) => void = () => {};
    const oldRefresh = new Promise<Milestone[]>((resolve) => { resolveOld = resolve; });
    const latestRefresh = new Promise<Milestone[]>((resolve) => { resolveLatest = resolve; });

    vi.mocked(listMilestones)
      .mockResolvedValueOnce([milestone])
      .mockReturnValueOnce(oldRefresh)
      .mockReturnValueOnce(latestRefresh);
    vi.mocked(listProjectSkills)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ projectId: 'project-1', skillId: oldSkill.id, enabled: true, boundAt: oldSkill.createdAt }])
      .mockResolvedValueOnce([{ projectId: 'project-1', skillId: latestSkill.id, enabled: true, boundAt: latestSkill.createdAt }]);
    vi.mocked(listSkills)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([oldSkill])
      .mockResolvedValueOnce([latestSkill]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <WorkbenchDialogProvider>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage data={data} reload={vi.fn()} />} />
          </Routes>
        </WorkbenchDialogProvider>
      </MemoryRouter>,
    );

    const statusButton = await screen.findByTitle('click to cycle status (currently planned)');
    fireEvent.click(statusButton);
    fireEvent.click(statusButton);
    await waitFor(() => expect(listMilestones).toHaveBeenCalledTimes(3));

    await act(async () => {
      resolveLatest([{ ...milestone, name: 'latest snapshot', status: 'done' }]);
      await latestRefresh;
    });

    expect(await screen.findByText('latest snapshot')).toBeInTheDocument();
    expect(screen.getByText('Latest skill')).toBeInTheDocument();

    await act(async () => {
      resolveOld([{ ...milestone, name: 'stale snapshot', status: 'wip' }]);
      await oldRefresh;
    });

    expect(screen.getByText('latest snapshot')).toBeInTheDocument();
    expect(screen.getByText('Latest skill')).toBeInTheDocument();
    expect(screen.queryByText('stale snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Stale skill')).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('ignores a pending project load after unmount', async () => {
    let rejectLoad: (error: Error) => void = () => {};
    const pendingLoad = new Promise<Milestone[]>((_, reject) => { rejectLoad = reject; });
    vi.mocked(listMilestones).mockReturnValueOnce(pendingLoad);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <WorkbenchDialogProvider>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage data={data} reload={vi.fn()} />} />
          </Routes>
        </WorkbenchDialogProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(listMilestones).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      rejectLoad(new Error('late project response'));
      await pendingLoad.catch(() => undefined);
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
