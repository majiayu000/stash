import { useEffect, useRef, useState } from 'react';
import type { Priority, WorkItem, WorkItemStatus } from '@stash/shared';
import {
  listWorkItems,
  setPriority,
  togglePin,
  updateWorkItem,
} from '../api/work-items';

/**
 * SPEC v0.3 §3e — global inbox triage keyboard layer.
 *
 * Cursor tracks the *id* of the focused row (not its index), so actions that
 * shift the list don't mis-target the next keypress. Inbox list is cached
 * and invalidated on `stash:captured`.
 *
 * Keys (when no input has focus):
 *   j / k          next / prev row
 *   t              toggle today_pinned
 *   n              → status planned
 *   s              → status someday
 *   d              → status dropped (Undo via toast button)
 *   0..3           priority p0/p1/p2/p3
 *   e              rename row (browser prompt for v0.3)
 *   Enter          emit stash:open-detail with the focused id
 *   ?              toggle help overlay
 */

interface UndoAction {
  label: string;
  apply: () => Promise<void>;
}

export function InboxTriage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<{ msg: string; undo?: UndoAction } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load + reload inbox; preserves cursor when possible.
  useEffect(() => {
    let cancelled = false;
    async function reload() {
      try {
        const next = await listWorkItems({ status: 'inbox' });
        if (cancelled) return;
        setItems(next);
        setCursorId((cur) => {
          if (cur && next.some((it) => it.id === cur)) return cur;
          return next[0]?.id ?? null;
        });
      } catch { /* silent — surface elsewhere */ }
    }
    reload();
    function onChange() { reload(); }
    window.addEventListener('stash:captured', onChange);
    return () => { cancelled = true; window.removeEventListener('stash:captured', onChange); };
  }, []);

  useEffect(() => {
    async function act(handler: (id: string, current: WorkItem) => Promise<UndoAction | void>, label: string) {
      const cur = items.find((it) => it.id === cursorId);
      if (!cur) return;
      try {
        const undo = await handler(cur.id, cur);
        flash(`✓ ${label}`, undo ?? undefined);
        window.dispatchEvent(new CustomEvent('stash:captured'));
      } catch (e) {
        flash(`✕ ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;
      if (editing) return;
      if (e.metaKey || e.altKey) return;

      // Help overlay
      if (e.key === '?') { e.preventDefault(); setHelp((v) => !v); return; }
      if (e.key === 'Escape' && help) { e.preventDefault(); setHelp(false); return; }

      // Cmd+Z / Ctrl+Z → invoke pending undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (toast?.undo) { e.preventDefault(); void invokeUndo(); }
        return;
      }
      if (e.ctrlKey) return;

      // Navigation
      if (e.key === 'j') {
        e.preventDefault();
        if (items.length === 0) return;
        const idx = Math.max(0, items.findIndex((it) => it.id === cursorId));
        setCursorId(items[Math.min(idx + 1, items.length - 1)]?.id ?? null);
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        if (items.length === 0) return;
        const idx = Math.max(0, items.findIndex((it) => it.id === cursorId));
        setCursorId(items[Math.max(0, idx - 1)]?.id ?? null);
        return;
      }

      // Enter → emit detail event (consumer wires this up).
      if (e.key === 'Enter') {
        if (!cursorId) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('stash:open-detail', { detail: { id: cursorId } }));
        return;
      }

      // Rename
      if (e.key === 'e') {
        e.preventDefault();
        await act(async (id, cur) => {
          const next = window.prompt('rename', cur.title);
          if (next === null || !next.trim() || next.trim() === cur.title) return;
          const prevTitle = cur.title;
          await updateWorkItem(id, { title: next.trim() });
          return { label: 'rename', apply: async () => { await updateWorkItem(id, { title: prevTitle }); } };
        }, 'renamed');
        return;
      }

      // Actions
      const statusActions: Record<string, { status: WorkItemStatus; label: string }> = {
        n: { status: 'planned', label: '→ planned' },
        s: { status: 'someday', label: '→ someday' },
        d: { status: 'dropped', label: '→ dropped' },
      };
      const sa = statusActions[e.key];
      if (sa) {
        e.preventDefault();
        await act(async (id, cur) => {
          const prev = cur.status;
          await updateWorkItem(id, { status: sa.status });
          return { label: sa.label, apply: async () => { await updateWorkItem(id, { status: prev }); } };
        }, sa.label);
        return;
      }

      const prioActions: Record<string, Priority> = { '0': 'p0', '1': 'p1', '2': 'p2', '3': 'p3' };
      const pa = prioActions[e.key];
      if (pa) {
        e.preventDefault();
        await act(async (id, cur) => {
          const prev = cur.priority;
          await setPriority(id, pa);
          return { label: pa, apply: async () => { await setPriority(id, prev); } };
        }, pa);
        return;
      }

      if (e.key === 't') {
        e.preventDefault();
        await act(async (id, cur) => {
          const prevPinned = cur.todayPinned;
          await togglePin(id, !prevPinned);
          return { label: prevPinned ? 'unpin' : 'pin', apply: async () => { await togglePin(id, prevPinned); } };
        }, 'pinned');
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
      } catch (e) {
        flash(`✕ undo failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, cursorId, help, toast]);

  // Paint cursor highlight on the DOM row matching cursorId.
  useEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>('[data-inbox-item]');
    rows.forEach((el) => {
      const id = el.getAttribute('data-inbox-item');
      if (id && id === cursorId) el.setAttribute('data-cursor', 'true');
      else el.removeAttribute('data-cursor');
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
    } catch (e) {
      flash(`✕ undo failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      {help && (
        <div className="tri-help" onClick={() => setHelp(false)}>
          <div className="tri-help-box" onClick={(e) => e.stopPropagation()}>
            <div className="tri-help-title">inbox triage</div>
            <div className="tri-help-grid">
              <kbd>j</kbd><span>next item</span>
              <kbd>k</kbd><span>previous item</span>
              <kbd>t</kbd><span>toggle today pin</span>
              <kbd>n</kbd><span>→ planned</span>
              <kbd>s</kbd><span>→ someday</span>
              <kbd>d</kbd><span>→ dropped (undo via toast / ⌘Z)</span>
              <kbd>0–3</kbd><span>set priority</span>
              <kbd>e</kbd><span>rename row</span>
              <kbd>Enter</kbd><span>open detail</span>
              <kbd>c</kbd><span>quick capture</span>
              <kbd>?</kbd><span>toggle this help</span>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="tri-toast" data-testid="tri-toast">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button className="tri-undo" type="button" onClick={clickUndo} data-testid="tri-undo">
              undo
            </button>
          )}
        </div>
      )}
      <style>{triStyles}</style>
    </>
  );
}

const triStyles = `
[data-inbox-item][data-cursor] {
  outline: 2px solid var(--neon-cyan, #00fff2);
  outline-offset: 2px;
  border-radius: 6px;
}
.tri-help {
  position: fixed; inset: 0; z-index: 1002;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  display: grid; place-items: center;
}
.tri-help-box {
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-radius: 10px;
  padding: 1.1rem 1.4rem;
  min-width: 320px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6);
}
.tri-help-title { font-family: var(--font-mono); font-size: 0.85rem; color: var(--neon-cyan); margin-bottom: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; }
.tri-help-grid {
  display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem;
  font-family: var(--font-mono); font-size: 0.78rem;
  color: var(--text-primary, #fff);
}
.tri-help-grid kbd {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 1px 7px;
  font-family: inherit; font-size: 0.78rem;
  color: var(--text-secondary, #ccc);
}
.tri-toast {
  position: fixed; bottom: 5rem; right: 1.5rem;
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-left: 3px solid var(--neon-cyan);
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
  font-family: var(--font-mono); font-size: 0.74rem;
  color: var(--text-primary, #fff);
  z-index: 1001;
  display: flex; align-items: center; gap: 0.6rem;
}
.tri-undo {
  background: rgba(0,255,242,0.08);
  border: 1px solid rgba(0,255,242,0.4);
  color: var(--neon-cyan);
  font-family: inherit; font-size: 0.7rem;
  padding: 2px 8px; border-radius: 4px; cursor: pointer;
}
.tri-undo:hover { background: rgba(0,255,242,0.15); }
`;
