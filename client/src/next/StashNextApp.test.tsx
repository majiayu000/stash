import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WorkItem } from '@stash/shared';
import { captureWorkItem, getWorkItem, updateWorkItem } from '../api/work-items';
import type { WBData, WBTodo } from '../workbench/data';
import { StashNextApp } from './StashNextApp';

vi.mock('../api/work-items', () => ({
  captureWorkItem: vi.fn(),
  getWorkItem: vi.fn(),
  updateWorkItem: vi.fn(),
}));

function nextTodo(overrides: Partial<WBTodo>): WBTodo {
  return {
    id: 'todo', text: 'A task', project: 'aurora', tags: [], done: false,
    status: 'planned', priority: 'p2', kind: 'task', todayPinned: false,
    updatedAt: '2026-08-20T08:00:00.000Z', recurring: false, reminding: false,
    ...overrides,
  };
}

const todos = [
  nextTodo({ id: 'active', text: 'Finish auth refresh', status: 'active', priority: 'p0', estimateMinutes: 45 }),
  nextTodo({ id: 'due', text: 'Renew the certificate', dueAt: '2026-08-27', priority: 'p1', estimateMinutes: 20 }),
  nextTodo({ id: 'candidate', text: 'Prepare launch notes', scheduledFor: '2026-08-30', priority: 'p1' }),
  nextTodo({ id: 'inbox', text: 'Think about voice capture', status: 'inbox', project: null }),
  nextTodo({ id: 'waiting', text: 'Wait for legal reply', status: 'waiting', priority: 'p0' }),
];

const data: WBData = {
  runtime: { timeZone: 'Asia/Shanghai', calendarDate: '2026-08-27', now: '2026-08-27T09:00:00.000Z' },
  projects: [{
    id: 'aurora', name: 'Aurora', emoji: '◐', progress: 42, status: 'active', doing: 'shipping',
    features: [], todoCount: 4, todoDone: 0, sessions: 0, estimatedTokens: 0,
    lastModel: 'codex', lastTouched: Date.now(),
  }],
  todos,
  sessions: [], sourceErrors: [],
  stats: { activeSessions: 0, totalEstimatedTokens: 0, projects: 1, todosOpen: 5, todosDone: 0 },
};

const detail: WorkItem = {
  id: 'active', projectId: 'aurora', title: 'Finish auth refresh', description: 'Close the expiry regression before release.',
  kind: 'task', status: 'active', priority: 'p0', source: 'manual', confidence: 'explicit', assignee: 'human',
  labels: ['auth'], checklist: [{ id: 'step', text: 'Run the focused test', completed: false }], estimateMinutes: 45,
  links: [], todayPinned: false, createdAt: '2026-08-20T08:00:00.000Z', updatedAt: '2026-08-20T08:00:00.000Z',
};

function renderNext(path = '/next', reload = vi.fn()) {
  return {
    reload,
    ...render(<MemoryRouter initialEntries={[path]}><StashNextApp data={data} reload={reload} /></MemoryRouter>),
  };
}

beforeEach(() => {
  vi.mocked(captureWorkItem).mockReset().mockResolvedValue({} as never);
  vi.mocked(getWorkItem).mockReset().mockResolvedValue(detail);
  vi.mocked(updateWorkItem).mockReset().mockResolvedValue({} as never);
});

describe('Stash Next', () => {
  test('opens as a calm My Day list without leaking Inbox or waiting work', () => {
    renderNext();

    expect(screen.getByRole('heading', { name: 'My Day' })).toBeInTheDocument();
    const taskList = screen.getByRole('region', { name: 'My Day tasks' });
    expect(within(taskList).getByText('Finish auth refresh')).toBeInTheDocument();
    expect(within(taskList).getByText('Renew the certificate')).toBeInTheDocument();
    expect(screen.queryByText('Think about voice capture')).not.toBeInTheDocument();
    expect(screen.queryByText('Wait for legal reply')).not.toBeInTheDocument();
  });

  test('shows explainable recommendations and persists an accepted daily plan', async () => {
    const { reload } = renderNext();
    fireEvent.click(screen.getByRole('button', { name: /Why this order/i }));

    expect(screen.getByRole('heading', { name: 'Let’s make today realistic.' })).toBeInTheDocument();
    const planner = screen.getByRole('complementary', { name: 'Daily suggestions' });
    expect(within(planner).getByText(/Already in progress/)).toBeInTheDocument();
    expect(within(planner).getByText(/Due today/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 tasks' }));

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledTimes(3));
    expect(updateWorkItem).toHaveBeenNthCalledWith(1, 'active', {
      status: 'active', todayPinned: true, scheduledForRelative: 'today', sortOrder: 1,
    });
    expect(reload).toHaveBeenCalled();
  });

  test('captures directly into Inbox', async () => {
    const { reload } = renderNext('/next/inbox');
    fireEvent.change(screen.getByLabelText('Add a task'), { target: { value: 'Book dentist !tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(captureWorkItem).toHaveBeenCalledWith('Book dentist !tomorrow'));
    expect(await screen.findByRole('status')).toHaveTextContent('Added to Inbox');
    expect(reload).toHaveBeenCalled();
  });

  test('opens a lightweight task drawer with real persisted details', async () => {
    renderNext();
    fireEvent.click(screen.getByRole('button', { name: /Finish auth refresh Aurora/ }));

    await waitFor(() => expect(getWorkItem).toHaveBeenCalledWith('active'));
    expect(await screen.findByText('Close the expiry regression before release.')).toBeInTheDocument();
    expect(screen.getByText('Run the focused test')).toBeInTheDocument();
    expect(screen.getByText('#auth')).toBeInTheDocument();
  });

  test('reports a partially applied plan instead of claiming success', async () => {
    vi.mocked(updateWorkItem)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('second write failed'));
    renderNext();
    fireEvent.click(screen.getByRole('button', { name: /Why this order/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 tasks' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Planning stopped after 1 of 3 tasks');
    expect(screen.getByRole('alert')).toHaveTextContent('second write failed');
  });
});
