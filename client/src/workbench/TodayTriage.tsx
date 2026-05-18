import { useEffect, useRef, useState } from 'react';
import type { Priority, WorkItem } from '@stash/shared';
import {
  listToday,
  setPriority,
  togglePin,
  updateWorkItem,
} from '../api/work-items';

/**
 * v0.9 — multi-select + bulk ops for the Today list, mirroring InboxTriage.
 *
 * Today rows are scoped to listToday() (the canonical "show me what's on the
 * board for today" query). Keys:
 *   shift+j / shift+k       prev/next today row (avoids inbox collision)
 *   shift+v                 toggle current row in selection
 *   shift+V                 select all today rows
 *   shift+x                 mark done (single or whole selection)
 *   shift+t                 unpin from today (single or whole selection)
 *   shift+d                 drop (single or whole selection)
 *   shift+0/1/2/3           set priority
 *
 * Esc clears selection (or closes help). Toast w/ Undo on every action.
 */

interface UndoAction { label: string; apply: () => Promise<void> }

export function TodayTriage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; undo?: UndoAction } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function reload() {
      try {
        const next = await listToday();
        if (cancelled) return;
        setItems(next);
        setCursorId((cur) => {
          if (cur && next.some((it) => it.id === cur)) return cur;
          return next[0]?.id ?? null;
        });
      } catch { /* silent */ }
    }
    reload();
    function onChange() { reload(); }
    window.addEventListener('stash:captured', onChange);
    return () => { cancelled = true; window.removeEventListener('stash:captured', onChange); };
  }, []);

  useEffect(() => {
    async function act(handler: (id: string, cur: WorkItem) => Promise<UndoAction | void>, label: string) {
      const targets = selected.size > 0
        ? items.filter((it) => selected.has(it.id))
        : items.filter((it) => it.id === cursorId);
      if (targets.length === 0) return;
      try {
        const undos: UndoAction[] = [];
        for (const cur of targets) {
          const u = await handler(cur.id, cur);
          if (u) undos.push(u);
        }
        const composed: UndoAction | undefined = undos.length > 0
          ? { label: undos[0]!.label, apply: async () => { for (const u of undos) await u.apply(); } }
          : undefined;
        const msg = targets.length === 1 ? `✓ ${label}` : `✓ ${label} · ${targets.length} today rows`;
        flash(msg, composed);
        setSelected(new Set());
        window.dispatchEvent(new CustomEvent('stash:captured'));
      } catch (e) { flash(`✕ ${e instanceof Error ? e.message : String(e)}`); }
    }

    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;
      if (editing) return;
      // Shift-namespaced to avoid collision with InboxTriage (j/k/v/V/t/d/0..3).
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
        // Cmd/Ctrl+Z still triggers undo when one is pending.
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && toast?.undo) {
          e.preventDefault(); void invokeUndo();
        }
        return;
      }

      if (e.key === 'Escape') { e.preventDefault(); setSelected(new Set()); return; }

      // Navigation
      if (e.key === 'J') {
        e.preventDefault();
        if (items.length === 0) return;
        const idx = Math.max(0, items.findIndex((it) => it.id === cursorId));
        setCursorId(items[Math.min(idx + 1, items.length - 1)]?.id ?? null);
        return;
      }
      if (e.key === 'K') {
        e.preventDefault();
        if (items.length === 0) return;
        const idx = Math.max(0, items.findIndex((it) => it.id === cursorId));
        setCursorId(items[Math.max(0, idx - 1)]?.id ?? null);
        return;
      }

      // Selection
      if (e.key === 'V' && !e.shiftKey === false) {
        // 'V' alone here means: with shift held (we already required shift),
        // toggle/all behaviour: single 'V' toggles cursor row; double-shift +
        // V is select-all via the same key. We split via shift+V vs shift+A:
        //   shift+V → toggle current
        //   shift+A → select all
        e.preventDefault();
        if (!cursorId) return;
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(cursorId)) next.delete(cursorId); else next.add(cursorId);
          return next;
        });
        return;
      }
      if (e.key === 'A') { e.preventDefault(); setSelected(new Set(items.map((it) => it.id))); return; }

      // Actions
      if (e.key === 'X') {
        e.preventDefault();
        await act(async (id, cur) => {
          const prev = cur.status;
          await updateWorkItem(id, { status: 'done' });
          return { label: '→ done', apply: async () => { await updateWorkItem(id, { status: prev }); } };
        }, '→ done');
        return;
      }
      if (e.key === 'T') {
        e.preventDefault();
        await act(async (id, cur) => {
          const prev = cur.todayPinned;
          await togglePin(id, !prev);
          return { label: prev ? 'unpin' : 'pin', apply: async () => { await togglePin(id, prev); } };
        }, 'unpinned');
        return;
      }
      if (e.key === 'D') {
        e.preventDefault();
        await act(async (id, cur) => {
          const prev = cur.status;
          await updateWorkItem(id, { status: 'dropped' });
          return { label: '→ dropped', apply: async () => { await updateWorkItem(id, { status: prev }); } };
        }, '→ dropped');
        return;
      }
      const prio: Record<string, Priority> = { ')': 'p0', '!': 'p1', '@': 'p2', '#': 'p3' };
      const pa = prio[e.key];
      if (pa) {
        e.preventDefault();
        await act(async (id, cur) => {
          const prev = cur.priority;
          await setPriority(id, pa);
          return { label: pa, apply: async () => { await setPriority(id, prev); } };
        }, pa);
        return;
      }
    }

    async function invokeUndo() {
      if (!toast?.undo) return;
      const u = toast.undo;
      try {
        await u.apply();
        flash(`↶ undone (${u.label})`);
        window.dispatchEvent(new CustomEvent('stash:captured'));
      } catch (e) { flash(`✕ undo failed: ${e instanceof Error ? e.message : String(e)}`); }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, cursorId, selected, toast]);

  // Paint cursor + selection on today rows (set by DraggableList wrapper).
  useEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>('[data-today-item]');
    rows.forEach((el) => {
      const id = el.getAttribute('data-today-item');
      if (id && id === cursorId) el.setAttribute('data-today-cursor', 'true');
      else el.removeAttribute('data-today-cursor');
      if (id && selected.has(id)) el.setAttribute('data-today-selected', 'true');
      else el.removeAttribute('data-today-selected');
    });
  });

  function flash(msg: string, undo?: UndoAction) {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 8000 : 1800);
  }

  async function clickUndo() {
    if (!toast?.undo) return;
    const u = toast.undo;
    try {
      await u.apply();
      flash(`↶ undone (${u.label})`);
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) { flash(`✕ undo failed: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="tt-sel-pill" data-testid="tt-sel-count">
          today · {selected.size} selected · shift+X/T/D · shift+!/@/# · esc
        </div>
      )}
      {toast && (
        <div className="tt-toast" data-testid="tt-toast">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button className="tt-undo" type="button" onClick={clickUndo}>undo</button>
          )}
        </div>
      )}
      <style>{ttStyles}</style>
    </>
  );
}

const ttStyles = `
[data-today-item][data-today-cursor] {
  outline: 2px solid var(--neon-green, #30d158);
  outline-offset: 2px;
  border-radius: 6px;
}
[data-today-item][data-today-selected] {
  box-shadow: inset 3px 0 0 var(--neon-orange, #ff9f0a);
  background: rgba(255,159,10,0.06);
}
.tt-sel-pill {
  position: fixed; bottom: 11rem; right: 1.5rem;
  background: rgba(255,159,10,0.12);
  border: 1px solid var(--neon-orange, #ff9f0a);
  color: var(--neon-orange, #ff9f0a);
  font-family: var(--font-mono); font-size: 0.72rem;
  padding: 4px 10px; border-radius: 4px;
  z-index: 1001;
}
.tt-toast {
  position: fixed; bottom: 14rem; right: 1.5rem;
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-left: 3px solid var(--neon-green);
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
  font-family: var(--font-mono); font-size: 0.74rem;
  color: var(--text-primary, #fff);
  z-index: 1001;
  display: flex; align-items: center; gap: 0.6rem;
}
.tt-undo {
  background: rgba(48,209,88,0.08);
  border: 1px solid rgba(48,209,88,0.4);
  color: var(--neon-green);
  font-family: inherit; font-size: 0.7rem;
  padding: 2px 8px; border-radius: 4px; cursor: pointer;
}
.tt-undo:hover { background: rgba(48,209,88,0.15); }
`;
