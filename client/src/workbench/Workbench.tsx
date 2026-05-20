import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './styles/brand.css';
import './styles/dashboard.css';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { ApiError } from '../api/client';
import { useWorkbenchData } from './useWorkbenchData';
import { findConcept, type ConceptId } from './concepts/registry';
import { renderConcept } from './concepts/render';
import { ConceptSwitcher } from './ConceptSwitcher';
import { InboxTriage } from './InboxTriage';
import { ReminderTicker } from './ReminderTicker';
import { QuickCapture } from './QuickCapture';
import { SearchPalette } from './SearchPalette';
import { SmartLists } from './SmartLists';
import { SourceHealthBanner } from './SourceHealthBanner';
import { TodayTriage } from './TodayTriage';
import type { WorkbenchAsyncErrorDetail } from './reportAsyncError';

export function Workbench() {
  const { data, loading, error, reload } = useWorkbenchData();
  const [asyncError, setAsyncError] = useState<WorkbenchAsyncErrorDetail | null>(null);
  const params = useParams<{ id?: ConceptId }>();
  const conceptId: ConceptId = (params.id as ConceptId) ?? 'e';
  const entry = findConcept(conceptId);

  // SPEC v0.3 — refresh data after Quick Capture submits.
  useEffect(() => {
    function onCaptured() { reload(); }
    window.addEventListener('stash:captured', onCaptured);
    return () => window.removeEventListener('stash:captured', onCaptured);
  }, [reload]);

  useEffect(() => {
    function onAsyncError(event: Event) {
      setAsyncError((event as CustomEvent<WorkbenchAsyncErrorDetail>).detail);
    }
    window.addEventListener('stash:async-error', onAsyncError);
    return () => window.removeEventListener('stash:async-error', onAsyncError);
  }, []);

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
        <button type="button" onClick={reload} style={{ border: '1px solid var(--neon-pink)', background: 'transparent', color: 'var(--neon-pink)', borderRadius: 6, padding: '6px 10px', font: 'inherit', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }
  if (!data || !entry) return null;

  const content = renderConcept(entry.id, data, reload);

  return (
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
      {asyncError && (
        <section className="workbench-async-error" role="alert" data-testid="async-error">
          <div>
            <strong>{asyncError.scope}</strong>
            <span>{asyncError.message}</span>
          </div>
          <button type="button" onClick={() => { setAsyncError(null); reload(); }}>Retry</button>
          <button type="button" onClick={() => setAsyncError(null)}>Dismiss</button>
        </section>
      )}
      <SourceHealthBanner errors={data.sourceErrors} onRetry={reload} />
      {content}

      <style>{`
        .workbench-shell {
          min-height: 100vh;
          padding: 1.5rem;
          position: relative;
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
          min-height: calc(100vh - 3rem);
          height: auto;
        }
        .dashboard-canvas .inner {
          height: auto !important;
          min-height: calc(100vh - 3rem);
          display: flex;
          flex-direction: column;
        }
        .workbench-async-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0 0 12px;
          padding: 10px 12px;
          border: 1px solid color-mix(in srgb, var(--neon-pink), transparent 50%);
          border-radius: 8px;
          background: color-mix(in srgb, var(--neon-pink), transparent 92%);
          color: var(--text-main);
          font-family: var(--font-mono);
        }
        .workbench-async-error div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .workbench-async-error strong {
          color: var(--neon-pink);
          font-size: 0.74rem;
          text-transform: uppercase;
        }
        .workbench-async-error span {
          color: var(--text-muted);
          font-size: 0.72rem;
          overflow-wrap: anywhere;
        }
        .workbench-async-error button {
          border: 1px solid color-mix(in srgb, var(--neon-pink), transparent 42%);
          background: transparent;
          color: var(--neon-pink);
          border-radius: 6px;
          padding: 6px 10px;
          font: inherit;
          cursor: pointer;
        }
        @media (max-width: 640px) {
          .workbench-async-error {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
