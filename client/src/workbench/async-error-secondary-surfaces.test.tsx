import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Milestone } from '@stash/shared';
import {
  createMilestone,
  updateMilestone,
} from '../api/project-knowledge';
import {
  listToday,
  listWorkItems,
} from '../api/work-items';
import { WorkbenchDialogProvider } from '../components/ui/workbench-dialogs';
import { AsyncErrorHost } from './AsyncErrorHost';
import { InboxTriage } from './InboxTriage';
import { ReminderTicker, requestReminderPermission } from './ReminderTicker';
import { TodayTriage } from './TodayTriage';
import { KnowledgeMilestonesEditor } from './concepts/conceptK.knowledge';

vi.mock('../api/work-items', () => ({
  listToday: vi.fn(),
  listWorkItems: vi.fn(),
  setPriority: vi.fn(),
  togglePin: vi.fn(),
  updateWorkItem: vi.fn(),
}));

vi.mock('../api/project-knowledge', () => ({
  createDecision: vi.fn(),
  createLesson: vi.fn(),
  createMilestone: vi.fn(),
  deleteDecision: vi.fn(),
  deleteLesson: vi.fn(),
  deleteMilestone: vi.fn(),
  setProjectIntent: vi.fn(),
  setProjectNotes: vi.fn(),
  updateDecision: vi.fn(),
  updateLesson: vi.fn(),
  updateMilestone: vi.fn(),
}));

const milestone: Milestone = {
  id: 'milestone-1',
  projectId: 'project-1',
  name: 'make failures visible',
  status: 'planned',
  progress: 25,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
};

function renderWithErrors(children: ReactNode) {
  return render(
    <MemoryRouter>
      <WorkbenchDialogProvider>
        <AsyncErrorHost />
        {children}
      </WorkbenchDialogProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(listWorkItems).mockResolvedValue([]);
  vi.mocked(listToday).mockResolvedValue([]);
  vi.mocked(createMilestone).mockResolvedValue(milestone);
  vi.mocked(updateMilestone).mockResolvedValue({ ...milestone, status: 'wip' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('secondary Workbench async failures', () => {
  test('notification permission helper preserves a browser rejection', async () => {
    class RejectingNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = vi.fn().mockRejectedValue(new Error('browser permission request failed'));
    }
    vi.stubGlobal('Notification', RejectingNotification);

    await expect(requestReminderPermission()).rejects.toThrow('browser permission request failed');
    expect(RejectingNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  test('Inbox and Today reload failures are visible and retry their safe reads', async () => {
    vi.mocked(listWorkItems)
      .mockRejectedValueOnce(new Error('inbox reload unavailable'))
      .mockResolvedValueOnce([]);
    vi.mocked(listToday)
      .mockRejectedValueOnce(new Error('today reload unavailable'))
      .mockResolvedValueOnce([]);

    renderWithErrors(<><InboxTriage /><TodayTriage /></>);

    expect(await screen.findByText('inbox reload unavailable')).toBeInTheDocument();
    expect(await screen.findByText('today reload unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'retry reload inbox triage' }));
    fireEvent.click(screen.getByRole('button', { name: 'retry reload today triage' }));

    await waitFor(() => expect(listWorkItems).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(listToday).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('inbox reload unavailable')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('today reload unavailable')).not.toBeInTheDocument());
  });

  test('Reminder polling failure is visible and retry repeats only the safe read', async () => {
    class GrantedNotification {
      static permission: NotificationPermission = 'granted';
    }
    vi.stubGlobal('Notification', GrantedNotification);
    vi.mocked(listWorkItems)
      .mockRejectedValueOnce(new Error('reminder poll unavailable'))
      .mockResolvedValueOnce([]);

    renderWithErrors(<ReminderTicker />);

    expect(await screen.findByText('reminder poll unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry poll reminders' }));

    await waitFor(() => expect(listWorkItems).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('reminder poll unavailable')).not.toBeInTheDocument());
  });

  test('Concept K idempotent milestone update failure is visible and retryable', async () => {
    const onChange = vi.fn();
    vi.mocked(updateMilestone)
      .mockRejectedValueOnce(new Error('milestone update unavailable'))
      .mockResolvedValueOnce({ ...milestone, status: 'wip' });

    renderWithErrors(
      <KnowledgeMilestonesEditor projectId="project-1" value={[milestone]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByTitle('click to cycle status (currently planned)'));
    expect(await screen.findByText('milestone update unavailable')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'retry update project milestone' }));

    await waitFor(() => expect(updateMilestone).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('milestone update unavailable')).not.toBeInTheDocument());
  });

  test('Concept K create failure is visible without an unsafe automatic retry', async () => {
    vi.mocked(createMilestone).mockRejectedValueOnce(new Error('milestone create uncertain'));

    renderWithErrors(
      <KnowledgeMilestonesEditor projectId="project-1" value={[]} onChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ add' }));
    fireEvent.change(await screen.findByTestId('ui-dialog-input'), { target: { value: 'ship it' } });
    fireEvent.click(screen.getByTestId('ui-dialog-confirm'));

    expect(await screen.findByText('milestone create uncertain')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'retry create project milestone' })).not.toBeInTheDocument();
  });
});
