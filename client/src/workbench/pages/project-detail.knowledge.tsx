import { useEffect, useState } from 'react';
import type { Decision, Lesson, Milestone, MilestoneStatus } from '@stash/shared';
import {
  createDecision,
  createLesson,
  createMilestone,
  deleteDecision,
  deleteLesson,
  deleteMilestone,
  setProjectIntent,
  setProjectNotes,
  updateDecision,
  updateLesson,
  updateMilestone,
} from '../../api/project-knowledge';
import { useWorkbenchDialog } from '../../components/ui/workbench-dialogs';
import { reportAsyncError } from '../reportAsyncError';

/**
 * Editable project knowledge sections. Extracted into a focused file
 * to keep the parent component under U-16's 800-line cap.
 *
 * Convention: each editor owns its own API call(s). On success they invoke
 * `onChange()` so the parent reloads canonical data. Optimistic updates only
 * for text (intent/notes) where the round-trip latency would be visible.
 */

export interface KnowledgeProps<T = unknown> {
  projectId: string;
  value: T;
  onChange: () => void;
}

async function applyKnowledgeMutation(
  scope: string,
  mutation: () => Promise<unknown>,
  onChange: () => void,
  retryable = false,
): Promise<boolean> {
  try {
    await mutation();
    onChange();
    return true;
  } catch (error) {
    const retry = retryable
      ? async () => { await applyKnowledgeMutation(scope, mutation, onChange, true); }
      : undefined;
    reportAsyncError(scope, error, retry);
    return false;
  }
}

// ─── Intent ────────────────────────────────────────────────────────────────

export function KnowledgeIntentEditor({ projectId, value: intent, onChange }: KnowledgeProps<string>) {
  const [text, setText] = useState(intent);
  useEffect(() => setText(intent), [intent]);

  async function commit() {
    if (text.trim() === intent.trim()) return;
    const nextIntent = text.trim();
    const saved = await applyKnowledgeMutation(
      'save project intent',
      () => setProjectIntent(projectId, nextIntent),
      onChange,
      true,
    );
    if (!saved) setText(intent);
  }

  return (
    <div className="surface kw-intent">
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> 🎯 project intent
        <span className="right" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>blur to save</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder="e.g. ship MVP by Friday. focus on closing the auth loop and cutting first user-facing draft."
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 0, outline: 0, resize: 'vertical', minHeight: 64,
          fontFamily: 'var(--font-body)', fontSize: '0.95rem', lineHeight: 1.65,
          color: 'var(--text-primary)', fontStyle: text ? 'italic' : 'normal',
        }}
        data-testid="kw-intent"
      />
    </div>
  );
}

// ─── Notes ─────────────────────────────────────────────────────────────────

export function KnowledgeNotesEditor({ projectId, value: notes, onChange }: KnowledgeProps<string>) {
  const [text, setText] = useState(notes);
  useEffect(() => setText(notes), [notes]);

  async function commit() {
    if (text === notes) return;
    const nextNotes = text;
    const saved = await applyKnowledgeMutation(
      'save project notes',
      () => setProjectNotes(projectId, nextNotes),
      onChange,
      true,
    );
    if (!saved) setText(notes);
  }

  return (
    <div className="surface">
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> 📖 notes · scratchpad
        <span className="right" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>markdown · blur to save</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder="# scratch&#10;- one bullet per loose thought&#10;- ## headers for sections"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 0, outline: 0, resize: 'vertical', minHeight: 120,
          fontFamily: 'var(--font-mono)', fontSize: '0.86rem', lineHeight: 1.5,
          color: 'var(--text-primary)',
        }}
        data-testid="kw-notes"
      />
    </div>
  );
}

// ─── Milestones ────────────────────────────────────────────────────────────

const MS_STATUS_CYCLE: MilestoneStatus[] = ['planned', 'wip', 'done'];
const MS_COLOR: Record<MilestoneStatus, string> = {
  planned: 'var(--neon-purple)',
  wip: 'var(--neon-cyan)',
  done: 'var(--neon-green)',
};

export function KnowledgeMilestonesEditor({ projectId, value: milestones, onChange }: KnowledgeProps<Milestone[]>) {
  const dialog = useWorkbenchDialog();

  async function add() {
    const name = await dialog.prompt({
      title: 'milestone name',
      label: 'name',
      placeholder: 'ship the first usable flow',
      confirmLabel: 'add milestone',
    });
    if (!name?.trim()) return;
    await applyKnowledgeMutation(
      'create project milestone',
      () => createMilestone(projectId, { name: name.trim() }),
      onChange,
    );
  }
  async function cycle(m: Milestone) {
    const idx = MS_STATUS_CYCLE.indexOf(m.status);
    const next = MS_STATUS_CYCLE[(idx + 1) % MS_STATUS_CYCLE.length]!;
    await applyKnowledgeMutation(
      'update project milestone',
      () => updateMilestone(projectId, m.id, { status: next, progress: next === 'done' ? 100 : m.progress }),
      onChange,
      true,
    );
  }
  async function remove(m: Milestone) {
    const ok = await dialog.confirm({
      title: 'delete milestone?',
      description: m.name,
      confirmLabel: 'delete',
      tone: 'danger',
    });
    if (!ok) return;
    await applyKnowledgeMutation(
      'delete project milestone',
      () => deleteMilestone(projectId, m.id),
      onChange,
    );
  }

  return (
    <div className="surface">
      <div className="sec-head" style={{ marginBottom: '0.85rem' }}>
        <span className="prompt">&gt;</span> 🏁 milestones
        <span className="count">— {milestones.length}</span>
        <button type="button" className="right" onClick={add} style={btnLinkCyan}>+ add</button>
      </div>
      {milestones.length === 0 ? (
        <div style={hintMono}>no milestones yet. press <code>+ add</code> to set one.</div>
      ) : (
        <div className="kw-ms">
          {milestones.map((m, i) => (
            <div key={m.id} className="kw-ms-row">
              <button
                type="button"
                className="kw-ms-dot"
                onClick={() => cycle(m)}
                title={`click to cycle status (currently ${m.status})`}
                style={{ background: MS_COLOR[m.status], boxShadow: `0 0 12px ${MS_COLOR[m.status]}`, border: 0, cursor: 'pointer', padding: 0 }}
              >
                {m.status === 'done' && <span style={{ color: 'var(--bg-void)', fontSize: '0.65rem', fontWeight: 700 }}>✓</span>}
              </button>
              {i !== milestones.length - 1 && <div className="kw-ms-line" />}
              <div className="kw-ms-body">
                <div className="kw-ms-head">
                  <span className="kw-ms-name">{m.name}</span>
                  <span className="kw-ms-date">{m.date ?? '—'}</span>
                  <span className="kw-ms-pct" style={{ color: MS_COLOR[m.status] }}>{m.progress}%</span>
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 4 }}
                    title="delete milestone"
                  >×</button>
                </div>
                <div className="pbar thin" style={{ marginTop: 5 }}>
                  <div className="pbar-fill" style={{ width: m.progress + '%', background: MS_COLOR[m.status], boxShadow: `0 0 8px ${MS_COLOR[m.status]}` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Decisions ─────────────────────────────────────────────────────────────

export function KnowledgeDecisionsEditor({ projectId, value: decisions, onChange }: KnowledgeProps<Decision[]>) {
  const dialog = useWorkbenchDialog();

  async function add() {
    const title = await dialog.prompt({
      title: 'decision title',
      label: 'title',
      placeholder: 'Use real object navigation for page transitions',
      confirmLabel: 'next',
    });
    if (!title?.trim()) return;
    const body = await dialog.prompt({
      title: 'decision reason',
      label: 'reason',
      placeholder: 'short rationale, optional',
      confirmLabel: 'add decision',
    }) ?? '';
    await applyKnowledgeMutation(
      'create project decision',
      () => createDecision(projectId, { title: title.trim(), body }),
      onChange,
    );
  }
  async function edit(d: Decision) {
    const title = await dialog.prompt({
      title: 'decision title',
      label: 'title',
      defaultValue: d.title,
      confirmLabel: 'next',
    });
    if (!title?.trim()) return;
    const body = await dialog.prompt({
      title: 'decision reason',
      label: 'reason',
      defaultValue: d.body ?? '',
      confirmLabel: 'save decision',
    }) ?? '';
    await applyKnowledgeMutation(
      'update project decision',
      () => updateDecision(projectId, d.id, { title: title.trim(), body }),
      onChange,
      true,
    );
  }
  async function remove(d: Decision) {
    const ok = await dialog.confirm({
      title: 'delete decision?',
      description: d.title,
      confirmLabel: 'delete',
      tone: 'danger',
    });
    if (!ok) return;
    await applyKnowledgeMutation(
      'delete project decision',
      () => deleteDecision(projectId, d.id),
      onChange,
    );
  }

  return (
    <div className="surface">
      <div className="sec-head" style={{ marginBottom: '0.85rem' }}>
        <span className="prompt">&gt;</span> 📜 decision log
        <span className="count">— {decisions.length}</span>
        <button type="button" className="right" onClick={add} style={btnLinkCyan}>+ add</button>
      </div>
      {decisions.length === 0 ? (
        <div style={hintMono}>no decisions recorded. accept candidates above, or press <code>+ add</code>.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {decisions.map((d) => (
            <div key={d.id} className="kw-dec">
              <div className="kw-dec-head">
                <span className="kw-dec-date">{d.date}</span>
                <span className="kw-dec-title">{d.title}</span>
                <button
                  type="button"
                  onClick={() => edit(d)}
                  style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 'auto' }}
                  title="edit decision"
                >✎</button>
                <button
                  type="button"
                  onClick={() => remove(d)}
                  style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}
                  title="delete decision"
                >×</button>
              </div>
              {d.body && <div className="kw-dec-body">{d.body}</div>}
              {d.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {d.tags.map((t) => <span key={t} className="kw-tag">#{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Lessons ───────────────────────────────────────────────────────────────

export function KnowledgeLessonsEditor({ projectId, value: lessons, onChange }: KnowledgeProps<Lesson[]>) {
  const dialog = useWorkbenchDialog();

  async function add() {
    const title = await dialog.prompt({
      title: 'lesson title',
      label: 'title',
      placeholder: 'what should future sessions remember?',
      confirmLabel: 'next',
    });
    if (!title?.trim()) return;
    const body = await dialog.prompt({
      title: 'lesson details',
      label: 'details',
      multiline: true,
      placeholder: 'context, implication, prevention, or reusable note',
      confirmLabel: 'add lesson',
    }) ?? '';
    await applyKnowledgeMutation(
      'create project lesson',
      () => createLesson({ title: title.trim(), body, projectId }),
      onChange,
    );
  }
  async function edit(l: Lesson) {
    const title = await dialog.prompt({
      title: 'lesson title',
      label: 'title',
      defaultValue: l.title,
      confirmLabel: 'next',
    });
    if (!title?.trim()) return;
    const body = await dialog.prompt({
      title: 'lesson details',
      label: 'details',
      multiline: true,
      defaultValue: l.body ?? '',
      confirmLabel: 'save lesson',
    }) ?? '';
    await applyKnowledgeMutation(
      'update project lesson',
      () => updateLesson(l.id, { title: title.trim(), body }),
      onChange,
      true,
    );
  }
  async function toggleCross(l: Lesson) {
    await applyKnowledgeMutation(
      'update project lesson sharing',
      () => updateLesson(l.id, { cross: !l.cross }),
      onChange,
      true,
    );
  }
  async function remove(l: Lesson) {
    const ok = await dialog.confirm({
      title: 'delete lesson?',
      description: l.title,
      confirmLabel: 'delete',
      tone: 'danger',
    });
    if (!ok) return;
    await applyKnowledgeMutation(
      'delete project lesson',
      () => deleteLesson(l.id),
      onChange,
    );
  }

  return (
    <div className="surface">
      <div className="sec-head" style={{ marginBottom: '0.85rem' }}>
        <span className="prompt">&gt;</span> 💎 lessons
        <span className="count">— {lessons.length}</span>
        <button type="button" className="right" onClick={add} style={btnLinkCyan}>+ add</button>
      </div>
      {lessons.length === 0 ? (
        <div style={hintMono}>no lessons captured. press <code>+ add</code> when you learn something worth keeping.</div>
      ) : (
        <div className="kw-lessons">
          {lessons.map((l) => (
            <div key={l.id} className="kw-lesson">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                <span style={{ color: 'var(--neon-purple)', fontSize: '0.9rem', filter: 'drop-shadow(0 0 8px var(--neon-purple))', flexShrink: 0, marginTop: 2 }}>💎</span>
                <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{l.title}</div>
                <button
                  type="button"
                  onClick={() => toggleCross(l)}
                  title={l.cross ? 'unmark cross-project' : 'mark as cross-project'}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                    color: l.cross ? 'var(--neon-cyan)' : 'var(--text-muted)',
                    background: l.cross ? 'rgba(0,255,242,0.08)' : 'transparent',
                    padding: '1px 6px', borderRadius: 4,
                    border: l.cross ? '1px solid rgba(0,255,242,0.2)' : '1px dashed var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >cross-proj</button>
                <button
                  type="button"
                  onClick={() => edit(l)}
                  style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}
                  title="edit lesson"
                >✎</button>
                <button
                  type="button"
                  onClick={() => remove(l)}
                  style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}
                  title="delete lesson"
                >×</button>
              </div>
              {l.body && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{l.body}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnLinkCyan: React.CSSProperties = {
  background: 'transparent', border: 0, color: 'var(--neon-cyan)',
  fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer',
};

const hintMono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)',
};
