import { useState, type FormEvent } from 'react';
import type { Skill, SkillSource } from '@stash/shared';
import { slugify } from './todo-detail.utils';

/** Create/delete dialogs and the result notice for the skills library. */

export interface SkillCreateForm {
  name: string;
  id: string;
  emoji: string;
  description: string;
  idTouched: boolean;
}

export function SkillNotice({ notice, onDismiss }: { notice: { message: string; tone: 'ok' | 'error' }; onDismiss: () => void }) {
  return (
    <div className={`sk-notice ${notice.tone}`} role="status" data-testid="cm-notice">
      <span>{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="dismiss notice">×</button>
    </div>
  );
}

export function SkillCreateDialog({
  form,
  error,
  onChange,
  onChangeName,
  onClose,
  onSubmit,
}: {
  form: SkillCreateForm;
  error: string;
  onChange: (patch: Partial<SkillCreateForm>) => void;
  onChangeName: (name: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  return (
    <div className="sk-dialog-backdrop" role="presentation">
      <form className="sk-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-create-title" onSubmit={onSubmit}>
        <div className="sk-dialog-head">
          <div>
            <div id="cm-create-title" className="sk-dialog-title">New skill</div>
            <div className="sk-dialog-sub">Create a local skill entry for project binding.</div>
          </div>
          <button type="button" className="sk-icon-btn" onClick={onClose} aria-label="close">×</button>
        </div>

        <label className="sk-field">
          <span>Name</span>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="Inbox Cleaner"
            data-testid="cm-skill-name"
          />
        </label>

        <div className="sk-field-row">
          <label className="sk-field">
            <span>ID</span>
            <input
              value={form.id}
              onChange={(e) => onChange({ id: e.target.value, idTouched: true })}
              placeholder="inbox-cleaner"
              data-testid="cm-skill-id"
            />
          </label>
          <label className="sk-field sk-emoji-field">
            <span>Icon</span>
            <input
              value={form.emoji}
              onChange={(e) => onChange({ emoji: e.target.value })}
              data-testid="cm-skill-emoji"
              maxLength={8}
            />
          </label>
        </div>

        <label className="sk-field">
          <span>Description</span>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Clean incoming notes"
            data-testid="cm-skill-description"
          />
        </label>

        {error && <div className="sk-dialog-error" role="alert">{error}</div>}

        <div className="sk-dialog-actions">
          <button className="np-btn ghost" type="button" onClick={onClose}>cancel</button>
          <button className="np-btn primary" type="submit" data-testid="cm-create-submit">create skill</button>
        </div>
      </form>
    </div>
  );
}

export function SkillDeleteDialog({ skill, error, onClose, onConfirm }: {
  skill: Skill;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="sk-dialog-backdrop" role="presentation">
      <div className="sk-dialog sk-confirm" role="dialog" aria-modal="true" aria-labelledby="cm-delete-title">
        <div className="sk-dialog-head">
          <div>
            <div id="cm-delete-title" className="sk-dialog-title">Delete skill?</div>
            <div className="sk-dialog-sub">All project bindings for this skill will be removed.</div>
          </div>
          <button type="button" className="sk-icon-btn" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="sk-confirm-card">
          <span>{skill.emoji}</span>
          <div>
            <div>{skill.name}</div>
            <code>{skill.id}</code>
          </div>
        </div>
        {error && <div className="sk-dialog-error" role="alert">{error}</div>}
        <div className="sk-dialog-actions">
          <button className="np-btn ghost" type="button" onClick={onClose}>cancel</button>
          <button className="np-btn ghost danger" type="button" onClick={() => { void onConfirm(); }} data-testid="cm-delete-confirm">delete</button>
        </div>
      </div>
    </div>
  );
}
