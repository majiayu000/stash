import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WorkItem } from '@stash/shared';
import { WorkbenchDialogProvider } from '../components/ui/workbench-dialogs';
import {
  listToday,
  listWorkItems,
  setPriority,
  togglePin,
  updateWorkItem,
} from '../api/work-items';
import { InboxTriage } from './InboxTriage';
import { TodayTriage } from './TodayTriage';

vi.mock('../api/work-items', () => ({
  listToday: vi.fn(),
  listWorkItems: vi.fn(),
  setPriority: vi.fn(),
  togglePin: vi.fn(),
  updateWorkItem: vi.fn(),
}));

function triageItem(id: string, status: WorkItem['status'], todayPinned: boolean): WorkItem {
  return {
    id,
    title: id,
    kind: 'task',
    status,
    priority: 'p2',
    source: 'manual',
    confidence: 'explicit',
    assignee: 'human',
    labels: [],
    checklist: [],
    links: [],
    todayPinned,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

const inboxItem = triageItem('inbox-1', 'inbox', false);
const todayItem = triageItem('today-1', 'planned', true);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listWorkItems).mockResolvedValue([inboxItem]);
  vi.mocked(listToday).mockResolvedValue([todayItem]);
  vi.mocked(updateWorkItem).mockResolvedValue(inboxItem);
  vi.mocked(setPriority).mockResolvedValue(inboxItem);
  vi.mocked(togglePin).mockResolvedValue(inboxItem);
});

function triageLayers({ inbox = true, today = true }: { inbox?: boolean; today?: boolean } = {}) {
  return (
    <MemoryRouter>
      <WorkbenchDialogProvider>
        {inbox && <InboxTriage />}
        {today && <TodayTriage />}
        {inbox && <div data-inbox-item={inboxItem.id} />}
        {today && <div data-today-item={todayItem.id} />}
      </WorkbenchDialogProvider>
    </MemoryRouter>
  );
}

function renderBothTriageLayers() {
  return render(triageLayers());
}

async function waitForCursors() {
  await waitFor(() => {
    expect(document.querySelector(`[data-inbox-item="${inboxItem.id}"]`)).toHaveAttribute('data-cursor', 'true');
    expect(document.querySelector(`[data-today-item="${todayItem.id}"]`)).toHaveAttribute('data-today-cursor', 'true');
  });
}

async function dropInbox() {
  fireEvent.keyDown(document.body, { key: 'd' });
  await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(inboxItem.id, { status: 'dropped' }));
  await screen.findByTestId('tri-undo');
}

async function dropToday() {
  fireEvent.keyDown(document.body, { key: 'D', shiftKey: true });
  await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(todayItem.id, { status: 'dropped' }));
  await screen.findByTestId('tt-toast');
}

describe('Inbox and Today keyboard undo ordering', () => {
  test('undoes Today then Inbox when Today registered the latest pending action', async () => {
    renderBothTriageLayers();
    await waitForCursors();
    await dropInbox();
    await dropToday();
    vi.mocked(updateWorkItem).mockClear();

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(todayItem.id, { status: 'planned' }));
    await waitFor(() => expect(screen.queryByTestId('tt-undo')).not.toBeInTheDocument());
    expect(updateWorkItem).not.toHaveBeenCalledWith(inboxItem.id, { status: 'inbox' });
    expect(screen.getByTestId('tri-undo')).toBeVisible();

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(inboxItem.id, { status: 'inbox' }));
  });

  test('undoes Inbox then Today when Inbox registered the latest pending action', async () => {
    renderBothTriageLayers();
    await waitForCursors();
    await dropToday();
    await dropInbox();
    vi.mocked(updateWorkItem).mockClear();

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(inboxItem.id, { status: 'inbox' }));
    await waitFor(() => expect(screen.queryByTestId('tri-undo')).not.toBeInTheDocument());
    expect(updateWorkItem).not.toHaveBeenCalledWith(todayItem.id, { status: 'planned' });

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(todayItem.id, { status: 'planned' }));
  });

  test('toast button undoes only its layer and leaves the latest keyboard undo pending', async () => {
    renderBothTriageLayers();
    await waitForCursors();
    await dropInbox();
    await dropToday();
    vi.mocked(updateWorkItem).mockClear();

    fireEvent.click(screen.getByTestId('tri-undo'));

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(inboxItem.id, { status: 'inbox' }));
    await waitFor(() => expect(screen.queryByTestId('tri-undo')).not.toBeInTheDocument());
    expect(updateWorkItem).not.toHaveBeenCalledWith(todayItem.id, { status: 'planned' });

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(todayItem.id, { status: 'planned' }));
  });

  test('Today toast button undoes only Today and leaves the latest Inbox undo pending', async () => {
    renderBothTriageLayers();
    await waitForCursors();
    await dropToday();
    await dropInbox();
    vi.mocked(updateWorkItem).mockClear();

    fireEvent.click(screen.getByTestId('tt-undo'));

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(todayItem.id, { status: 'planned' }));
    await waitFor(() => expect(screen.queryByTestId('tt-undo')).not.toBeInTheDocument());
    expect(updateWorkItem).not.toHaveBeenCalledWith(inboxItem.id, { status: 'inbox' });

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(inboxItem.id, { status: 'inbox' }));
  });

  test('unmounting an older layer does not clear the newer pending undo', async () => {
    const view = renderBothTriageLayers();
    await waitForCursors();
    await dropInbox();
    await dropToday();
    vi.mocked(updateWorkItem).mockClear();

    view.rerender(triageLayers({ inbox: false }));
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith(todayItem.id, { status: 'planned' }));
    expect(updateWorkItem).not.toHaveBeenCalledWith(inboxItem.id, { status: 'inbox' });
  });
});
