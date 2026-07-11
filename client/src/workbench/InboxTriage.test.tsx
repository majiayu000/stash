import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WorkItem } from '@stash/shared';
import { WorkbenchDialogProvider } from '../components/ui/workbench-dialogs';
import {
  listWorkItems,
  setPriority,
  togglePin,
  updateWorkItem,
} from '../api/work-items';
import { InboxTriage } from './InboxTriage';

vi.mock('../api/work-items', () => ({
  listWorkItems: vi.fn(),
  setPriority: vi.fn(),
  togglePin: vi.fn(),
  updateWorkItem: vi.fn(),
}));

function workItem(id: string): WorkItem {
  return {
    id,
    title: `Inbox ${id}`,
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
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

const inboxItems = [workItem('inbox-1'), workItem('inbox-2')];

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

type ModalFixture = 'semantic' | 'td-overlay' | 'native-dialog';

function modalFixture(kind?: ModalFixture) {
  if (kind === 'semantic') return <div role="dialog" aria-modal="true">semantic modal</div>;
  if (kind === 'td-overlay') return <div className="td-overlay">todo detail modal</div>;
  if (kind === 'native-dialog') return <dialog open>native dialog</dialog>;
  return null;
}

function renderTriage({ modal }: { modal?: ModalFixture } = {}) {
  return render(
    <MemoryRouter initialEntries={['/c/n']}>
      <WorkbenchDialogProvider>
        <InboxTriage />
        <button type="button">settings paths</button>
        <input aria-label="settings path" />
        <textarea aria-label="settings notes" />
        <select aria-label="settings theme"><option>dark</option></select>
        <div role="button" tabIndex={0}>custom action</div>
        <div contentEditable data-testid="editable-control" suppressContentEditableWarning>editable</div>
        {modalFixture(modal)}
        {inboxItems.map((item) => <div key={item.id} data-inbox-item={item.id} />)}
        <LocationProbe />
      </WorkbenchDialogProvider>
    </MemoryRouter>,
  );
}

async function waitForInboxCursor(id = 'inbox-1') {
  await waitFor(() => {
    expect(document.querySelector(`[data-inbox-item="${id}"]`)).toHaveAttribute('data-cursor', 'true');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listWorkItems).mockResolvedValue(inboxItems);
  vi.mocked(updateWorkItem).mockResolvedValue(inboxItems[0]!);
  vi.mocked(setPriority).mockResolvedValue(inboxItems[0]!);
  vi.mocked(togglePin).mockResolvedValue(inboxItems[0]!);
});

describe('InboxTriage keyboard safety', () => {
  test('does not run destructive shortcuts from Settings or other interactive controls', async () => {
    renderTriage();
    await waitForInboxCursor();

    const controls = [
      screen.getByRole('button', { name: 'settings paths' }),
      screen.getByRole('textbox', { name: 'settings path' }),
      screen.getByRole('textbox', { name: 'settings notes' }),
      screen.getByRole('combobox', { name: 'settings theme' }),
      screen.getByRole('button', { name: 'custom action' }),
      screen.getByTestId('editable-control'),
    ];

    for (const control of controls) {
      control.focus();
      fireEvent.keyDown(control, { key: 'd' });
    }

    expect(updateWorkItem).not.toHaveBeenCalled();
  });

  test.each([
    ['semantic modal', 'semantic'],
    ['Concept L todo-detail overlay', 'td-overlay'],
    ['native open dialog', 'native-dialog'],
  ] as const)('pauses inbox writes while %s is open', async (_label, modal) => {
    renderTriage({ modal });
    await waitForInboxCursor();

    fireEvent.keyDown(document.body, { key: 'd' });

    expect(updateWorkItem).not.toHaveBeenCalled();
  });

  test('pauses inbox writes while keyboard help is open', async () => {
    renderTriage();
    await waitForInboxCursor();

    fireEvent.keyDown(document.body, { key: '?' });
    expect(await screen.findByText('keyboard shortcuts')).toBeVisible();
    fireEvent.keyDown(document.body, { key: 'd' });

    expect(updateWorkItem).not.toHaveBeenCalled();
  });

  test('navigates j/k cursor selection to its work-item detail on Enter', async () => {
    renderTriage();
    await waitForInboxCursor();

    fireEvent.keyDown(document.body, { key: 'j' });
    await waitForInboxCursor('inbox-2');
    fireEvent.keyDown(document.body, { key: 'k' });
    await waitForInboxCursor('inbox-1');
    fireEvent.keyDown(document.body, { key: 'j' });
    await waitForInboxCursor('inbox-2');
    fireEvent.keyDown(document.body, { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/c/l/inbox-2'));
  });

  test.each([
    ['Cmd', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
  ] as const)('claims %s+Z only when it executes the pending Inbox undo', async (_label, modifier) => {
    renderTriage();
    await waitForInboxCursor();

    fireEvent.keyDown(document.body, { key: 'd' });
    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith('inbox-1', { status: 'dropped' }));
    await screen.findByTestId('tri-toast');

    const subsequentListener = vi.fn();
    window.addEventListener('keydown', subsequentListener);
    fireEvent.keyDown(document.body, { key: 'z', ...modifier });

    await waitFor(() => expect(updateWorkItem).toHaveBeenLastCalledWith('inbox-1', { status: 'inbox' }));
    expect(subsequentListener).not.toHaveBeenCalled();
    window.removeEventListener('keydown', subsequentListener);
  });

  test('does not consume an undo key when Inbox has no pending undo', async () => {
    renderTriage();
    await waitForInboxCursor();

    const subsequentListener = vi.fn();
    window.addEventListener('keydown', subsequentListener);
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);

    expect(subsequentListener).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    window.removeEventListener('keydown', subsequentListener);
  });

  test.each([
    ['Cmd', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
  ] as const)('leaves %s+Shift+Z redo untouched even with a pending undo', async (_label, modifier) => {
    renderTriage();
    await waitForInboxCursor();

    fireEvent.keyDown(document.body, { key: 'd' });
    await screen.findByTestId('tri-toast');

    const subsequentListener = vi.fn();
    window.addEventListener('keydown', subsequentListener);
    fireEvent.keyDown(document.body, { key: 'Z', shiftKey: true, ...modifier });

    expect(updateWorkItem).toHaveBeenCalledTimes(1);
    expect(subsequentListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', subsequentListener);
  });

  test('bulk undo restores every changed item and the prior selection', async () => {
    renderTriage();
    await waitForInboxCursor();

    fireEvent.keyDown(document.body, { key: 'v' });
    fireEvent.keyDown(document.body, { key: 'j' });
    await waitForInboxCursor('inbox-2');
    fireEvent.keyDown(document.body, { key: 'v' });
    fireEvent.keyDown(document.body, { key: 'n' });

    await waitFor(() => {
      expect(updateWorkItem).toHaveBeenCalledWith('inbox-1', { status: 'planned' });
      expect(updateWorkItem).toHaveBeenCalledWith('inbox-2', { status: 'planned' });
    });
    expect(screen.queryByTestId('tri-sel-count')).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

    await waitFor(() => {
      expect(updateWorkItem).toHaveBeenCalledWith('inbox-1', { status: 'inbox' });
      expect(updateWorkItem).toHaveBeenCalledWith('inbox-2', { status: 'inbox' });
      expect(screen.getByTestId('tri-sel-count')).toHaveTextContent('2 selected');
    });
  });
});
