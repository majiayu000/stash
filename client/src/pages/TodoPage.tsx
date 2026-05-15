import { useMemo, useState } from 'react';
import type { WorkItemStatus } from '@stash/shared';
import { useWorkItems } from '../hooks/useWorkItems';
import { TaskRow } from '../components/TaskRow';
import { TaskEditor } from '../components/TaskEditor';

type View = 'all' | 'inbox' | 'today' | 'week' | 'none' | 'waiting' | 'someday';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekEndIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

const VIEWS: { id: View; label: string; statuses?: WorkItemStatus[] }[] = [
  { id: 'all', label: 'All active' },
  { id: 'inbox', label: 'Inbox', statuses: ['inbox'] },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'none', label: 'No date' },
  { id: 'waiting', label: 'Waiting', statuses: ['waiting', 'blocked'] },
  { id: 'someday', label: 'Someday', statuses: ['someday'] },
];

export function TodoPage() {
  const [view, setView] = useState<View>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filter = useMemo(() => {
    const t = todayIso();
    const wEnd = weekEndIso();
    switch (view) {
      case 'inbox': return { status: 'inbox' as WorkItemStatus };
      case 'today': return { scheduledFrom: t, scheduledTo: t };
      case 'week': return { scheduledFrom: t, scheduledTo: wEnd };
      case 'none': return { scheduledIsNull: true };
      case 'waiting': return { status: ['waiting', 'blocked'] as WorkItemStatus[] };
      case 'someday': return { status: 'someday' as WorkItemStatus };
      case 'all':
      default: return {};
    }
  }, [view]);

  const wi = useWorkItems(filter);
  const items = wi.data ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  async function createNew() {
    const item = await wi.create({ title: 'New task', kind: 'task', status: 'planned' });
    setSelectedId(item.id);
  }

  async function toggleDone(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    await wi.update(id, { status: target.status === 'done' ? 'planned' : 'done' });
  }

  return (
    <div className="grid grid-rows-[78px_1fr] h-full">
      <header className="border-b border-line bg-surface px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl leading-none m-0">Todo</h1>
          <p className="text-muted text-xs mt-1">
            Dedicated task entry, dated planning, and editor.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={createNew} data-testid="new-task">
          New task
        </button>
      </header>

      <section className="p-4 grid grid-cols-[200px_1fr_360px] gap-3 overflow-hidden">
        <aside className="panel p-3 flex flex-col gap-1">
          <div className="section-title mb-2">Date views</div>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              data-testid={`view-${v.id}`}
              className={
                'h-9 px-3 rounded-md text-left text-xs font-extrabold flex items-center ' +
                (view === v.id
                  ? 'bg-ink text-white'
                  : 'bg-surface text-ink hover:bg-surface-soft')
              }
            >
              {v.label}
            </button>
          ))}
        </aside>

        <div className="panel overflow-auto">
          <div className="grid grid-cols-[32px_minmax(260px,1fr)_94px_120px_88px_104px] gap-2 items-center px-3 py-2 bg-surface-soft border-b border-line text-[11px] font-extrabold tracking-wider uppercase text-muted">
            <div />
            <div>Task</div>
            <div>Status</div>
            <div>Area</div>
            <div>Priority</div>
            <div>Scheduled</div>
          </div>
          {wi.loading && !wi.data ? (
            <div className="p-4 text-muted text-xs">Loading…</div>
          ) : null}
          {items.length === 0 && !wi.loading ? (
            <div className="p-4 text-muted text-xs">No tasks in this view.</div>
          ) : null}
          <div data-testid="task-list">
            {items.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                selected={selected?.id === item.id}
                onSelect={(id) => setSelectedId(id)}
                onToggleDone={toggleDone}
              />
            ))}
          </div>
        </div>

        <aside className="panel overflow-auto">
          <div className="section-title px-3 pt-3">Task detail</div>
          <TaskEditor
            item={selected}
            onSave={(patch) => selected && wi.update(selected.id, patch).then(() => undefined)}
            onDelete={(id) => wi.remove(id)}
          />
        </aside>
      </section>
    </div>
  );
}
