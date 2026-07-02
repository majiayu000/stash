import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import './styles/brand.css';
import './styles/dashboard.css';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { ApiError } from '../api/client';
import { useWorkbenchData } from './useWorkbenchData';
import { findConcept } from './concepts/registry';
import { renderConcept } from './concepts/render';
import { ConceptSwitcher } from './ConceptSwitcher';
import { DecisionInbox } from './DecisionInbox';
import { InboxTriage } from './InboxTriage';
import { ReminderTicker } from './ReminderTicker';
import { QuickCapture } from './QuickCapture';
import { SearchPalette } from './SearchPalette';
import { SmartLists } from './SmartLists';
import { SourceHealthBanner } from './SourceHealthBanner';
import { TodayTriage } from './TodayTriage';

type WorkbenchRouteParams = {
  detailId?: string;
  projectId?: string;
  sessionId?: string;
  workItemId?: string;
};

function conceptIdFromParams(params: WorkbenchRouteParams): string {
  if (params.projectId) return 'k';
  if (params.sessionId) return 'g';
  if (params.workItemId) return 'l';
  return params.detailId ?? 'e';
}

export function Workbench() {
  const { data, loading, error, reload } = useWorkbenchData();
  const params = useParams<WorkbenchRouteParams>();
  const routeConceptId = conceptIdFromParams(params);
  const entry = findConcept(routeConceptId);

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
    const api = error instanceof ApiError ? ` (${error.status || 'network'} ${error.code})` : '';
    return (
      <div style={{ padding: '2rem', color: 'var(--neon-pink)', fontFamily: 'var(--font-mono)', display: 'grid', gap: '12px', justifyItems: 'start' }}>
        <div>Failed to load data{api}: {error.message}</div>
        <button
          type="button"
          onClick={reload}
          style={{ border: '1px solid var(--neon-pink)', background: 'transparent', color: 'var(--neon-pink)', borderRadius: 6, padding: '6px 10px', font: 'inherit', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (!entry) return <UnknownConceptState conceptId={routeConceptId} />;
  if (!data) return null;

  const content = renderConcept(entry.id, data, reload);

  return (
    <div className="workbench-shell">
      <div className="workbench-floating" data-testid="workbench-floating">
        <ConceptSwitcher />
        <ThemeSwitcher />
      </div>
      <QuickCapture />
      <InboxTriage />
      <DecisionInbox reload={reload} />
      <SearchPalette />
      <SmartLists />
      <ReminderTicker />
      <TodayTriage />
      <SourceHealthBanner errors={data.sourceErrors} onRetry={reload} />
      {content}

      <style>{`
        .workbench-shell {
          min-height: 100vh;
          /* extra bottom padding keeps page content clear of the fixed
             bottom overlays (AI drafts pill, capture fab) */
          padding: 1.5rem 1.5rem 5.5rem;
          position: relative;
        }
        /* reserve the top-right corner for the fixed switcher stack so it
           never covers the topbar stats */
        .workbench-shell .topbar {
          padding-right: 200px;
        }
        .workbench-floating {
          position: fixed;
          top: 16px;
          right: 24px;
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        .dashboard-canvas {
          min-height: calc(100vh - 7rem);
          height: auto;
        }
        .dashboard-canvas .inner {
          height: auto !important;
          min-height: calc(100vh - 7rem);
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  );
}

function UnknownConceptState({ conceptId }: { conceptId: string }) {
  return (
    <div className="workbench-shell">
      <div className="workbench-floating">
        <ConceptSwitcher />
        <ThemeSwitcher />
      </div>
      <div className="dashboard-canvas">
        <div className="inner" style={{ minHeight: 'calc(100vh - 3rem)', display: 'grid', placeItems: 'center' }}>
          <div
            className="surface"
            data-testid="unknown-concept-state"
            style={{
              width: 'min(560px, 100%)',
              padding: '1.5rem',
              borderColor: 'rgba(255,159,10,0.35)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div style={{ color: 'var(--neon-orange)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              unknown concept
            </div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', lineHeight: 1.3, color: 'var(--text-primary)' }}>
              /c/{conceptId} is not a valid workbench page
            </h1>
            <p style={{ margin: '0.8rem 0 1.2rem', color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.82rem' }}>
              Choose a concept from the switcher or return to the default workbench.
            </p>
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                color: 'var(--bg-void)',
                background: 'var(--neon-cyan)',
                border: '1px solid var(--neon-cyan)',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.76rem',
              }}
            >
              open default
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
