import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Priority, WorkItem, WorkItemStatus } from '@stash/shared';
import {
  listWorkItems,
  setPriority,
  togglePin,
  updateWorkItem,
} from '../api/work-items';
import { useWorkbenchDialog } from '../components/ui/workbench-dialogs';
import {
  claimPendingUndo,
  clearPendingUndo,
  registerPendingUndo,
  type PendingUndoToken,
} from './undoCoordinator';

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
 *   e              rename row
 *   Enter          open the focused item's detail route
 *   ?              toggle help overlay
 */

const INTERACTIVE_TARGET_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
].join(',');

const OPEN_MODAL_SELECTOR = [
  'dialog[open]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '.td-overlay',
  '.cp-overlay',
  '.qc-overlay',
  '.sp-overlay',
  '.decision-inbox-overlay',
  '.ui-dialog-overlay',
].join(',');

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_TARGET_SELECTOR) !== null;
}

function hasOpenModal(): boolean {
  return document.querySelector(OPEN_MODAL_SELECTOR) !== null;
}

interface UndoAction {
  label: string;
  apply: () => Promise<void>;
}

interface UndoToast {
  msg: string;
  undo?: UndoAction;
  undoToken?: PendingUndoToken;
}

export function InboxTriage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const toastRef = useRef<UndoToast | null>(null);
  const undoTokenRef = useRef<PendingUndoToken | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useWorkbenchDialog();
  const navigate = useNavigate();

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

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (undoTokenRef.current) clearPendingUndo(undoTokenRef.current);
    undoTokenRef.current = null;
    toastRef.current = null;
  }, []);

  useEffect(() => {
    /**
     * Apply `handler` to the cursor's item OR every item in `selected` when
     * the selection is non-empty. Single-item ops keep their undo; bulk ops
     * compose all undos into one chained reverse.
     */
    async function act(handler: (id: string, current: WorkItem) => Promise<UndoAction | void>, label: string) {
      const targets = selected.size > 0
        ? items.filter((it) => selected.has(it.id))
        : items.filter((it) => it.id === cursorId);
      if (targets.length === 0) return;
      const selectedTargetIds = selected.size > 0 ? targets.map((it) => it.id) : [];

      try {
        const undos: UndoAction[] = [];
        for (const cur of targets) {
          const undo = await handler(cur.id, cur);
          if (undo) undos.push(undo);
        }
        const composedUndo: UndoAction | undefined = undos.length > 0
          ? {
              label: undos[0]!.label,
              apply: async () => {
                for (const u of undos) await u.apply();
                if (selectedTargetIds.length > 0) setSelected(new Set(selectedTargetIds));
              },
            }
          : undefined;
        const labelTxt = targets.length === 1 ? `✓ ${label}` : `✓ ${label} · ${targets.length} items`;
        flash(labelTxt, composedUndo);
        setSelected(new Set()); // clear after bulk
        window.dispatchEvent(new CustomEvent('stash:captured'));
      } catch (e) {
        flash(`✕ ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    async function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;

      // Help is modal: only its own close shortcuts remain active.
      if (help) {
        if (!e.metaKey && !e.altKey && !e.ctrlKey && (e.key === '?' || e.key === 'Escape')) {
          e.preventDefault();
          setHelp(false);
        }
        return;
      }

      // Never let a global triage key leak out of another control or modal.
      if (isInteractiveTarget(e.target) || hasOpenModal()) return;

      // Cmd+Z / Ctrl+Z → invoke pending undo before filtering modifiers.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (
          toast?.undo
          && toast.undoToken
          && toastRef.current === toast
          && claimPendingUndo(toast.undoToken)
        ) {
          if (undoTokenRef.current === toast.undoToken) undoTokenRef.current = null;
          e.preventDefault();
          e.stopImmediatePropagation();
          void applyUndo(toast);
        }
        return;
      }
      if (e.metaKey || e.altKey || e.ctrlKey) return;

      // Help overlay
      if (e.key === '?') { e.preventDefault(); setHelp((v) => !v); return; }
      if (e.key === 'Escape') {
        if (selected.size > 0) { e.preventDefault(); setSelected(new Set()); return; }
      }

      // v → toggle current row in selection
      if (e.key === 'v') {
        e.preventDefault();
        if (!cursorId) return;
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(cursorId)) next.delete(cursorId); else next.add(cursorId);
          return next;
        });
        return;
      }

      // V (shift) → select all visible inbox rows
      if (e.key === 'V') {
        e.preventDefault();
        setSelected(new Set(items.map((it) => it.id)));
        return;
      }

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

      // Enter → open the detail route for the current cursor.
      if (e.key === 'Enter') {
        if (!cursorId) return;
        e.preventDefault();
        navigate(`/c/l/${encodeURIComponent(cursorId)}`);
        return;
      }

      // Rename
      if (e.key === 'e') {
        e.preventDefault();
        await act(async (id, cur) => {
          const next = await dialog.prompt({
            title: 'rename inbox item',
            label: 'title',
            defaultValue: cur.title,
            confirmLabel: 'rename',
          });
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

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, items, cursorId, help, navigate, toast, selected]);

  // Paint cursor + selection highlight on the matching DOM rows.
  useEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>('[data-inbox-item]');
    rows.forEach((el) => {
      const id = el.getAttribute('data-inbox-item');
      if (id && id === cursorId) el.setAttribute('data-cursor', 'true');
      else el.removeAttribute('data-cursor');
      if (id && selected.has(id)) el.setAttribute('data-selected', 'true');
      else el.removeAttribute('data-selected');
    });
  });

  function flash(msg: string, undo?: UndoAction) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (undoTokenRef.current) clearPendingUndo(undoTokenRef.current);

    const undoToken = undo ? registerPendingUndo('inbox') : undefined;
    const nextToast: UndoToast = { msg, undo, undoToken };
    undoTokenRef.current = undoToken ?? null;
    toastRef.current = nextToast;
    setToast(nextToast);
    toastTimer.current = setTimeout(() => {
      if (toastRef.current !== nextToast) return;
      if (undoToken) clearPendingUndo(undoToken);
      if (undoTokenRef.current === undoToken) undoTokenRef.current = null;
      toastRef.current = null;
      setToast((current) => current === nextToast ? null : current);
      toastTimer.current = null;
    }, undo ? 8000 : 1800);
  }

  async function applyUndo(sourceToast: UndoToast) {
    if (!sourceToast.undo) return;
    const u = sourceToast.undo;
    try {
      await u.apply();
      if (toastRef.current === sourceToast) flash(`↶ undone (${u.label})`);
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (toastRef.current === sourceToast) flash(`✕ undo failed: ${message}`);
      else console.error(`Inbox undo failed: ${message}`);
    }
  }

  async function clickUndo() {
    if (!toast?.undo || !toast.undoToken || toastRef.current !== toast) return;
    if (!clearPendingUndo(toast.undoToken)) return;
    if (undoTokenRef.current === toast.undoToken) undoTokenRef.current = null;
    await applyUndo(toast);
  }

  return (
    <>
      {help && (
        <div className="tri-help" onClick={() => setHelp(false)}>
          <div className="tri-help-box" onClick={(e) => e.stopPropagation()}>
            <div className="tri-help-title">keyboard shortcuts</div>

            <div className="tri-help-section">global</div>
            <div className="tri-help-grid">
              <kbd>c</kbd><span>quick capture</span>
              <kbd>⌘ K</kbd><span>search palette · title / description / labels</span>
              <kbd>`</kbd><span>smart-lists chip row (overdue / today-pinned / p0 / …)</span>
              <kbd>⌘ Z</kbd><span>undo last action (while toast is visible)</span>
              <kbd>?</kbd><span>toggle this help</span>
            </div>

            <div className="tri-help-section">inbox · cursor on rows</div>
            <div className="tri-help-grid">
              <kbd>j</kbd><span>next item</span>
              <kbd>k</kbd><span>previous item</span>
              <kbd>Enter</kbd><span>open detail modal</span>
              <kbd>e</kbd><span>rename row</span>
              <kbd>t</kbd><span>toggle today pin</span>
              <kbd>n</kbd><span>→ planned</span>
              <kbd>s</kbd><span>→ someday</span>
              <kbd>d</kbd><span>→ dropped (undo via toast / ⌘Z)</span>
              <kbd>0–3</kbd><span>set priority</span>
              <kbd>v</kbd><span>toggle select current row</span>
              <kbd>shift V</kbd><span>select all visible inbox rows</span>
              <kbd>esc</kbd><span>clear selection / close help</span>
            </div>

            <div className="tri-help-section">today · shift-namespaced</div>
            <div className="tri-help-grid">
              <kbd>shift J</kbd><span>next today item</span>
              <kbd>shift K</kbd><span>previous today item</span>
              <kbd>shift V</kbd><span>toggle select current today row</span>
              <kbd>shift A</kbd><span>select all today rows</span>
              <kbd>shift X</kbd><span>→ done</span>
              <kbd>shift T</kbd><span>toggle today pin</span>
              <kbd>shift D</kbd><span>→ dropped</span>
              <kbd>shift !@#)</kbd><span>set priority (shift+1/2/3/0 on US layout)</span>
            </div>

            <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              when ≥1 inbox row is selected, action keys (t / n / s / d / 0–3) apply to the whole selection. shift-key Today actions work the same way for today selections.
            </div>
          </div>
        </div>
      )}
      {selected.size > 0 && (
        <div className="tri-sel-pill" data-testid="tri-sel-count">
          {selected.size} selected · t · n · s · d · 0–3 · esc
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
[data-inbox-item][data-selected] {
  box-shadow: inset 3px 0 0 var(--neon-purple, #bf5af2);
  background: rgba(191,90,242,0.06);
}
[data-inbox-item][data-selected][data-cursor] {
  /* both: cursor outline wins; selection bar still shows on the left */
}
.tri-sel-pill {
  position: fixed; bottom: 8.5rem; right: 1.5rem;
  background: rgba(191,90,242,0.12);
  border: 1px solid var(--neon-purple, #bf5af2);
  color: var(--neon-purple, #bf5af2);
  font-family: var(--font-mono); font-size: 0.72rem;
  padding: 4px 10px; border-radius: 4px;
  z-index: 1001;
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
.tri-help-section {
  font-family: var(--font-mono); font-size: 0.7rem; font-weight: 600;
  color: var(--neon-purple); text-transform: uppercase; letter-spacing: 0.1em;
  margin-top: 0.85rem; margin-bottom: 0.4rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid rgba(191,90,242,0.18);
}
.tri-help-box { max-width: 460px; max-height: 80vh; overflow-y: auto; }
.tri-help-grid {
  display: grid; grid-template-columns: auto 1fr; gap: 0.45rem 1rem;
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
