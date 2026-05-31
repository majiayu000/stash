import { useCallback, useEffect, useRef, useState } from 'react';
import { captureWorkItem } from '../api/work-items';
import { useDialogA11y } from './useDialogA11y';

/**
 * SPEC v0.3 §3f — global Quick Capture modal.
 *
 * Triggered by `c` anywhere in the workbench (unless a text field is focused).
 * Single-line input with live token preview chips. Esc cancels, Enter submits.
 * After submit: clears, refires `stash:captured` event for parent reload.
 */
export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDialog = useCallback(() => setOpen(false), []);
  const dialogRef = useDialogA11y(open, closeDialog, inputRef);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;
      if (open) return;
      if (editing) return;
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setText('');
    }
  }, [open]);

  function flashToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  async function submit() {
    const raw = text.trim();
    if (!raw || submitting) return;
    setSubmitting(true);
    try {
      const res = await captureWorkItem(raw);
      flashToast(`✓ captured: ${res.data.title || '(untitled)'}`);
      setOpen(false);
      window.dispatchEvent(new CustomEvent('stash:captured', { detail: res }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'capture failed';
      flashToast(`✕ ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  const chips = previewChips(text);

  return (
    <>
      {open && (
        <div className="qc-overlay" onClick={() => setOpen(false)} role="presentation">
          <div
            ref={dialogRef}
            className="qc-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="quick capture"
            tabIndex={-1}
          >
            <div className="qc-head">
              <span className="qc-prompt">▶</span>
              <span className="qc-title">quick capture</span>
              <span className="qc-hint">enter ↵ to save · esc to cancel</span>
            </div>
            <input
              ref={inputRef}
              className="qc-input"
              value={text}
              data-testid="qc-input"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
              }}
              placeholder="e.g. fix login #aurora ^p1 !tomorrow @auth *45m"
              spellCheck={false}
              autoComplete="off"
            />
            {chips.length > 0 && (
              <div className="qc-chips">
                {chips.map((c, i) => (
                  <span key={i} className={`qc-chip qc-chip-${c.type}`}>{c.label}</span>
                ))}
              </div>
            )}
            <div className="qc-footer">
              <code>#project</code>
              <code>@tag</code>
              <code>^p0..^p3</code>
              <code>!today</code>
              <code>!!due-fri</code>
              <code>*45m</code>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="qc-toast" data-testid="qc-toast">{toast}</div>}
      <style>{qcStyles}</style>
    </>
  );
}

interface Chip { type: string; label: string }
function previewChips(text: string): Chip[] {
  const out: Chip[] = [];
  const re = /(#[\w-]+|@[\w-]+|\^p[0-3]|!![\w-]+|![\w-]+|\*\d+[hm])/gi;
  for (const m of text.matchAll(re)) {
    const tok = m[0];
    const lower = tok.toLowerCase();
    if (lower.startsWith('#'))   out.push({ type: 'proj', label: tok });
    else if (lower.startsWith('@'))   out.push({ type: 'tag',  label: tok });
    else if (lower.startsWith('^p'))  out.push({ type: 'pri',  label: tok });
    else if (lower.startsWith('!!'))  out.push({ type: 'due',  label: tok });
    else if (lower.startsWith('!'))   out.push({ type: 'date', label: tok });
    else if (lower.startsWith('*'))   out.push({ type: 'est',  label: tok });
  }
  return out;
}

const qcStyles = `
.qc-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: grid; place-items: start center;
  padding-top: 18vh;
  animation: qc-fade 0.12s ease;
}
@keyframes qc-fade { from { opacity: 0 } to { opacity: 1 } }
.qc-modal {
  width: min(640px, 92vw);
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-radius: 14px;
  padding: 1rem 1.1rem;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,255,242,0.1);
  display: flex; flex-direction: column; gap: 0.7rem;
}
.qc-head {
  display: flex; align-items: center; gap: 0.6rem;
  font-family: var(--font-mono);
}
.qc-prompt { color: var(--neon-cyan); font-weight: 700; font-size: 1.05rem; filter: drop-shadow(0 0 8px var(--neon-cyan)); }
.qc-title  { color: var(--text-primary, #fff); font-size: 0.88rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.qc-hint   { color: var(--text-muted, #888); font-size: 0.7rem; margin-left: auto; }
.qc-input {
  appearance: none;
  background: var(--bg-void, #0a0a14);
  border: 1px solid var(--border-hair, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  font-family: var(--font-mono);
  font-size: 1rem;
  color: var(--text-primary, #fff);
  outline: none;
  transition: border-color 0.15s;
}
.qc-input:focus { border-color: var(--neon-cyan); box-shadow: 0 0 0 3px rgba(0,255,242,0.1); }
.qc-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.qc-chip {
  font-family: var(--font-mono); font-size: 0.72rem; padding: 2px 8px; border-radius: 6px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
}
.qc-chip-proj { color: var(--neon-cyan);   border-color: rgba(0,255,242,0.3); }
.qc-chip-tag  { color: var(--neon-purple); border-color: rgba(191,90,242,0.3); }
.qc-chip-pri  { color: var(--neon-orange); border-color: rgba(255,159,10,0.3); }
.qc-chip-date { color: var(--neon-green);  border-color: rgba(48,209,88,0.3); }
.qc-chip-due  { color: var(--neon-pink);   border-color: rgba(255,55,95,0.3); }
.qc-chip-est  { color: var(--text-secondary, #ccc); }
.qc-footer { display: flex; flex-wrap: wrap; gap: 0.6rem; font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted, #888); }
.qc-footer code { background: rgba(255,255,255,0.04); padding: 1px 6px; border-radius: 4px; }
.qc-toast {
  position: fixed; bottom: 1.5rem; right: 1.5rem;
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-left: 3px solid var(--neon-cyan);
  border-radius: 8px;
  padding: 0.55rem 0.9rem;
  font-family: var(--font-mono); font-size: 0.78rem;
  color: var(--text-primary, #fff);
  z-index: 1001;
  box-shadow: 0 12px 28px rgba(0,0,0,0.4);
  animation: qc-toast-in 0.18s ease;
}
@keyframes qc-toast-in { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
