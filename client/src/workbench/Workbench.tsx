import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import './styles/brand.css';
import './styles/dashboard.css';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { useWorkbenchData } from './useWorkbenchData';
import { findConcept, type ConceptId } from './concepts/registry';
import { renderConcept } from './concepts/render';
import { ConceptSwitcher } from './ConceptSwitcher';
import { InboxTriage } from './InboxTriage';
import { ReminderTicker } from './ReminderTicker';
import { QuickCapture } from './QuickCapture';
import { SearchPalette } from './SearchPalette';
import { SmartLists } from './SmartLists';
import { TodayTriage } from './TodayTriage';
import { WorkbenchFeedbackProvider } from './WorkbenchFeedback';

export function Workbench() {
  const { data, loading, error, reload } = useWorkbenchData();
  const { pathname } = useLocation();
  const params = useParams<{ id?: ConceptId }>();
  const conceptId = conceptIdForPath(pathname, params.id);
  const entry = findConcept(conceptId);

  // SPEC v0.3 — refresh data after Quick Capture submits.
  useEffect(() => {
    function onCaptured() { reload(); }
    window.addEventListener('stash:captured', onCaptured);
    return () => window.removeEventListener('stash:captured', onCaptured);
  }, [reload]);

  // Live refresh — new JSONL files from a dispatched agent should show up
  // without a manual reload. Three triggers, ordered cheapest first:
  //   1. window focus (user came back from another window)
  //   2. document visibilitychange → visible (tab becomes active)
  //   3. 60s heartbeat while the tab is visible
  // No fetch while hidden — keeps idle tabs cheap.
  useEffect(() => {
    let pendingFocusReload = false;
    function onFocus() {
      if (document.visibilityState === 'visible' && !pendingFocusReload) {
        pendingFocusReload = true;
        Promise.resolve().then(() => { pendingFocusReload = false; reload(); });
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') reload();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(heartbeat);
    };
  }, [reload]);

  if (loading && !data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        loading workbench…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'var(--neon-pink)', fontFamily: 'var(--font-mono)' }}>
        Failed to load data: {error.message}
      </div>
    );
  }
  if (!data || !entry) return null;

  const content = renderConcept(entry.id, data, reload);

  return (
    <WorkbenchFeedbackProvider>
      <div className="workbench-shell">
        <div className="workbench-floating">
          <ConceptSwitcher />
          <ThemeSwitcher />
        </div>
        <QuickCapture />
        <InboxTriage />
        <SearchPalette />
        <SmartLists />
        <ReminderTicker />
        <TodayTriage />
        {content}

        <style>{`
          .workbench-shell {
            min-height: 100vh;
            padding: 5.75rem 1.5rem 1.5rem;
            position: relative;
          }
          .workbench-floating {
            position: fixed;
            top: 16px;
            left: 24px;
            right: 24px;
            z-index: 50;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
          }
          .dashboard-canvas {
            min-height: calc(100vh - 3rem);
            height: auto;
          }
          .dashboard-canvas .inner {
            height: auto !important;
            min-height: calc(100vh - 3rem);
            display: flex;
            flex-direction: column;
          }
          [data-testid="concept-switcher"]::-webkit-scrollbar {
            display: none;
          }
          @media (max-width: 760px) {
            .workbench-shell {
              padding: 5.25rem 0.75rem 1rem;
            }
            .workbench-floating {
              left: 0.75rem;
              right: 0.75rem;
              align-items: center;
              overflow: hidden;
            }
            .workbench-floating [data-testid="theme-switcher"] {
              display: none;
            }
            .dashboard-canvas .inner {
              min-height: calc(100vh - 2rem);
            }
          }
        `}</style>
      </div>
    </WorkbenchFeedbackProvider>
  );
}

function conceptIdForPath(pathname: string, routeId?: string): ConceptId {
  if (pathname === '/' || pathname === '') return 'e';
  if (pathname === '/projects') return 'f';
  if (pathname.startsWith('/projects/')) return 'k';
  if (pathname.startsWith('/tasks/')) return 'l';
  if (pathname === '/sessions' || pathname.startsWith('/sessions/')) return 'g';
  if (pathname === '/skills') return 'm';
  if (pathname === '/analytics') return 'h';
  if (pathname === '/done') return 'done';
  if (pathname === '/settings') return 'n';
  if (pathname === '/agent/new') return 'o';
  return (routeId as ConceptId) ?? 'e';
}
