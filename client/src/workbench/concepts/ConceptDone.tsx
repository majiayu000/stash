import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkItem } from '@stash/shared';
import { listWorkItems } from '../../api/work-items';
import type { WBData } from '../data';
import { Topbar } from '../shared';

export function ConceptDone({ data }: { data: WBData; reload: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectById = useMemo(() => new Map(data.projects.map((p) => [p.id, p.name])), [data.projects]);

  async function loadDone() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listWorkItems({ status: 'done' });
      setItems([...rows].sort(doneSort));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDone();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const projectName = item.projectId ? projectById.get(item.projectId) ?? item.projectId : '';
      return [item.title, item.description ?? '', item.outcome ?? '', projectName, item.labels.join(' ')]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [items, projectById, query]);

  const groups = useMemo(() => groupDoneItems(filtered), [filtered]);
  const recentCount = filtered.filter((item) => daysAgo(itemDate(item)) <= 7).length;
  const linkedCount = filtered.filter((item) => item.projectId).length;

  return (
    <div className="dashboard-canvas done-page" data-testid="done-page">
      <div className="inner done-inner">
        <Topbar
          data={data}
          right={
            <div className="done-top-actions">
              <button type="button" onClick={() => navigate('/')}>Workbench</button>
              <button type="button" onClick={() => { void loadDone(); }}>Refresh</button>
            </div>
          }
        />

        <header className="done-head">
          <div>
            <div className="done-kicker">Completed archive</div>
            <h1>Done</h1>
          </div>
          <label className="done-search">
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="title, label, project"
              data-testid="done-search"
            />
          </label>
        </header>

        <div className="done-content">
          <aside className="done-summary" aria-label="Done summary">
            <SummaryStat label="shown" value={filtered.length} />
            <SummaryStat label="last 7 days" value={recentCount} />
            <SummaryStat label="linked" value={linkedCount} />
          </aside>

          <main className="done-list" data-testid="done-list">
            {loading ? (
              <div className="done-empty">loading done items...</div>
            ) : error ? (
              <div className="done-empty error">failed to load done items: {error}</div>
            ) : filtered.length === 0 ? (
              <div className="done-empty">{query.trim() ? 'no done items match this search' : 'nothing completed yet'}</div>
            ) : (
              groups.map((group) => (
                <section className="done-group" key={group.date}>
                  <div className="done-group-head">
                    <span>{group.date}</span>
                    <span>{group.items.length}</span>
                  </div>
                  <div className="done-group-rows">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="done-item"
                        onClick={() => navigate(`/tasks/${item.id}`)}
                      >
                        <span className="done-item-main">
                          <span className="done-item-title">{item.title}</span>
                          <span className="done-item-meta">
                            {projectName(item, projectById)} - {item.priority} - {item.kind}
                          </span>
                        </span>
                        {item.labels.length > 0 && (
                          <span className="done-item-labels">
                            {item.labels.slice(0, 4).map((label) => (
                              <span key={label}>#{label}</span>
                            ))}
                          </span>
                        )}
                        <span className="done-item-date">{itemDate(item).slice(0, 10)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>
        </div>
      </div>
      <style>{conceptDoneStyles}</style>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="done-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function doneSort(a: WorkItem, b: WorkItem): number {
  return itemDate(b).localeCompare(itemDate(a));
}

function itemDate(item: WorkItem): string {
  return item.completedAt ?? item.updatedAt ?? item.createdAt;
}

function daysAgo(iso: string): number {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function projectName(item: WorkItem, projectById: Map<string, string>): string {
  if (!item.projectId) return 'no project';
  return projectById.get(item.projectId) ?? item.projectId;
}

function groupDoneItems(items: WorkItem[]): Array<{ date: string; items: WorkItem[] }> {
  const groups = new Map<string, WorkItem[]>();
  for (const item of items) {
    const date = itemDate(item).slice(0, 10);
    const bucket = groups.get(date) ?? [];
    bucket.push(item);
    groups.set(date, bucket);
  }
  return Array.from(groups.entries()).map(([date, groupItems]) => ({ date, items: groupItems }));
}

const conceptDoneStyles = `
.done-page .done-inner {
  min-height: calc(100vh - 3rem);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
}
.done-top-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.done-top-actions button {
  border: 1px solid rgba(0,255,242,0.32);
  background: rgba(0,255,242,0.06);
  color: var(--neon-cyan);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
}
.done-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 380px);
  gap: 1rem;
  align-items: end;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border-hair);
}
.done-kicker {
  color: var(--neon-green);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.done-head h1 {
  margin: 0.15rem 0 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 3.2rem;
  line-height: 0.95;
  letter-spacing: 0;
}
.done-search {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.done-search input {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-hair);
  background: var(--bg-glass);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  padding: 0.72rem 0.8rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  outline: none;
  text-transform: none;
  letter-spacing: 0;
}
.done-search input:focus {
  border-color: rgba(0,255,242,0.45);
  box-shadow: 0 0 0 2px rgba(0,255,242,0.08);
}
.done-content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1rem;
}
.done-summary {
  align-self: start;
  display: grid;
  gap: 0.65rem;
}
.done-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: var(--bg-glass);
  padding: 0.8rem 0.9rem;
  font-family: var(--font-mono);
}
.done-stat span {
  color: var(--text-muted);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.done-stat strong {
  color: var(--neon-green);
  font-size: 1.2rem;
}
.done-list {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.025);
}
.done-empty {
  padding: 2rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  text-align: center;
}
.done-empty.error {
  color: var(--neon-pink);
}
.done-group-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  padding: 0.65rem 0.8rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-hair);
  color: var(--neon-green);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.done-group-rows {
  display: grid;
}
.done-item {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, auto) 94px;
  gap: 0.85rem;
  align-items: center;
  padding: 0.78rem 0.85rem;
  border: 0;
  border-bottom: 1px solid var(--border-hair);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.done-item:hover {
  background: rgba(48, 209, 88, 0.055);
}
.done-item-main {
  min-width: 0;
  display: grid;
  gap: 0.25rem;
}
.done-item-title {
  min-width: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.86rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.done-item-meta,
.done-item-date {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1.3;
}
.done-item-labels {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.3rem;
}
.done-item-labels span {
  color: var(--neon-cyan);
  border: 1px solid rgba(0,255,242,0.22);
  border-radius: var(--radius-sm);
  padding: 0.15rem 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.done-item-date {
  justify-self: end;
  white-space: nowrap;
}
@media (max-width: 860px) {
  .done-head h1 { font-size: 2.4rem; }
  .done-head, .done-content { grid-template-columns: 1fr; }
  .done-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .done-item {
    grid-template-columns: minmax(0, 1fr);
  }
  .done-item-labels {
    justify-content: flex-start;
  }
  .done-item-date {
    justify-self: start;
  }
}
`;
