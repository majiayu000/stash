import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkItem } from '@stash/shared';
import { listWorkItems, type WorkItemFilter } from '../api/work-items';
import { useWorkbenchDialog } from '../components/ui/workbench-dialogs';
import { reportAsyncError } from './reportAsyncError';

/**
 * v0.6 — Smart Lists. Quick filter chips for the hot queries every todo user
 * reaches for daily: overdue, today's pinned, priority p0, and any savable
 * custom filter. Custom lists persist in localStorage as JSON.
 *
 * Trigger: `\`` (backtick) toggles the strip. Stays open so you can click chips.
 * Chips render counts. Click → opens a result drawer using the same row design
 * as SearchPalette. Clicking a row opens task detail.
 */

const STORAGE_KEY = 'stash.smartLists.v1';

interface SavedList {
  id: string;
  label: string;
  filter: WorkItemFilter;
}

const BUILTIN: SavedList[] = [
  { id: 'overdue', label: '⏰ overdue', filter: { dueBefore: '__now__' as string } },
  { id: 'today-pinned', label: '📌 today-pinned', filter: { todayPinned: true } },
  { id: 'p0', label: '🔴 p0', filter: { priority: 'p0' } },
  { id: 'p1', label: '🟠 p1', filter: { priority: 'p1' } },
  { id: 'inbox', label: '📥 inbox', filter: { status: 'inbox' } },
  { id: 'someday', label: '🌌 someday', filter: { status: 'someday' } },
  { id: 'systems', label: '🔁 systems', filter: { kind: 'system' } },
];

function loadSaved(): SavedList[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistSaved(lists: SavedList[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists)); } catch { /* quota */ }
}

function resolveFilter(f: WorkItemFilter): WorkItemFilter {
  // __now__ marker → real ISO timestamp at query time (so "overdue" is always live)
  const copy: WorkItemFilter = { ...f };
  if (copy.dueBefore === '__now__') copy.dueBefore = new Date().toISOString();
  return copy;
}

export function SmartLists() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SavedList | null>(null);
  const [results, setResults] = useState<WorkItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<SavedList[]>([]);
  const navigate = useNavigate();
  const dialog = useWorkbenchDialog();

  useEffect(() => { setSaved(loadSaved()); }, []);

  // Backtick toggles the strip; Esc closes the drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;
      if (editing) return;
      if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); setOpen((v) => !v); return;
      }
      if (open && e.key === 'Escape' && active) { e.preventDefault(); setActive(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, active]);

  // Refresh counts whenever the strip is opened or data changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function refresh() {
      const all = [...BUILTIN, ...saved];
      const next: Record<string, number> = {};
      await Promise.all(all.map(async (l) => {
        try {
          const rows = await listWorkItems(resolveFilter(l.filter));
          if (!cancelled) next[l.id] = rows.length;
        } catch (error) {
          next[l.id] = 0;
          reportAsyncError(`load smart list count ${l.label}`, error);
        }
      }));
      if (!cancelled) setCounts(next);
    }
    refresh();
    function onChange() { refresh(); }
    window.addEventListener('stash:captured', onChange);
    return () => { cancelled = true; window.removeEventListener('stash:captured', onChange); };
  }, [open, saved]);

  // Pull rows when a chip is active.
  useEffect(() => {
    if (!active) { setResults([]); return; }
    let cancelled = false;
    listWorkItems(resolveFilter(active.filter))
      .then((rows) => { if (!cancelled) setResults(rows); })
      .catch((error) => {
        if (!cancelled) {
          setResults([]);
          reportAsyncError(`load smart list ${active.label}`, error);
        }
      });
    return () => { cancelled = true; };
  }, [active]);

  function pick(it: WorkItem) {
    setOpen(false); setActive(null);
    navigate(`/todos/${it.id}`);
  }

  async function addCustom() {
    const label = await dialog.prompt({
      title: 'new smart-list chip',
      label: 'chip label',
      placeholder: 'auth bugs',
      confirmLabel: 'next',
    });
    if (!label?.trim()) return;
    const tag = await dialog.prompt({
      title: 'match label or tag',
      label: 'tag',
      placeholder: 'auth',
      confirmLabel: 'save chip',
    });
    if (!tag?.trim()) return;
    const next: SavedList = {
      id: `custom-${Date.now()}`,
      label: label.trim(),
      filter: { label: tag.trim() },
    };
    const nextSaved = [...saved, next];
    setSaved(nextSaved);
    persistSaved(nextSaved);
  }

  function removeCustom(id: string) {
    const nextSaved = saved.filter((l) => l.id !== id);
    setSaved(nextSaved);
    persistSaved(nextSaved);
  }

  return !open ? null : (
    <>
      <div className="sl-strip" data-testid="sl-strip">
        {[...BUILTIN, ...saved].map((l) => {
          const isCustom = !BUILTIN.find((b) => b.id === l.id);
          const isActive = active?.id === l.id;
          return (
            <button
              key={l.id}
              type="button"
              className={`sl-chip ${isActive ? 'active' : ''}`}
              onClick={() => setActive(isActive ? null : l)}
              data-testid={`sl-chip-${l.id}`}
            >
              {l.label}
              <span className="sl-chip-count">{counts[l.id] ?? '·'}</span>
              {isCustom && (
                <span
                  role="button"
                  className="sl-chip-x"
                  onClick={(e) => { e.stopPropagation(); removeCustom(l.id); }}
                  title="remove this chip"
                >×</span>
              )}
            </button>
          );
        })}
        <button type="button" className="sl-chip sl-add" onClick={addCustom}>+ chip</button>
        <button type="button" className="sl-close" onClick={() => { setOpen(false); setActive(null); }}>esc</button>
      </div>
      {active && (
        <div className="sl-drawer" onClick={() => setActive(null)} role="presentation">
          <div className="sl-drawer-box" onClick={(e) => e.stopPropagation()}>
            <div className="sl-drawer-head">
              <span>{active.label}</span>
              <span className="sl-drawer-count">{results.length}</span>
            </div>
            <div className="sl-drawer-rows">
              {results.length === 0
                ? <div className="sl-drawer-empty">— nothing matches —</div>
                : results.map((it) => (
                  <button key={it.id} type="button" className={`sl-row ${it.status === 'done' ? 'done' : ''}`} onClick={() => pick(it)}>
                    <span className="sl-row-title">{it.title}</span>
                    <span className="sl-row-meta">{it.status} · {it.priority}{it.dueAt ? ' · due ' + it.dueAt.slice(0, 10) : ''}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      <style>{slStyles}</style>
    </>
  );
}

const slStyles = `
.sl-strip {
  position: fixed; top: 1rem; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  z-index: 999;
  max-width: 90vw;
}
.sl-chip {
  font-family: var(--font-mono); font-size: 0.72rem;
  padding: 3px 9px; border-radius: 6px;
  background: transparent;
  border: 1px solid var(--border-hair, rgba(255,255,255,0.1));
  color: var(--text-primary, #fff);
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.sl-chip:hover { border-color: var(--neon-cyan, #00fff2); }
.sl-chip.active {
  background: rgba(0,255,242,0.12);
  border-color: var(--neon-cyan, #00fff2);
  color: var(--neon-cyan, #00fff2);
}
.sl-chip-count {
  font-size: 0.62rem; color: var(--text-muted, #888);
  background: rgba(255,255,255,0.05);
  border-radius: 3px;
  padding: 0 5px;
  min-width: 14px; text-align: center;
}
.sl-chip-x {
  margin-left: 2px;
  color: var(--text-muted, #888);
  cursor: pointer; user-select: none;
  padding: 0 2px;
}
.sl-chip-x:hover { color: var(--neon-pink, #ff5e93); }
.sl-add { border-style: dashed; color: var(--text-muted, #888); }
.sl-close {
  font-family: var(--font-mono); font-size: 0.66rem;
  margin-left: 4px;
  background: transparent; border: 1px solid var(--border-hair, rgba(255,255,255,0.1));
  border-radius: 4px; padding: 2px 7px;
  color: var(--text-muted, #888); cursor: pointer;
}
.sl-drawer {
  position: fixed; inset: 0; z-index: 1004;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(8px);
  display: grid; place-items: start center; padding-top: 16vh;
}
.sl-drawer-box {
  width: min(640px, 92vw);
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6);
}
.sl-drawer-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-hair, rgba(255,255,255,0.08));
  font-family: var(--font-mono); font-size: 0.86rem; color: var(--text-primary, #fff);
}
.sl-drawer-count { color: var(--text-muted, #888); margin-left: auto; font-size: 0.74rem; }
.sl-drawer-rows { max-height: 56vh; overflow-y: auto; display: flex; flex-direction: column; }
.sl-drawer-empty { padding: 1rem; font-family: var(--font-mono); font-size: 0.74rem; color: var(--text-muted, #888); }
.sl-row {
  display: flex; flex-direction: column; align-items: stretch; text-align: left;
  background: transparent; border: 0;
  padding: 8px 16px; cursor: pointer;
  border-left: 2px solid transparent;
  font-family: var(--font-mono);
  color: var(--text-primary, #fff);
}
.sl-row.done { opacity: 0.5; }
.sl-row:hover { background: rgba(0,255,242,0.05); border-left-color: var(--neon-cyan, #00fff2); }
.sl-row-title { font-size: 0.82rem; }
.sl-row-meta { font-size: 0.62rem; color: var(--text-muted, #888); margin-top: 2px; }
`;
