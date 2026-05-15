import { useEffect, useState } from 'react';
import type { ProgressEvidence, WorkItem } from '@stash/shared';
import { listEvidence } from '../api/evidence';
import { listWorkItems } from '../api/work-items';
import { ProviderBadge } from '../components/ProviderBadge';

export function EvidencePage() {
  const [rows, setRows] = useState<ProgressEvidence[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listEvidence({}), listWorkItems({ includeDropped: true })])
      .then(([e, i]) => {
        if (cancelled) return;
        setRows(e);
        setItems(i);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const itemTitle = (id: string) => items.find((i) => i.id === id)?.title ?? id;

  return (
    <div className="grid grid-rows-[78px_1fr] h-full">
      <header className="border-b border-line bg-surface px-4 py-3">
        <h1 className="text-xl leading-none m-0">Evidence</h1>
        <p className="text-muted text-xs mt-1">
          Every progress claim traces back to a source: session message, tool call, plan task, or manual note.
        </p>
      </header>

      <section className="p-4 grid grid-cols-[1fr_320px] gap-3 overflow-hidden">
        <div className="panel overflow-auto">
          <div className="grid grid-cols-[140px_120px_1fr_140px] gap-2 px-3 py-2 bg-surface-soft border-b border-line text-[11px] font-extrabold tracking-wider uppercase text-muted">
            <div>Time</div>
            <div>Kind</div>
            <div>Evidence</div>
            <div>Source</div>
          </div>
          {loading ? <div className="p-4 text-muted text-xs">Loading…</div> : null}
          {error ? <div className="p-4 text-status-blocked text-xs">{error.message}</div> : null}
          {!loading && rows.length === 0 ? (
            <div className="p-4 text-muted text-xs">
              No evidence recorded yet. Trigger inference from a task editor or add a manual note.
            </div>
          ) : null}
          <ul data-testid="evidence-list">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[140px_120px_1fr_140px] gap-2 items-center px-3 py-2 border-b border-line text-[12px]"
                data-testid="evidence-row"
              >
                <div className="text-muted font-mono text-[10px]">
                  {row.timestamp.slice(0, 16).replace('T', ' ')}
                </div>
                <div className="flex items-center gap-1">
                  <span className="pill">{row.kind}</span>
                  {row.pendingAcceptance ? (
                    <span className="pill pill-status-waiting">pending</span>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold truncate">{itemTitle(row.workItemId)}</div>
                  <div className="text-muted text-[11px] truncate">{row.text}</div>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  {row.provider ? <ProviderBadge provider={row.provider} /> : null}
                  <span className="text-muted text-[10px] font-mono truncate">
                    {row.sessionId ?? row.sourcePath ?? '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="panel p-3 overflow-auto">
          <div className="section-title mb-2">Evidence rule</div>
          <div className="border border-dashed border-line-strong rounded-md p-3 text-muted text-[12px] leading-snug">
            Progress shown on Overview and Workboard must point back to a row in this table.
            Manual status is never overwritten — inferred completion proposals stay pending
            until the user accepts them.
          </div>
        </aside>
      </section>
    </div>
  );
}
