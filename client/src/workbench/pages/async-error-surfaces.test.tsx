import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Budget, WorkItem } from '@stash/shared';
import { listBudgets } from '../../api/budgets';
import { composeSession, listDispatchRuns } from '../../api/sessions';
import { listProjectSkills, listSkills } from '../../api/skills';
import { getWorkItem } from '../../api/work-items';
import { WorkbenchDialogProvider } from '../../components/ui/workbench-dialogs';
import { AsyncErrorHost } from '../AsyncErrorHost';
import type { WBData } from '../data';
import { getReminderPermission, requestReminderPermission } from '../ReminderTicker';
import { SettingsPage } from './SettingsPage';
import { SessionStartPage } from './SessionStartPage';

vi.mock('../../components/effects', () => ({
  CountUp: ({ to, format }: { to: number; format?: (n: number) => string }) => <span>{format ? format(to) : to}</span>,
  CursorGlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  LiveDot: () => <span />,
  ParticleField: () => null,
  ShinyText: ({ children }: { children: ReactNode }) => <>{children}</>,
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
  getWorkItem: vi.fn(),
}));
vi.mock('../ReminderTicker', () => ({
  getReminderPermission: vi.fn(() => 'unsupported'),
  requestReminderPermission: vi.fn(async () => false),
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
  vi.mocked(getWorkItem).mockResolvedValue(workItem);
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

function notificationSurface(showPage: boolean) {
  return (
    <MemoryRouter>
      <WorkbenchDialogProvider>
        <AsyncErrorHost />
        {showPage && <SettingsPage data={data} reload={vi.fn()} />}
      </WorkbenchDialogProvider>
    </MemoryRouter>
  );
}

describe('high-value optional surface failures', () => {
  test('Settings exposes only controls backed by real application state', () => {
    renderSurface(<SettingsPage data={data} reload={vi.fn()} />);

    expect(screen.getByRole('link', { name: /appearance/ })).toHaveAttribute('href', '#settings-appearance');
    expect(screen.getByRole('link', { name: /notifications/ })).toHaveAttribute('href', '#settings-notifications');
    expect(screen.getByRole('link', { name: /budgets/ })).toHaveAttribute('href', '#settings-budgets');
    expect(screen.getByRole('button', { name: 'Apply Cyber neon theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('integrations')).not.toBeInTheDocument();
    expect(screen.queryByText('quick toggles')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'connect' })).not.toBeInTheDocument();
  });

  test('Settings budget failure is visible and retry replaces the false empty state', async () => {
    vi.mocked(listBudgets)
      .mockRejectedValueOnce(new Error('budgets unavailable'))
      .mockResolvedValueOnce([budget]);

    renderSurface(<SettingsPage data={data} reload={vi.fn()} />);

    expect(await screen.findByText('budgets unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry load settings budgets' }));

    expect(await screen.findByText('$42.00')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('budgets unavailable')).not.toBeInTheDocument());
    expect(listBudgets).toHaveBeenCalledTimes(2);
  });

  test('Settings surfaces a notification permission rejection and safely retries it', async () => {
    vi.mocked(requestReminderPermission)
      .mockRejectedValueOnce(new Error('notification permission unavailable'))
      .mockImplementationOnce(async () => {
        vi.mocked(getReminderPermission).mockReturnValue('granted');
        return true;
      });

    renderSurface(<SettingsPage data={data} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'enable browser notifications' }));

    expect(await screen.findByText('notification permission unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry request notification permission' }));

    await waitFor(() => expect(requestReminderPermission).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'notifications enabled' })).toBeDisabled();
    await waitFor(() => expect(screen.queryByText('notification permission unavailable')).not.toBeInTheDocument());
  });

  test('Settings ignores a delayed notification permission resolve after unmount', async () => {
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

  test('Settings ignores a delayed notification permission rejection after unmount', async () => {
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

  test('Settings permission retry becomes inert after the panel unmounts', async () => {
    vi.mocked(requestReminderPermission).mockRejectedValueOnce(new Error('permission retry should expire'));

    const view = render(notificationSurface(true));
    fireEvent.click(screen.getByRole('button', { name: 'enable browser notifications' }));
    expect(await screen.findByText('permission retry should expire')).toBeInTheDocument();

    view.rerender(notificationSurface(false));
    fireEvent.click(screen.getByRole('button', { name: 'retry request notification permission' }));

    await waitFor(() => expect(screen.queryByText('permission retry should expire')).not.toBeInTheDocument());
    expect(requestReminderPermission).toHaveBeenCalledTimes(1);
  });

  test('Session starter compose failure is visible and retry restores the prompt', async () => {
    vi.mocked(composeSession)
      .mockRejectedValueOnce(new Error('compose unavailable'))
      .mockResolvedValueOnce({
        prompt: '# Task: recovered prompt',
        promptFile: '/tmp/prompt.md',
        suggestedCommand: 'claude < /tmp/prompt.md',
      });

    renderSurface(<SessionStartPage data={data} reload={vi.fn()} />, '/sessions/new?todoId=todo-1');

    expect(await screen.findByText('compose unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry compose dispatch prompt' }));

    expect(await screen.findByText('# Task: recovered prompt')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('compose unavailable')).not.toBeInTheDocument());
    expect(composeSession).toHaveBeenCalledTimes(2);
  });
});
