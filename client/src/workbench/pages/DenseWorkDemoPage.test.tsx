import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { captureWorkItem, updateWorkItem } from '../../api/work-items';
import type { WBData, WBTodo } from '../data';
import { DenseWorkDemoPage } from './DenseWorkDemoPage';

vi.mock('../../api/work-items', () => ({
  captureWorkItem: vi.fn(),
  updateWorkItem: vi.fn(),
}));

function todo(overrides: Partial<WBTodo>): WBTodo {
  return {
    id: 'todo-1',
    text: 'Ship the now-first work surface',
    project: 'aurora',
    tags: [],
    done: false,
    status: 'planned',
    priority: 'p1',
    kind: 'task',
    todayPinned: false,
    updatedAt: '2026-08-11T08:00:00.000Z',
    recurring: false,
    reminding: false,
    ...overrides,
  };
}

const data: WBData = {
  runtime: {
    timeZone: 'Asia/Shanghai',
    calendarDate: '2026-08-11',
    now: '2026-08-11T09:00:00.000Z',
  },
  projects: [{
    id: 'aurora',
    name: 'Aurora',
    emoji: '◐',
    progress: 42,
    status: 'active',
    doing: 'shipping',
    features: [],
    todoCount: 4,
    todoDone: 0,
    sessions: 0,
    estimatedTokens: 0,
    lastModel: 'codex',
    lastTouched: Date.now(),
  }],
  todos: [
    todo({ id: 'focus', text: 'Fix the two failing auth tests', status: 'active', priority: 'p0' }),
    todo({ id: 'today', text: 'Review the launch note', todayPinned: true, priority: 'p2' }),
    todo({ id: 'inbox', text: 'Triage a captured thought', project: null, status: 'inbox', priority: 'p2' }),
    todo({ id: 'later', text: 'Prepare the follow-up', status: 'waiting', priority: 'p3' }),
  ],
  sessions: [],
  sourceErrors: [],
  stats: { activeSessions: 0, totalEstimatedTokens: 0, projects: 1, todosOpen: 4, todosDone: 0 },
};

function renderPreview(reload = vi.fn()) {
  return {
    reload,
    ...render(
      <MemoryRouter>
        <DenseWorkDemoPage data={data} reload={reload} />
      </MemoryRouter>,
    ),
  };
}

beforeEach(() => {
  vi.mocked(captureWorkItem).mockReset();
  vi.mocked(updateWorkItem).mockReset();
  vi.mocked(captureWorkItem).mockResolvedValue({} as never);
  vi.mocked(updateWorkItem).mockResolvedValue({} as never);
});

describe('now-first work preview', () => {
  test('makes one item dominant and keeps the remaining commitments secondary', () => {
    const { container } = renderPreview();

    expect(screen.getByRole('heading', { name: 'Now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fix the two failing auth tests' })).toBeInTheDocument();
    expect(screen.getByText('Review the launch note')).toBeInTheDocument();
    expect(container.querySelectorAll('.nf-today-row')).toHaveLength(1);
    expect(screen.getByText('Triage a captured thought')).toBeInTheDocument();
    expect(screen.getByText('Prepare the follow-up')).toBeInTheDocument();
  });

  test('captures without requiring the user to sort first', async () => {
    const { reload } = renderPreview();

    fireEvent.change(screen.getByLabelText('Capture without sorting'), {
      target: { value: 'Book dentist !tomorrow' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Inbox' }));

    await waitFor(() => expect(captureWorkItem).toHaveBeenCalledWith('Book dentist !tomorrow'));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved to Inbox');
    expect(reload).toHaveBeenCalledOnce();
  });

  test('promotes a Today item into the current focus using the canonical active transition', async () => {
    const { reload } = renderPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Make Review the launch note the current focus' }));

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith('today', {
      status: 'active',
      todayPinned: false,
      scheduledFor: null,
      sortOrder: null,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Now working on');
    expect(reload).toHaveBeenCalledOnce();
  });

  test('completes the current focus using the canonical done transition', async () => {
    renderPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(updateWorkItem).toHaveBeenCalledWith('focus', {
      status: 'done',
      todayPinned: false,
      sortOrder: null,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Completed');
  });

  test('shows persistence failures instead of pretending capture succeeded', async () => {
    vi.mocked(captureWorkItem).mockRejectedValueOnce(new Error('capture endpoint unavailable'));
    renderPreview();

    fireEvent.change(screen.getByLabelText('Capture without sorting'), { target: { value: 'Keep this thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Inbox' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('capture endpoint unavailable');
  });
});
