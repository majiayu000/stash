import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './styles/brand.css';
import './styles/dashboard.css';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { ApiError } from '../api/client';
import { prefetchWeeklySnapshot } from '../api/analytics';
import { AsyncErrorHost } from './AsyncErrorHost';
import { AppNavigation } from './AppNavigation';
import { invalidateWorkbenchData, useWorkbenchData } from './useWorkbenchData';
import { WorkPage } from './pages/WorkPage';
import { ProjectFormPage } from './pages/ProjectFormPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { UsageReviewPage } from './pages/UsageReviewPage';
import { WeeklyReviewPage } from './pages/WeeklyReviewPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { TodoDetailPage } from './pages/TodoDetailPage';
import { SkillsSettingsPage } from './pages/SkillsSettingsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SessionStartPage } from './pages/SessionStartPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SessionsPage } from './pages/SessionsPage';
import { isIsoWeekLabel } from './pages/weekly-review.week';
import { DecisionInbox } from './DecisionInbox';
import { InboxTriage } from './InboxTriage';
import { ReminderTicker } from './ReminderTicker';
import { QuickCapture } from './QuickCapture';
import { SearchPalette } from './SearchPalette';
import { SmartLists } from './SmartLists';
import { SourceHealthBanner } from './SourceHealthBanner';
import { TodayTriage } from './TodayTriage';
import type { WBData } from './data';

export type WorkbenchPage =
  | 'work'
  | 'todo-detail'
  | 'projects'
  | 'project-form'
  | 'project-detail'
  | 'sessions'
  | 'session-start'
  | 'session-detail'
  | 'review'
  | 'review-usage'
  | 'settings'
  | 'settings-skills';

function renderPage(
  page: WorkbenchPage,
  data: WBData,
  reload: () => void,
  calendar_blocked: boolean,
  calendar_error: Error | undefined,
): ReactNode {
  const props = { data, reload };
  if (calendar_blocked && (page === 'work' || page === 'review')) {
    return <CalendarRefreshBlock error={calendar_error} onRetry={reload} />;
  }
  switch (page) {
    case 'work': return <WorkPage {...props} />;
    case 'todo-detail': return <TodoDetailPage {...props} />;
    case 'projects': return <ProjectsPage {...props} />;
    case 'project-form': return <ProjectFormPage {...props} />;
    case 'project-detail': return <ProjectDetailPage {...props} />;
    case 'sessions': return <SessionsPage {...props} />;
    case 'session-start': return <SessionStartPage {...props} />;
    case 'session-detail': return <SessionDetailPage {...props} />;
    case 'review': return <WeeklyReviewPage {...props} />;
    case 'review-usage': return <UsageReviewPage {...props} />;
    case 'settings': return <SettingsPage {...props} />;
    case 'settings-skills': return <SkillsSettingsPage {...props} />;
  }
}

export function Workbench({ page }: { page: WorkbenchPage }) {
  const dataMode = page === 'review' ? 'review_core' : 'full';
  const { data, loading, error, calendarBlocked, reload, revalidate } = useWorkbenchData(dataMode);
  const location = useLocation();
  const requestedWeek = new URLSearchParams(location.search).get('week');
  const selectedWeek = isIsoWeekLabel(requestedWeek) ? requestedWeek : undefined;

  useLayoutEffect(() => {
    if (page !== 'review') return;
    void prefetchWeeklySnapshot(selectedWeek).catch((prefetch_error: unknown) => {
      console.error('[stash] weekly review prefetch failed', prefetch_error);
    });
  }, [page, selectedWeek]);

  useEffect(() => {
    function onCaptured() {
      invalidateWorkbenchData();
      reload();
    }
    window.addEventListener('stash:captured', onCaptured);
    return () => window.removeEventListener('stash:captured', onCaptured);
  }, [reload]);

  useEffect(() => {
    let pendingFocusReload = false;
    function onFocus() {
      if (document.visibilityState === 'visible' && !pendingFocusReload) {
        pendingFocusReload = true;
        Promise.resolve().then(() => { pendingFocusReload = false; revalidate(); });
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') revalidate();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') revalidate();
    }, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(heartbeat);
    };
  }, [revalidate]);

  if (loading && !data) {
    return (
      <div className="app-loading" role="status">
        Loading your workbench…
      </div>
    );
  }
  if (error && !data) {
    const api = error instanceof ApiError ? ` (${error.status || 'network'} ${error.code})` : '';
    return (
      <div className="app-load-error" role="alert">
        <h1>We couldn't load your workbench{api}.</h1>
        <p>{error.message}</p>
        <button type="button" onClick={reload}>Try again</button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="workbench-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <AppNavigation />
      <div className="app-theme-picker" aria-label="Theme">
        <ThemeSwitcher />
      </div>

      <QuickCapture />
      <InboxTriage />
      <DecisionInbox reload={reload} />
      <SearchPalette />
      <SmartLists calendarDate={data.runtime.calendarDate} />
      <ReminderTicker />
      <TodayTriage />
      <SourceHealthBanner errors={data.sourceErrors} onRetry={reload} />
      {error ? <WorkbenchRefreshAlert error={error} onRetry={reload} /> : null}
      <AsyncErrorHost key={`${location.pathname}${location.search}`} />

      <main id="main-content" className="workbench-main">
        <SectionNavigation page={page} />
        {renderPage(page, data, reload, calendarBlocked, error)}
      </main>

      <style>{workbenchStyles}</style>
    </div>
  );
}

function CalendarRefreshBlock({
  error,
  onRetry,
}: {
  error: Error | undefined;
  onRetry: () => void;
}) {
  return (
    <div className="app-load-error" role="alert" data-testid="calendar-refresh-block">
      <h1>Calendar data needs a server refresh.</h1>
      <p>
        {error
          ? `The refresh failed: ${error.message}`
          : 'The configured-zone day changed. Refreshing Today and Later before showing them.'}
      </p>
      <button type="button" onClick={onRetry}>Retry calendar refresh</button>
    </div>
  );
}

export function WorkbenchRefreshAlert({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const api = error instanceof ApiError ? ` (${error.status || 'network'} ${error.code})` : '';
  return (
    <aside className="workbench-refresh-error" role="alert">
      <div>
        <strong>Workbench refresh failed{api}.</strong>
        <span>{error.message}</span>
      </div>
      <button type="button" onClick={onRetry}>Retry refresh</button>
    </aside>
  );
}

function SectionNavigation({ page }: { page: WorkbenchPage }) {
  const { pathname } = useLocation();
  const items = page === 'review' || page === 'review-usage'
    ? [
      { to: '/review', label: 'Weekly review' },
      { to: '/review/usage', label: 'Usage & cost' },
    ]
    : page === 'settings' || page === 'settings-skills'
      ? [
        { to: '/settings', label: 'Preferences' },
        { to: '/settings/skills', label: 'Skills' },
      ]
      : null;

  if (!items) return null;
  return (
    <nav className="section-navigation" aria-label={page.startsWith('review') ? 'Review pages' : 'Settings pages'}>
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link key={item.to} to={item.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

const workbenchStyles = `
.workbench-shell {
  min-height: 100vh;
  padding: 1rem 1rem 5.5rem 13.5rem;
  position: relative;
}
.workbench-main { min-width: 0; }
.section-navigation {
  display: flex;
  gap: 0.25rem;
  margin: 0 0 0.75rem;
  padding: 0.25rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: var(--bg-glass);
  width: fit-content;
}
.section-navigation a {
  min-height: 2.25rem;
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.7rem;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-decoration: none;
  font: 700 0.72rem/1 var(--font-mono);
}
.section-navigation a:hover { color: var(--text-primary); }
.section-navigation a.active { background: var(--bg-elevated); color: var(--neon-cyan); }
.section-navigation a:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px; }
.workbench-shell .topbar { padding-right: 6.5rem; }
.app-theme-picker {
  position: fixed;
  top: 1.45rem;
  right: 1.5rem;
  z-index: 65;
}
.skip-link {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 1000;
  transform: translateY(-160%);
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-md);
  background: var(--neon-cyan);
  color: var(--bg-void);
  font-weight: 700;
}
.skip-link:focus { transform: translateY(0); }
.dashboard-canvas {
  min-height: calc(100vh - 7.5rem);
  height: auto;
}
.dashboard-canvas .inner {
  height: auto !important;
  min-height: calc(100vh - 7.5rem);
  display: flex;
  flex-direction: column;
}
.app-loading,
.app-load-error {
  min-height: 100vh;
  display: grid;
  place-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.app-load-error { justify-items: start; color: var(--text-secondary); }
.app-load-error h1,
.app-load-error p { margin: 0; }
.app-load-error button {
  min-height: 2.75rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid var(--neon-cyan);
  border-radius: var(--radius-md);
  background: var(--neon-cyan);
  color: var(--bg-void);
  font: inherit;
  font-weight: 700;
}
.workbench-refresh-error {
  position: relative;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 0 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--neon-pink);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--neon-pink) 10%, var(--bg-elevated));
  color: var(--text-secondary);
  font: 600 0.75rem/1.4 var(--font-mono);
}
.workbench-refresh-error div { display: grid; gap: 0.2rem; }
.workbench-refresh-error strong { color: var(--neon-pink); }
.workbench-refresh-error button {
  min-height: 2.5rem;
  flex: 0 0 auto;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--neon-pink);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
}
.workbench-refresh-error button:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 2px;
}
@media (max-width: 1100px) {
  .workbench-shell { padding: 5.25rem 0.75rem 5.5rem; }
  .app-theme-picker { top: 1.15rem; right: 1.15rem; }
  .workbench-shell .topbar { padding-right: 1rem; }
  .workbench-refresh-error { align-items: flex-start; }
}
@media (max-width: 720px) {
  .workbench-shell { padding: 0.75rem 0.75rem 6rem; }
  .app-theme-picker { top: 0.65rem; right: 0.75rem; }
  .workbench-shell .topbar { padding: 3.5rem 1rem 1rem; }
  .dashboard-canvas,
  .dashboard-canvas .inner { min-height: calc(100vh - 7rem); }
  .dashboard-canvas > .inner { padding: 0.75rem; }
  .section-navigation { width: 100%; }
  .section-navigation a { flex: 1; justify-content: center; }
}
`;
