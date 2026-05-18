import { useState } from 'react';
import type { ChecklistItem, WorkItem } from '@stash/shared';
import {
  appendChecklist,
  removeChecklist,
  toggleChecklist,
} from '../../api/work-items';

interface UseChecklistArgs {
  workItem: WorkItem | null;
  onChange: (next: WorkItem) => void;
  onFlash: (msg: string) => void;
}

export interface ChecklistState {
  items: ChecklistItem[];
  draft: string;
  setDraft: (v: string) => void;
  add: () => Promise<void>;
  toggle: (item: ChecklistItem) => Promise<void>;
  remove: (item: ChecklistItem) => Promise<void>;
  disabled: boolean;
}

/**
 * Lightweight per-todo checklist. Sits next to sub-tasks: subtasks are full
 * WorkItems with their own status / parentId, checklist items are inline
 * strings on the parent work item. Use whichever fits — checklist for "the
 * three steps inside this one todo", subtasks for "this todo splits into
 * three smaller todos".
 */
export function useChecklist(args: UseChecklistArgs): ChecklistState {
  const { workItem, onChange, onFlash } = args;
  const [draft, setDraft] = useState('');

  async function add() {
    if (!workItem) return;
    const text = draft.trim();
    if (!text) return;
    try {
      const next = await appendChecklist(workItem.id, text);
      onChange(next);
      setDraft('');
    } catch (e) {
      onFlash(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function toggle(item: ChecklistItem) {
    if (!workItem) return;
    try {
      const next = await toggleChecklist(workItem.id, item.id);
      onChange(next);
    } catch (e) {
      onFlash(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function remove(item: ChecklistItem) {
    if (!workItem) return;
    try {
      const next = await removeChecklist(workItem.id, item.id);
      onChange(next);
    } catch (e) {
      onFlash(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    items: workItem?.checklist ?? [],
    draft,
    setDraft,
    add,
    toggle,
    remove,
    disabled: !workItem,
  };
}

export function ChecklistPanel({ state }: { state: ChecklistState }) {
  const { items, draft, setDraft, add, toggle, remove, disabled } = state;
  const done = items.filter((i) => i.completed).length;

  return (
    <div className="td-section">
      <div className="td-section-label">
        <span>checklist</span>
        <span style={{ color: 'var(--neon-green)' }}>{done}/{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            no inline steps. add one for "the small things inside this todo" — they don't get their own status.
          </div>
        )}
        {items.map((it) => (
          <div
            key={it.id}
            className={`td-sub ${it.completed ? 'done' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <button
              type="button"
              onClick={() => toggle(it)}
              disabled={disabled}
              className="td-sub-check"
              style={{ background: 'transparent', border: 0, padding: 0, cursor: disabled ? 'default' : 'pointer' }}
              title={it.completed ? 'mark not done' : 'mark done'}
              data-testid={`td-cl-toggle-${it.id}`}
            >{it.completed ? '✓' : '○'}</button>
            <span className="td-sub-text" style={{ flex: 1 }}>{it.text}</span>
            <button
              type="button"
              onClick={() => remove(it)}
              disabled={disabled}
              style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: disabled ? 'default' : 'pointer', fontSize: '0.85rem' }}
              title="remove"
              data-testid={`td-cl-remove-${it.id}`}
            >×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="+ add a step…"
            disabled={disabled}
            data-testid="td-cl-add"
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 4,
              padding: '4px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={add}
              disabled={disabled}
              style={{
                background: 'transparent',
                border: '1px solid var(--neon-cyan)',
                color: 'var(--neon-cyan)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                padding: '2px 10px',
                borderRadius: 4,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >↵</button>
          )}
        </div>
      </div>
    </div>
  );
}
