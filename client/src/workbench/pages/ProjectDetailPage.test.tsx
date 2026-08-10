import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Milestone } from '@stash/shared';
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
});
