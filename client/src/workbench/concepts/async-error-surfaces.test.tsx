import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Budget, BurnSnapshot, WorkItem } from '@stash/shared';
import { getBurnSnapshot } from '../../api/analytics';
import { listAreas } from '../../api/areas';
import { listBudgets } from '../../api/budgets';
import { composeSession, listDispatchRuns } from '../../api/sessions';
import { listProjectSkills, listSkills } from '../../api/skills';
import { createWorkItem, getWorkItem } from '../../api/work-items';
import { WorkbenchDialogProvider } from '../../components/ui/workbench-dialogs';
import { AsyncErrorHost } from '../AsyncErrorHost';
import type { WBData } from '../data';
import { getReminderPermission, requestReminderPermission } from '../ReminderTicker';
import { ConceptA } from './ConceptA';
import { ConceptN } from './ConceptN';
import { ConceptO } from './ConceptO';

vi.mock('../../components/effects', () => ({
  CountUp: ({ to, format }: { to: number; format?: (n: number) => string }) => <span>{format ? format(to) : to}</span>,
  CursorGlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  LiveDot: () => <span />,
  ParticleField: () => null,
  ShinyText: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../api/analytics', () => ({ getBurnSnapshot: vi.fn() }));
vi.mock('../../api/areas', () => ({
  createArea: vi.fn(),
  deleteArea: vi.fn(),
  listAreas: vi.fn(),
  updateArea: vi.fn(),
}));
vi.mock('../../api/budgets', () => ({
  createBudget: vi.fn(),
  deleteBudget: vi.fn(),
  listBudgets: vi.fn(),
  updateBudget: vi.fn(),
}));
vi.mock('../../api/sessions', () => ({
  closeDispatchRun: vi.fn(),
  composeSession: vi.fn(),
  listDispatchRuns: vi.fn(),
  startSession: vi.fn(),
}));
vi.mock('../../api/skills', () => ({
  listProjectSkills: vi.fn(),
  listSkills: vi.fn(),
}));
vi.mock('../../api/work-items', () => ({
  createWorkItem: vi.fn(),
  getWorkItem: vi.fn(),
}));
vi.mock('../ReminderTicker', () => ({
  getReminderPermission: vi.fn(() => 'unsupported'),
  requestReminderPermission: vi.fn(async () => false),
}));

const data: WBData = {
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

const emptyBurn: BurnSnapshot = {
  totals: { tokens: 0, cost: 0, sessions: 0 },
  dailySpend: [],
  hourlyHeatmap: [],
  modelMix: [],
  perProjectLeaderboard: [],
};

const workItem: WorkItem = {
  id: 'todo-1',
  title: 'recover async errors',
  kind: 'task',
  status: 'inbox',
  priority: 'p2',
  source: 'manual',
  confidence: 'explicit',
  assignee: 'human',
  labels: [],
  checklist: [],
  links: [],
  todayPinned: false,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
};

const budget: Budget = {
  id: 'budget-1',
  scope: 'all',
  capUsd: 42,
  period: 'month',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getBurnSnapshot).mockResolvedValue(emptyBurn);
  vi.mocked(createWorkItem).mockResolvedValue(workItem);
  vi.mocked(getWorkItem).mockResolvedValue(workItem);
  vi.mocked(listAreas).mockResolvedValue([]);
  vi.mocked(listBudgets).mockResolvedValue([]);
  vi.mocked(listDispatchRuns).mockResolvedValue([]);
  vi.mocked(listSkills).mockResolvedValue([]);
  vi.mocked(listProjectSkills).mockResolvedValue([]);
  vi.mocked(getReminderPermission).mockReturnValue('default');
  vi.mocked(requestReminderPermission).mockResolvedValue(false);
  vi.mocked(composeSession).mockResolvedValue({
    prompt: '# Task: recover async errors',
    promptFile: '/tmp/prompt.md',
    suggestedCommand: 'claude < /tmp/prompt.md',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSurface(node: ReactNode, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <WorkbenchDialogProvider>
        <AsyncErrorHost />
        {node}
      </WorkbenchDialogProvider>
    </MemoryRouter>,
  );
}

function notificationSurface(showConcept: boolean) {
  return (
    <MemoryRouter>
      <WorkbenchDialogProvider>
        <AsyncErrorHost />
        {showConcept && <ConceptN data={data} reload={vi.fn()} />}
      </WorkbenchDialogProvider>
    </MemoryRouter>
  );
}

describe('high-value optional surface failures', () => {
  test('Concept A burn failure is visible and retry reloads analytics', async () => {
    vi.mocked(getBurnSnapshot)
      .mockRejectedValueOnce(new Error('burn unavailable'))
      .mockResolvedValueOnce(emptyBurn);

    renderSurface(<ConceptA data={data} reload={vi.fn()} />);

    expect(await screen.findByText('burn unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry load card wall analytics' }));

    await waitFor(() => expect(getBurnSnapshot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('burn unavailable')).not.toBeInTheDocument());
  });

  test('Concept A capture failure preserves a usable input without unsafe automatic retry', async () => {
    const reload = vi.fn();
    vi.mocked(createWorkItem)
      .mockRejectedValueOnce(new Error('capture unavailable'))
      .mockResolvedValueOnce(workItem);
    renderSurface(<ConceptA data={data} reload={reload} />);
    const input = screen.getByTestId('ca-capture-input');

    fireEvent.change(input, { target: { value: 'keep this text' } });
    fireEvent.submit(screen.getByTestId('ca-capture-form'));

    expect(await screen.findByText('capture unavailable')).toBeInTheDocument();
    expect(input).toHaveValue('keep this text');
    expect(input).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'retry capture work item' })).not.toBeInTheDocument();

    fireEvent.submit(screen.getByTestId('ca-capture-form'));
    await waitFor(() => expect(createWorkItem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('Concept A ignores a delayed capture rejection after the surface unmounts', async () => {
    let rejectCreate: ((reason?: unknown) => void) | undefined;
    const reload = vi.fn();
    const onAsyncError = vi.fn();
    vi.mocked(createWorkItem).mockImplementationOnce(() => new Promise<WorkItem>((_resolve, reject) => {
      rejectCreate = reject;
    }));
    window.addEventListener('stash:async-error', onAsyncError);

    function surface(showConcept: boolean) {
      return (
        <MemoryRouter>
          <WorkbenchDialogProvider>
            <AsyncErrorHost />
            {showConcept && <ConceptA data={data} reload={reload} />}
          </WorkbenchDialogProvider>
        </MemoryRouter>
      );
    }

    const view = render(surface(true));
    fireEvent.change(screen.getByTestId('ca-capture-input'), { target: { value: 'leave this route' } });
    fireEvent.submit(screen.getByTestId('ca-capture-form'));
    await waitFor(() => expect(createWorkItem).toHaveBeenCalledTimes(1));

    view.rerender(surface(false));
    await act(async () => {
      rejectCreate?.(new Error('late capture failure'));
      await Promise.resolve();
    });

    expect(onAsyncError).not.toHaveBeenCalled();
    expect(screen.queryByText('late capture failure')).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    window.removeEventListener('stash:async-error', onAsyncError);
  });

  test('Concept N budget failure is visible and retry replaces the false empty state', async () => {
    vi.mocked(listBudgets)
      .mockRejectedValueOnce(new Error('budgets unavailable'))
      .mockResolvedValueOnce([budget]);

    renderSurface(<ConceptN data={data} reload={vi.fn()} />);

    expect(await screen.findByText('budgets unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry load settings budgets' }));

    expect(await screen.findByText('$42.00')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('budgets unavailable')).not.toBeInTheDocument());
    expect(listBudgets).toHaveBeenCalledTimes(2);
  });

  test('Concept N surfaces a notification permission rejection and safely retries it', async () => {
    vi.mocked(requestReminderPermission)
      .mockRejectedValueOnce(new Error('notification permission unavailable'))
      .mockImplementationOnce(async () => {
        vi.mocked(getReminderPermission).mockReturnValue('granted');
        return true;
      });

    renderSurface(<ConceptN data={data} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'enable browser notifications' }));

    expect(await screen.findByText('notification permission unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry request notification permission' }));

    await waitFor(() => expect(requestReminderPermission).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'notifications enabled' })).toBeDisabled();
    await waitFor(() => expect(screen.queryByText('notification permission unavailable')).not.toBeInTheDocument());
  });

  test('Concept N ignores a delayed notification permission resolve after unmount', async () => {
    let resolvePermission: ((granted: boolean) => void) | undefined;
    vi.mocked(requestReminderPermission).mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      resolvePermission = resolve;
    }));

    const view = render(notificationSurface(true));
    fireEvent.click(screen.getByRole('button', { name: 'enable browser notifications' }));
    await waitFor(() => expect(requestReminderPermission).toHaveBeenCalledTimes(1));
    expect(getReminderPermission).toHaveBeenCalledTimes(1);

    view.rerender(notificationSurface(false));
    await act(async () => {
      resolvePermission?.(true);
      await Promise.resolve();
    });

    expect(getReminderPermission).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  test('Concept N ignores a delayed notification permission rejection after unmount', async () => {
    let rejectPermission: ((reason?: unknown) => void) | undefined;
    const onAsyncError = vi.fn();
    vi.mocked(requestReminderPermission).mockImplementationOnce(() => new Promise<boolean>((_resolve, reject) => {
      rejectPermission = reject;
    }));
    window.addEventListener('stash:async-error', onAsyncError);

    try {
      const view = render(notificationSurface(true));
      fireEvent.click(screen.getByRole('button', { name: 'enable browser notifications' }));
      await waitFor(() => expect(requestReminderPermission).toHaveBeenCalledTimes(1));

      view.rerender(notificationSurface(false));
      await act(async () => {
        rejectPermission?.(new Error('late notification permission failure'));
        await Promise.resolve();
      });

      expect(getReminderPermission).toHaveBeenCalledTimes(1);
      expect(onAsyncError).not.toHaveBeenCalled();
      expect(screen.queryByText('late notification permission failure')).not.toBeInTheDocument();
      expect(console.error).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('stash:async-error', onAsyncError);
    }
  });

  test('Concept N permission retry becomes inert after the panel unmounts', async () => {
    vi.mocked(requestReminderPermission).mockRejectedValueOnce(new Error('permission retry should expire'));

    const view = render(notificationSurface(true));
    fireEvent.click(screen.getByRole('button', { name: 'enable browser notifications' }));
    expect(await screen.findByText('permission retry should expire')).toBeInTheDocument();

    view.rerender(notificationSurface(false));
    fireEvent.click(screen.getByRole('button', { name: 'retry request notification permission' }));

    await waitFor(() => expect(screen.queryByText('permission retry should expire')).not.toBeInTheDocument());
    expect(requestReminderPermission).toHaveBeenCalledTimes(1);
  });

  test('Concept O compose failure is visible and retry restores the prompt', async () => {
    vi.mocked(composeSession)
      .mockRejectedValueOnce(new Error('compose unavailable'))
      .mockResolvedValueOnce({
        prompt: '# Task: recovered prompt',
        promptFile: '/tmp/prompt.md',
        suggestedCommand: 'claude < /tmp/prompt.md',
      });

    renderSurface(<ConceptO data={data} reload={vi.fn()} />, '/c/o?todoId=todo-1');

    expect(await screen.findByText('compose unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry compose dispatch prompt' }));

    expect(await screen.findByText('# Task: recovered prompt')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('compose unavailable')).not.toBeInTheDocument());
    expect(composeSession).toHaveBeenCalledTimes(2);
  });
});
