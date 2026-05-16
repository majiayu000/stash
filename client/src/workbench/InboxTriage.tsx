import { useEffect, useState } from 'react';
import { listWorkItems, setPriority, togglePin, updateWorkItem } from '../api/work-items';

/**
 * SPEC v0.3 §3e — global inbox triage keyboard layer.
 *
 * Activates when the workbench is focused and no input is. Cursor highlights
 * the focused inbox row by data-testid attribute. Single-key actions hit the
 * API and emit `stash:captured` so the workbench reloads.
 *
 * Keys:
 *   j / k       → next / prev
 *   t           → toggle today_pinned
 *   n           → status planned (Next/Anytime)
 *   s           → status someday
 *   d           → status dropped
 *   0 / 1 / 2 / 3 → priority p0/p1/p2/p3
 *   ?           → show shortcut help overlay
 */
export function InboxTriage() {
  const [cursor, setCursor] = useState(0);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function act(handler: (id: string) => Promise<void>, label: string) {
      const items = await loadInboxIds();
      const id = items[cursor];
      if (!id) return;
      try {
        await handler(id);
        flash(`✓ ${label}`);
        window.dispatchEvent(new CustomEvent('stash:captured'));
      } catch (e) {
        flash(`✕ ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;
      if (editing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Help overlay toggle
      if (e.key === '?') { e.preventDefault(); setHelp((v) => !v); return; }
      if (e.key === 'Escape' && help) { e.preventDefault(); setHelp(false); return; }

      // Navigation
      if (e.key === 'j') {
        e.preventDefault();
        const items = await loadInboxIds();
        if (items.length > 0) setCursor((c) => Math.min(c + 1, items.length - 1));
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
        return;
      }

      // Actions
      if (e.key === 't') { e.preventDefault(); await act(async (id) => { const items = await loadInboxItems(); const cur = items[cursor]; if (cur) await togglePin(id, !cur.todayPinned); }, 'pinned'); return; }
      if (e.key === 'n') { e.preventDefault(); await act(async (id) => { await updateWorkItem(id, { status: 'planned' }); }, '→ planned'); return; }
      if (e.key === 's') { e.preventDefault(); await act(async (id) => { await updateWorkItem(id, { status: 'someday' }); }, '→ someday'); return; }
      if (e.key === 'd') { e.preventDefault(); await act(async (id) => { await updateWorkItem(id, { status: 'dropped' }); }, '→ dropped'); return; }
      if (e.key === '0') { e.preventDefault(); await act(async (id) => { await setPriority(id, 'p0'); }, 'p0'); return; }
      if (e.key === '1') { e.preventDefault(); await act(async (id) => { await setPriority(id, 'p1'); }, 'p1'); return; }
      if (e.key === '2') { e.preventDefault(); await act(async (id) => { await setPriority(id, 'p2'); }, 'p2'); return; }
      if (e.key === '3') { e.preventDefault(); await act(async (id) => { await setPriority(id, 'p3'); }, 'p3'); return; }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, help]);

  // Visual cursor: highlight the n-th [data-inbox-item] in the DOM.
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('[data-inbox-item]');
    items.forEach((el, i) => {
      if (i === cursor) {
        el.setAttribute('data-cursor', 'true');
      } else {
        el.removeAttribute('data-cursor');
      }
    });
  });

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
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
              <kbd>d</kbd><span>→ dropped</span>
              <kbd>0–3</kbd><span>set priority</span>
              <kbd>c</kbd><span>quick capture</span>
              <kbd>?</kbd><span>toggle this help</span>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="tri-toast">{toast}</div>}
      <style>{triStyles}</style>
    </>
  );
}

async function loadInboxIds(): Promise<string[]> {
  const items = await listWorkItems({ status: 'inbox' });
  return items.map((i) => i.id);
}

async function loadInboxItems() {
  return await listWorkItems({ status: 'inbox' });
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
}
`;
