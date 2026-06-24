import { useEffect, useState, type ReactNode } from 'react';
import type { WorkItem } from '@stash/shared';

export function EditableTitle({ value, disabled, onCommit }: { value: string; disabled?: boolean; onCommit: (next: string) => void | Promise<void> }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      className="td-modal-title"
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const t = text.trim(); if (t && t !== value) onCommit(t); else setText(value); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { setText(value); (e.target as HTMLInputElement).blur(); }
      }}
      data-testid="td-title"
    />
  );
}

export function EditableDescription({ value, disabled, placeholder, onCommit }: { value: string; disabled?: boolean; placeholder?: string; onCommit: (next: string) => void | Promise<void> }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <textarea
      className="td-modal-desc"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onCommit(text); }}
      data-testid="td-desc"
    />
  );
}

export function SubTask({ done, dropped, text, onToggle, onDrop }: {
  done?: boolean;
  dropped?: boolean;
  text: string;
  onToggle?: () => void;
  onDrop?: () => void;
}) {
  return (
    <div className={`td-sub ${done ? 'done' : ''}`} style={dropped ? { opacity: 0.4, textDecoration: 'line-through' } : undefined}>
      <button
        type="button"
        className="td-sub-check"
        onClick={onToggle}
        disabled={!onToggle}
        style={{ background: 'transparent', border: 0, padding: 0, cursor: onToggle ? 'pointer' : 'default' }}
        title={done ? 'mark not done' : 'mark done'}
      >{done ? '✓' : '○'}</button>
      <span className="td-sub-text">{text}</span>
      {onDrop && !dropped && (
        <button
          type="button"
          onClick={onDrop}
          style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 4px', marginLeft: 'auto' }}
          title="drop sub-task"
        >×</button>
      )}
    </div>
  );
}

export function MetaRow({ k, v, editable }: { k: string; v: ReactNode; editable?: boolean }) {
  return (
    <div className="td-meta-row">
      <span className="td-meta-k">{k}</span>
      <span className="td-meta-v">{v}</span>
      {editable && <span className="td-meta-edit">✎</span>}
    </div>
  );
}

export function PromoteBtn({ icon, title, sub, onClick, disabled }: {
  icon: string; title: string; sub: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      className="td-promote-btn"
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'default' } : undefined}
    >
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div className="td-promote-title">{title}</div>
        <div className="td-promote-sub">{sub}</div>
      </div>
      <span className="td-promote-chev">›</span>
    </button>
  );
}

// SPEC v0.3 §3c — option ↔ RecurrenceRule mapping for the picker.
export function recurrenceToOption(r: WorkItem['recurrence']): string {
  if (!r) return 'none';
  if (r.type === 'rrule' && r.freq === 'DAILY') return 'daily';
  if (r.type === 'rrule' && r.freq === 'WEEKLY' && r.byDay?.length === 5) return 'weekdays';
  if (r.type === 'rrule' && r.freq === 'WEEKLY') return 'weekly';
  if (r.type === 'rrule' && r.freq === 'MONTHLY') return 'monthly';
  if (r.type === 'after_completion' && r.offsetDays === 1) return 'after_1d';
  if (r.type === 'after_completion' && r.offsetDays === 7) return 'after_7d';
  return 'none';
}

export function optionToRecurrence(opt: string): WorkItem['recurrence'] {
  switch (opt) {
    case 'daily':    return { type: 'rrule', freq: 'DAILY',   interval: 1 };
    case 'weekdays': return { type: 'rrule', freq: 'WEEKLY',  interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
    case 'weekly':   return { type: 'rrule', freq: 'WEEKLY',  interval: 1 };
    case 'monthly':  return { type: 'rrule', freq: 'MONTHLY', interval: 1 };
    case 'after_1d': return { type: 'after_completion', offsetDays: 1 };
    case 'after_7d': return { type: 'after_completion', offsetDays: 7 };
    default:         return undefined;
  }
}

// ISO datetime -> "YYYY-MM-DDTHH:MM" suitable for <input type=datetime-local>.
export function toLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
