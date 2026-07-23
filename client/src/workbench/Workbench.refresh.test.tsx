import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import { Workbench } from './Workbench';
import type { WBData } from './data';

const hookState = vi.hoisted(() => ({
  data: undefined as WBData | undefined,
  loading: false,
  error: undefined as Error | undefined,
  reload: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock('./useWorkbenchData', () => ({
  useWorkbenchData: () => hookState,
}));
vi.mock('../components/ThemeSwitcher', () => ({ ThemeSwitcher: () => null }));
vi.mock('./AppNavigation', () => ({ AppNavigation: () => null }));
vi.mock('./pages/WorkPage', () => ({
  WorkPage: () => <div data-testid="work-page">cached workbench</div>,
}));
vi.mock('./pages/ProjectFormPage', () => ({ ProjectFormPage: () => null }));
vi.mock('./pages/SessionDetailPage', () => ({ SessionDetailPage: () => null }));
vi.mock('./pages/UsageReviewPage', () => ({ UsageReviewPage: () => null }));
vi.mock('./pages/WeeklyReviewPage', () => ({ WeeklyReviewPage: () => null }));
vi.mock('./pages/ProjectDetailPage', () => ({ ProjectDetailPage: () => null }));
vi.mock('./pages/TodoDetailPage', () => ({ TodoDetailPage: () => null }));
vi.mock('./pages/SkillsSettingsPage', () => ({ SkillsSettingsPage: () => null }));
vi.mock('./pages/SettingsPage', () => ({ SettingsPage: () => null }));
vi.mock('./pages/SessionStartPage', () => ({ SessionStartPage: () => null }));
vi.mock('./pages/ProjectsPage', () => ({ ProjectsPage: () => null }));
vi.mock('./pages/SessionsPage', () => ({ SessionsPage: () => null }));
vi.mock('./DecisionInbox', () => ({ DecisionInbox: () => null }));
vi.mock('./InboxTriage', () => ({ InboxTriage: () => null }));
vi.mock('./ReminderTicker', () => ({ ReminderTicker: () => null }));
vi.mock('./QuickCapture', () => ({ QuickCapture: () => null }));
vi.mock('./SearchPalette', () => ({ SearchPalette: () => null }));
vi.mock('./SmartLists', () => ({ SmartLists: () => null }));
vi.mock('./SourceHealthBanner', () => ({ SourceHealthBanner: () => null }));
vi.mock('./TodayTriage', () => ({ TodayTriage: () => null }));
vi.mock('./AsyncErrorHost', () => ({ AsyncErrorHost: () => null }));

const cachedData: WBData = {
  projects: [],
  sessions: [],
  todos: [],
  stats: {
    activeSessions: 0,
    totalEstimatedTokens: 0,
    totalEstimatedCost: 0,
    projects: 0,
    todosOpen: 0,
    todosDone: 0,
  },
  sourceErrors: [],
};

function renderWorkbench() {
  return render(
    <MemoryRouter>
      <Workbench page="work" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  hookState.data = undefined;
  hookState.loading = false;
  hookState.error = undefined;
  hookState.reload.mockReset();
  hookState.revalidate.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Workbench refresh errors', () => {
  test('keeps cached content visible with an actionable refresh alert', () => {
    hookState.data = cachedData;
    hookState.error = new ApiError(0, 'REQUEST_TIMEOUT', 'request timed out');

    renderWorkbench();

    expect(screen.getByTestId('work-page')).toHaveTextContent('cached workbench');
    expect(screen.getByRole('alert')).toHaveTextContent('REQUEST_TIMEOUT');
    expect(screen.getByRole('alert')).toHaveTextContent('request timed out');
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));
    expect(hookState.reload).toHaveBeenCalledTimes(1);
  });

  test('keeps the blocking error when no successful snapshot exists', () => {
    hookState.error = new Error('initial load failed');

    renderWorkbench();

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your workbench");
    expect(screen.queryByTestId('work-page')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(hookState.reload).toHaveBeenCalledTimes(1);
  });

  test('routes automatic events through revalidation and cleans up listeners and heartbeat', async () => {
    vi.useFakeTimers();
    hookState.data = cachedData;
    const { unmount } = renderWorkbench();

    window.dispatchEvent(new Event('focus'));
    await act(async () => Promise.resolve());
    expect(hookState.revalidate).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('stash:captured'));
    expect(hookState.reload).toHaveBeenCalledTimes(1);

    unmount();
    hookState.reload.mockClear();
    hookState.revalidate.mockClear();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('stash:captured'));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(hookState.reload).not.toHaveBeenCalled();
    expect(hookState.revalidate).not.toHaveBeenCalled();
  });
});
