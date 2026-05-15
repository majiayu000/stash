import { useOverview } from '../hooks/useOverview';
import { usePendingEvidence } from '../hooks/usePendingEvidence';
import { StatusPill } from '../components/StatusPill';
import { Pill } from '../components/Pill';

export function OverviewPage() {
  const { data, loading, error } = useOverview();
  const pending = usePendingEvidence();

  return (
    <div className="grid grid-rows-[78px_1fr] h-full">
      <header className="border-b border-line bg-surface px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl leading-none m-0">Overview</h1>
          <p className="text-muted text-xs mt-1">
            Capture ideas quickly, then decide whether they become tasks, projects, or someday items.
          </p>
        </div>
        <div className="text-muted text-[10px] uppercase tracking-wider font-extrabold">
          {data?.date ?? '—'}
        </div>
      </header>

      <section className="p-4 grid grid-cols-[1fr_360px] gap-3 overflow-hidden">
        <div className="flex flex-col gap-3 min-h-0">
          {loading ? <div className="text-muted text-xs">Loading…</div> : null}
          {error ? <div className="text-status-blocked text-xs">{error.message}</div> : null}

          {data ? (
            <>
              <div className="grid grid-cols-4 gap-3" data-testid="metric-grid">
                <Metric label="Inbox ideas" value={data.counts.inbox} testId="metric-inbox" />
                <Metric label="Today tasks" value={data.counts.today} testId="metric-today" />
                <Metric label="Waiting on me" value={data.counts.waiting + data.counts.blocked} testId="metric-waiting" />
                <Metric label="Someday parked" value={data.counts.someday} testId="metric-someday" />
              </div>

              {pending.data && pending.data.length > 0 ? (
                <div
                  className="panel p-3 border border-status-waiting/40"
                  data-testid="completion-candidates"
                >
                  <div className="section-title mb-2">
                    <span>Completion candidates · estimated</span>
                    <span>{pending.data.length}</span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {pending.data.map((e) => (
                      <li
                        key={e.id}
                        className="border border-line rounded-md p-2 bg-surface flex items-center gap-2"
                        data-testid="candidate-row"
                        data-work-item-id={e.workItemId}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] truncate">{e.text}</div>
                          <div className="text-[10px] font-mono text-muted">
                            inferred from {e.provider ?? 'session'} · {e.kind}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn h-7 px-2 text-[11px]"
                          onClick={() => pending.accept(e.workItemId)}
                          data-testid={`accept-${e.workItemId}`}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn h-7 px-2 text-[11px]"
                          onClick={() => pending.reject(e.workItemId)}
                          data-testid={`reject-${e.workItemId}`}
                        >
                          Reject
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="panel p-3 overflow-auto">
                <div className="section-title mb-2">
                  <span>Today focus</span>
                  <span>{data.today.length}</span>
                </div>
                {data.today.length === 0 ? (
                  <Empty>No tasks scheduled for today.</Empty>
                ) : (
                  <ul className="flex flex-col gap-2" data-testid="today-list">
                    {data.today.map((item) => (
                      <li key={item.id} className="border border-line rounded-md p-2 bg-surface flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold truncate">{item.title}</div>
                          <div className="text-[10px] text-muted font-mono">
                            {item.areaId ?? 'no area'} · {item.priority}
                          </div>
                        </div>
                        <StatusPill status={item.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>

        <aside className="panel p-3 overflow-auto">
          <div className="section-title mb-2">
            <span>Needs attention</span>
            <span>{data?.needsAttention.length ?? 0}</span>
          </div>
          {data?.needsAttention.length ? (
            <ul className="flex flex-col gap-2" data-testid="needs-attention">
              {data.needsAttention.map((n, idx) => (
                <li key={idx} className="border border-line rounded-md p-2 bg-surface">
                  <div className="text-[12px] font-bold">{n.message}</div>
                  <div className="mt-1 flex gap-2">
                    <Pill tone={toneFor(n.kind)}>{labelFor(n.kind)}</Pill>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing flagged. Inbox triage is up to date.</Empty>
          )}
        </aside>
      </section>
    </div>
  );
}

function Metric({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="panel p-3" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider font-extrabold text-muted">
        {label}
      </div>
      <div className="text-2xl font-extrabold text-ink mt-1">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-line-strong rounded-md p-3 text-muted text-xs">
      {children}
    </div>
  );
}

function labelFor(kind: string): string {
  switch (kind) {
    case 'inbox_pressure': return 'Inbox';
    case 'blocked': return 'Blocked';
    case 'stale_waiting': return 'Waiting';
    case 'review_due': return 'Review';
    default: return kind;
  }
}

function toneFor(kind: string): string | undefined {
  switch (kind) {
    case 'inbox_pressure': return 'inbox';
    case 'blocked': return 'blocked';
    case 'stale_waiting': return 'waiting';
    default: return undefined;
  }
}
