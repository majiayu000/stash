import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkItem } from '@stash/shared';
import { listWorkItems } from '../api/work-items';
import { reportAsyncError } from './reportAsyncError';

/**
 * v0.4 — global search palette.
 *
 * Triggers: `Cmd+K` / `Ctrl+K` anywhere, or `/` when no input has focus.
 * Server-side LIKE on title + description + labels via /api/work-items?q=...
 * Enter on a row → /c/l/:id (Concept L detail).
 * j/k or ↑/↓ navigate.
 */
export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [results, setResults] = useState<WorkItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  // Open / close hotkey.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;

      if (!open) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault(); setOpen(true); return;
        }
        if (!editing && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault(); setOpen(true); return;
        }
        return;
      }

      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus input on open; clear on close.
  useEffect(() => {
    if (open) {
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setText('');
      setResults([]);
    }
  }, [open]);

  // Debounced query.
  const query = useMemo(() => text.trim(), [text]);
  useEffect(() => {
    if (!open || query.length === 0) { setResults([]); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const found = await listWorkItems({ q: query, includeDropped: false });
        if (cancelled) return;
        setResults(found.slice(0, 12));
        setCursor(0);
      } catch (error) {
        if (!cancelled) reportAsyncError('search work items', error);
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query, open]);

  function pick(it: WorkItem) {
    setOpen(false);
    navigate(`/c/l/${it.id}`);
  }

  return !open ? null : (
    <div className="sp-overlay" onClick={() => setOpen(false)} role="presentation">
      <div className="sp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="search">
        <input
          ref={inputRef}
          className="sp-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="search title, description, labels…  enter to open · esc to close"
          data-testid="sp-input"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || (e.key === 'j' && (e.ctrlKey || e.metaKey))) {
              e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === 'ArrowUp' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
              e.preventDefault(); setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const it = results[cursor];
              if (it) pick(it);
            }
          }}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="sp-results">
          {query.length === 0 && (
            <div className="sp-hint">type to search · <kbd>↑</kbd>/<kbd>↓</kbd> navigate · <kbd>enter</kbd> open · <kbd>esc</kbd> close</div>
          )}
          {query.length > 0 && results.length === 0 && (
            <div className="sp-hint">no matches</div>
          )}
          {results.map((it, i) => (
            <button
              key={it.id}
              type="button"
              className={`sp-row ${i === cursor ? 'sp-cursor' : ''} ${it.status === 'done' ? 'done' : ''}`}
              onClick={() => pick(it)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="sp-row-title">{highlight(it.title, query)}</span>
              <span className="sp-row-meta">
                {it.status} · {it.priority}{it.labels.length > 0 && ' · ' + it.labels.map((l) => '@' + l).join(' ')}
              </span>
            </button>
          ))}
        </div>
      </div>
      <style>{spStyles}</style>
    </div>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(0,255,242,0.25)', color: 'var(--neon-cyan)', borderRadius: 2 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

const spStyles = `
.sp-overlay {
  position: fixed; inset: 0; z-index: 1003;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(8px);
  display: grid; place-items: start center;
  padding-top: 14vh;
  animation: sp-fade 0.12s ease;
}
@keyframes sp-fade { from { opacity: 0 } to { opacity: 1 } }
.sp-modal {
  width: min(640px, 92vw);
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-radius: 14px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6);
  overflow: hidden;
}
.sp-input {
  width: 100%; box-sizing: border-box;
  appearance: none;
  background: var(--bg-void, #0a0a14);
  border: 0; border-bottom: 1px solid var(--border-hair, rgba(255,255,255,0.08));
  padding: 0.85rem 1rem;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--text-primary, #fff);
  outline: none;
}
.sp-results {
  max-height: 56vh; overflow-y: auto;
  display: flex; flex-direction: column;
}
.sp-hint {
  padding: 1rem 1.1rem;
  font-family: var(--font-mono); font-size: 0.74rem; color: var(--text-muted, #888);
}
.sp-hint kbd {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 3px; padding: 0 5px; font-family: inherit;
}
.sp-row {
  display: flex; flex-direction: column; align-items: stretch; text-align: left;
  background: transparent; border: 0;
  padding: 0.55rem 1rem;
  cursor: pointer;
  border-left: 2px solid transparent;
  font-family: var(--font-mono);
  color: var(--text-primary, #fff);
}
.sp-row.done { opacity: 0.55; }
.sp-row:hover, .sp-row.sp-cursor {
  background: rgba(0,255,242,0.05);
  border-left-color: var(--neon-cyan);
}
.sp-row-title { font-size: 0.86rem; }
.sp-row-meta {
  font-size: 0.65rem;
  color: var(--text-muted, #888);
  margin-top: 2px;
}
`;
