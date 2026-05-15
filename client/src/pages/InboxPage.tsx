import { useState } from 'react';
import { useInbox } from '../hooks/useInbox';
import { CaptureBox } from '../components/CaptureBox';
import { StatusPill } from '../components/StatusPill';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InboxPage() {
  const inbox = useInbox();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = inbox.data ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <div className="grid grid-rows-[78px_1fr] h-full">
      <header className="border-b border-line bg-surface px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl leading-none m-0">Inbox</h1>
          <p className="text-muted text-xs mt-1">
            Untriaged thoughts and tasks. No project required.
          </p>
        </div>
      </header>

      <section className="p-4 grid grid-cols-[260px_1fr_360px] gap-3 overflow-hidden">
        <aside className="panel p-3 flex flex-col gap-2">
          <div className="section-title">Capture</div>
          <CaptureBox
            onCapture={async (text) => {
              await inbox.capture(text);
            }}
          />
        </aside>

        <div className="panel overflow-auto flex flex-col">
          <div className="grid grid-cols-[1fr_94px_88px_104px] gap-2 px-3 py-2 border-b border-line bg-surface-soft text-[11px] font-extrabold tracking-wider uppercase text-muted">
            <div>Captured item</div>
            <div>Status</div>
            <div>Priority</div>
            <div>Review</div>
          </div>
          {inbox.loading && !inbox.data ? (
            <div className="p-4 text-muted text-xs">Loading…</div>
          ) : null}
          {items.length === 0 && !inbox.loading ? (
            <div className="p-4 text-muted text-xs">No items in Inbox. Capture one on the left.</div>
          ) : null}
          <ul data-testid="inbox-list">
            {items.map((item) => (
              <li
                key={item.id}
                className={
                  'grid grid-cols-[1fr_94px_88px_104px] gap-2 items-center min-h-[56px] px-3 py-2 border-b border-line cursor-pointer ' +
                  (selected?.id === item.id ? 'bg-accent/10' : 'bg-surface hover:bg-surface-soft')
                }
                onClick={() => setSelectedId(item.id)}
                data-testid="inbox-item"
                data-task-id={item.id}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-extrabold truncate">{item.title}</div>
                  <div className="text-muted font-mono text-[10px]">
                    {item.kind} · {item.areaId ?? 'no area'}
                  </div>
                </div>
                <StatusPill status={item.status} />
                <div className="text-muted font-mono text-[10px] uppercase">{item.priority}</div>
                <div className="text-muted font-mono text-[10px]">
                  {item.reviewAt ?? '—'}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="panel p-3 overflow-auto">
          <div className="section-title mb-2">Review actions</div>
          {selected ? (
            <>
              <div className="text-[13px] font-bold mb-2">{selected.title}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn"
                  data-testid="plan-today"
                  onClick={() => inbox.planToday(selected.id, today())}
                >
                  Do today
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="plan-someday"
                  onClick={() => inbox.someday(selected.id)}
                >
                  Someday
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="plan-drop"
                  onClick={() => inbox.drop(selected.id)}
                >
                  Drop
                </button>
              </div>
              <div className="mt-3 text-muted text-[11px]">
                Triaged items move to Todo. Dropped items keep their record for audit.
              </div>
            </>
          ) : (
            <div className="text-muted text-xs">
              Select an inbox item to triage it.
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
