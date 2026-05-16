import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Lesson, Priority, WorkItem, WorkItemStatus } from '@stash/shared';
import { apiGet } from '../../api/client';
import { getWorkItem, updateWorkItem } from '../../api/work-items';
import { fmt, type WBData, type WBTodo } from '../data';
import { Topbar } from '../shared';

/**
 * Concept L — Todo Detail / Split / Promote modal.
 * Dimmed backdrop over a faked board; centered modal with header,
 * 2-col body (subtasks/tags/linked sessions/journal · meta+promote+run),
 * footer with archive/delete/split/done.
 *
 * Backend coverage:
 *   - todo metadata: real (WBTodo from /api/work-items)
 *   - sub-tasks:     STUB — Phase 3e adds parent_id to work_items
 *   - journal:       STUB — Phase 3b project notes will cover this
 *   - linked sessions: existing /api/work-items/:id/sessions — wired in Phase 4
 */
export function ConceptL({ data, reload }: { data: WBData; reload: () => void }) {
  const { projects, todos } = data;
  const { projectId: workItemId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();

  // Pick the todo from URL, or default to first idea/inbox, else first todo.
  const todo = workItemId
    ? todos.find((t) => t.id === workItemId)
    : todos.find((t) => t.kind === 'idea' && !t.done) ?? todos.find((t) => !t.done) ?? todos[0];

  if (!todo) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            no todos to inspect — capture one from Concept E first
          </div>
        </div>
      </div>
    );
  }

  const proj = projects.find((p) => p.id === todo.project);

  // SPEC v0.3 §3e — real sub-tasks from /api/work-items/:id/subtasks.
  const [realSubs, setRealSubs] = useState<WorkItem[] | null>(null);
  // SPEC v0.3 §3h — relevant lessons surfaced by tag/project overlap.
  const [lessons, setLessons] = useState<Lesson[]>([]);
  // v0.4 — full work item loaded for editing.
  const [item, setItem] = useState<WorkItem | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getWorkItem(todo.id)
      .then((w) => { if (!cancelled) setItem(w); })
      .catch(() => {});

    apiGet<{ data: WorkItem[] }>(`/work-items/${todo.id}/subtasks`)
      .then((res) => { if (!cancelled) setRealSubs(res.data); })
      .catch(() => { if (!cancelled) setRealSubs([]); });

    const params = new URLSearchParams();
    if (todo.project) params.set('projectId', todo.project);
    todo.tags.forEach((t) => params.append('label', t.replace(/^#/, '')));
    params.set('limit', '3');
    apiGet<{ data: Lesson[] }>(`/lessons/relevant?${params.toString()}`)
      .then((res) => { if (!cancelled) setLessons(res.data); })
      .catch(() => { if (!cancelled) setLessons([]); });

    return () => { cancelled = true; };
  }, [todo.id]);

  async function save<K extends 'title' | 'description' | 'priority' | 'status' | 'dueAt' | 'projectId' | 'areaId' | 'labels'>(field: K, value: WorkItem[K]) {
    if (!item) return;
    if (item[field] === value) return;
    const optimistic = { ...item, [field]: value };
    setItem(optimistic);
    try {
      const updated = await updateWorkItem(item.id, { [field]: value } as Record<string, unknown>);
      setItem(updated);
      flashSaved('saved');
      reload();
    } catch (e) {
      setItem(item); // revert
      flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function flashSaved(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 1400);
  }

  // Stub fallback only when real subtasks aren't loaded yet, for visual continuity.
  const stubSubs = stubSubTasks(todo);
  const showStub = realSubs === null;
  const subs = showStub ? stubSubs : [];
  const doneSubs = subs.filter((s) => s.done).length;

  // Stub linked sessions — Phase 4 swaps with /api/work-items/:id/sessions
  const linked = stubLinkedSessions(todo);
  // Stub journal — Phase 3b notes / lessons
  const journal = stubJournal(todo);

  return (
    <div className="dashboard-canvas" style={{ position: 'relative' }}>
      {/* Dimmed backdrop preview */}
      <div className="inner" style={{ overflow: 'hidden', height: '100%', filter: 'blur(2px) brightness(0.5)', pointerEvents: 'none' }}>
        <Topbar data={data} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', marginBottom: '1rem' }}>
          {['📥', '🌅', '🚧', '📅'].map((e, i) => (
            <div key={i} className="board-col tone-purple" style={{ height: 200 }}>
              <div className="board-col-head"><span style={{ fontSize: '1rem' }}>{e}</span><span className="board-col-name">col</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <div className="td-overlay">
        <div className="td-modal">
          {/* Header */}
          <div className="td-modal-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--neon-purple)', background: 'rgba(191,90,242,0.1)', padding: '2px 7px', borderRadius: 'var(--radius-pill)', border: '1px solid rgba(191,90,242,0.25)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {todo.kind === 'idea' ? '💡 idea' : '✓ task'} {proj ? `· #${proj.name}` : '· from inbox'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {item?.status === 'done' ? 'completed · ' : ''}priority:
                {(['p0', 'p1', 'p2', 'p3'] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => save('priority', p)}
                    disabled={!item}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.66rem', padding: '1px 6px', borderRadius: 4,
                      cursor: item ? 'pointer' : 'default',
                      background: item?.priority === p ? 'rgba(0,255,242,0.15)' : 'transparent',
                      border: `1px solid ${item?.priority === p ? 'var(--neon-cyan)' : 'var(--border-hair)'}`,
                      color: item?.priority === p ? 'var(--neon-cyan)' : 'var(--text-muted)',
                    }}
                  >{p}</button>
                ))}
              </span>
              <button className="td-close" style={{ marginLeft: 'auto' }} type="button" onClick={() => navigate(-1)}>✕</button>
            </div>
            <EditableTitle
              key={`title-${todo.id}`}
              value={item?.title ?? todo.text}
              disabled={!item}
              onCommit={(v) => save('title', v)}
            />
            <EditableDescription
              key={`desc-${todo.id}`}
              value={item?.description ?? ''}
              disabled={!item}
              placeholder={proj ? `notes for #${proj.name} — markdown, autosaves on blur` : 'add notes — markdown, autosaves on blur'}
              onCommit={(v) => save('description', v || undefined)}
            />
            {savedFlash && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--neon-green)', marginTop: 4 }}>
                {savedFlash}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="td-modal-body">
            <div className="td-modal-main">
              <div className="td-section">
                <div className="td-section-label">
                  <span>sub-tasks{showStub && ' '}{showStub && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(loading…)</span>}</span>
                  {showStub
                    ? <span style={{ color: 'var(--neon-green)' }}>{doneSubs}/{subs.length}</span>
                    : <span style={{ color: 'var(--neon-green)' }}>{(realSubs ?? []).filter((s) => s.status === 'done').length}/{(realSubs ?? []).length}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {showStub
                    ? subs.map((s, i) => <SubTask key={i} done={s.done} text={s.text} />)
                    : (realSubs ?? []).length === 0
                      ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no sub-tasks. break the work down to keep your context fresh next session.</div>
                      : (realSubs ?? []).map((s) => <SubTask key={s.id} done={s.status === 'done'} text={s.title} />)}
                  <button className="td-subtask-add" type="button">+ add sub-task</button>
                </div>
              </div>

              {lessons.length > 0 && (
                <div className="td-section">
                  <div className="td-section-label">
                    <span>💎 lessons that might apply</span>
                    <span style={{ color: 'var(--text-muted)' }}>matched by tag / project</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lessons.map((l) => (
                      <div key={l.id} className="td-lesson">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ color: 'var(--neon-purple)', filter: 'drop-shadow(0 0 6px var(--neon-purple))' }}>💎</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600 }}>{l.title}</span>
                          {l.cross && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--neon-cyan)', background: 'rgba(0,255,242,0.08)', padding: '1px 6px', borderRadius: 4, marginLeft: 'auto' }}>cross-proj</span>}
                        </div>
                        {l.body && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{l.body}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="td-section">
                <div className="td-section-label">tags</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {todo.tags.length === 0
                    ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>(no tags)</span>
                    : todo.tags.map((t) => <span key={t} className="td-tag">{t}</span>)}
                  <span className="td-tag td-tag-add">+ add</span>
                </div>
              </div>

              <div className="td-section">
                <div className="td-section-label">
                  <span>linked sessions <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(stub)</span></span>
                  <span style={{ color: 'var(--text-muted)' }}>auto-discovered</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linked.length === 0
                    ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none</div>
                    : linked.map((l) => <LinkedSession key={l.id} {...l} />)}
                </div>
              </div>

              <div className="td-section">
                <div className="td-section-label">
                  <span>journal · scratch</span>
                  <span style={{ color: 'var(--text-muted)' }}>markdown</span>
                </div>
                <div className="td-journal">
                  {journal.map((j, i) => (
                    <div key={i} className="td-journal-entry">
                      <span className="td-journal-date">{j.date}</span>
                      {j.body}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Meta column */}
            <div className="td-modal-meta">
              <div className="td-promote">
                <div className="td-section-label" style={{ color: 'var(--neon-purple)' }}>💎 promote this {todo.kind}</div>
                <PromoteBtn icon="🌌" title="into a feature" sub="attach to existing project" />
                <PromoteBtn icon="📁" title="into a new project" sub={`scaffold "${slugify(todo.text)}"`} />
                <PromoteBtn icon="📑" title="into a lesson" sub="save as cross-project knowledge" />
              </div>

              <div className="td-meta-block">
                <div className="td-section-label">properties</div>
                <MetaRow k="project" v={proj ? <span style={{ color: 'var(--neon-cyan)' }}>#{proj.name}</span> : <span style={{ color: 'var(--neon-orange)' }}>#inbox</span>} editable />
                <MetaRow k="priority" v={<span className={`todo-prio ${todo.priority}`} style={{ margin: 0 }}>· {todo.priority}</span>} editable />
                <MetaRow k="due" v={todo.due ?? 'none'} editable />
                <MetaRow k="kind" v={<span style={{ color: todo.kind === 'idea' ? 'var(--neon-purple)' : 'var(--neon-cyan)' }}>{todo.kind === 'idea' ? '💡 idea' : '✓ task'}</span>} editable />
                <MetaRow k="id" v={todo.id.slice(0, 12) + '…'} />
              </div>

              <div className="td-run">
                <div className="td-section-label" style={{ color: 'var(--neon-cyan)' }}>▶ run with</div>
                <button className="td-run-btn" type="button">
                  <span style={{ fontSize: '1.05rem' }}>🤖</span>
                  <span>claude code · sonnet-4.5</span>
                  <span className="td-run-kbd">⌘↵</span>
                </button>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5, padding: '0.5rem' }}>
                  opens Concept O (dispatcher) with this todo as the prompt + linked sessions as context.
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="td-modal-foot">
            <button
              className="np-btn ghost"
              type="button"
              disabled={!item || item.status === 'dropped'}
              onClick={() => { void save('status', 'dropped' as WorkItemStatus); }}
              data-testid="td-drop"
            >drop</button>
            <span style={{ flex: 1 }} />
            <button
              className="np-btn primary"
              type="button"
              disabled={!item}
              onClick={() => { void save('status', item?.status === 'done' ? ('planned' as WorkItemStatus) : ('done' as WorkItemStatus)); }}
              data-testid="td-done"
            >{item?.status === 'done' ? '↶ reopen' : '✓ mark done'}</button>
          </div>
        </div>
      </div>

      <style>{conceptLStyles}</style>
    </div>
  );
}

function EditableTitle({ value, disabled, onCommit }: { value: string; disabled?: boolean; onCommit: (next: string) => void | Promise<void> }) {
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

function EditableDescription({ value, disabled, placeholder, onCommit }: { value: string; disabled?: boolean; placeholder?: string; onCommit: (next: string) => void | Promise<void> }) {
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

function SubTask({ done, text }: { done?: boolean; text: string }) {
  return (
    <div className={`td-sub ${done ? 'done' : ''}`}>
      <span className="td-sub-check">{done ? '✓' : ''}</span>
      <span className="td-sub-text">{text}</span>
    </div>
  );
}

function LinkedSession({ id, who, title, at }: { id: string; who: string; title: string; at: string }) {
  return (
    <div className="td-linked-sess">
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--neon-cyan)', fontWeight: 600 }}>{id}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)' }}>{who} · {at}</div>
      </div>
      <span style={{ color: 'var(--neon-cyan)', cursor: 'pointer' }}>↗</span>
    </div>
  );
}

function MetaRow({ k, v, editable }: { k: string; v: ReactNode; editable?: boolean }) {
  return (
    <div className="td-meta-row">
      <span className="td-meta-k">{k}</span>
      <span className="td-meta-v">{v}</span>
      {editable && <span className="td-meta-edit">✎</span>}
    </div>
  );
}

function PromoteBtn({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <button className="td-promote-btn" type="button">
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div className="td-promote-title">{title}</div>
        <div className="td-promote-sub">{sub}</div>
      </div>
      <span className="td-promote-chev">›</span>
    </button>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'untitled';
}

function stubSubTasks(t: WBTodo): { done: boolean; text: string }[] {
  // 3-5 sub-tasks derived from title hash so output is stable per todo.
  const base = [
    'sketch the smallest viable version',
    'list the unknowns first',
    'pick the riskiest assumption + test it',
    'wire the smallest end-to-end path',
    'decide cut points (what to defer)',
  ];
  const n = 3 + (hash(t.id) % 3);
  return base.slice(0, n).map((text, i) => ({ done: i < Math.min(2, n - 1), text }));
}

function stubLinkedSessions(t: WBTodo): { id: string; who: string; title: string; at: string }[] {
  if (!t.project) return [];
  return [
    { id: 's4', who: t.project + ' · sonnet-4.5', title: 'recent edit related to this todo', at: fmt.ago(Date.now() - 1000 * 60 * 42) },
    { id: 's8', who: t.project + ' · codex-1',    title: 'investigation pass for the same area', at: fmt.ago(Date.now() - 1000 * 60 * 60 * 4) },
  ];
}

function stubJournal(t: WBTodo): { date: string; body: ReactNode }[] {
  return [
    { date: 'today', body: <>captured from {t.kind === 'idea' ? 'the inbox' : 'the board'}. priority sits at <code className="md-code">{t.priority}</code> — revisit when scope is clearer.</> },
    { date: '−2d',   body: <>noted that this overlaps with the active workboard cycle; tagged for next refinement pass.</> },
  ];
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const conceptLStyles = `
.td-overlay {
  position: absolute; inset: 0;
  background: rgba(5,5,8,0.6);
  backdrop-filter: blur(8px);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 2rem;
  z-index: 10;
}
.td-modal {
  width: min(900px, 100%);
  max-height: calc(100% - 2rem);
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl, 16px);
  box-shadow: var(--shadow-deep, 0 25px 50px rgba(0,0,0,0.6)), 0 0 50px rgba(191,90,242,0.15), inset 0 1px 0 rgba(255,255,255,0.06);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.3s var(--ease-smooth, ease);
}
.td-modal-head {
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
}
.td-close {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  width: 28px; height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.td-close:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.td-modal-title {
  width: 100%;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  padding: 0;
  outline: none;
  text-shadow: 0 0 18px rgba(255,255,255,0.1);
}
.td-modal-title:focus { color: var(--neon-cyan); }
.td-modal-desc {
  width: 100%;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.85rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
  resize: none;
  outline: none;
  min-height: 100px;
  margin-top: 0.4rem;
}

.td-modal-body {
  display: grid;
  grid-template-columns: 1fr 280px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.td-modal-main {
  overflow-y: auto;
  padding: 1.1rem 1.25rem;
  display: flex; flex-direction: column; gap: 1.1rem;
  border-right: 1px solid var(--border-subtle);
}
.td-modal-meta {
  overflow-y: auto;
  padding: 1.1rem 1.1rem;
  display: flex; flex-direction: column; gap: 1rem;
}

.td-section { display: flex; flex-direction: column; gap: 0.5rem; }
.td-section-label {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  display: flex; justify-content: space-between;
}

.td-sub {
  display: flex; align-items: flex-start; gap: 0.55rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.td-sub:hover { border-color: var(--border-glow); }
.td-sub-check {
  width: 16px; height: 16px;
  border: 1.5px solid var(--text-muted);
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 10px;
  display: flex; align-items: center; justify-content: center;
  color: var(--bg-void);
  font-weight: 700;
}
.td-sub.done .td-sub-check {
  background: var(--gradient-success);
  border-color: transparent;
}
.td-sub-text {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-primary);
  line-height: 1.4;
}
.td-sub.done .td-sub-text { color: var(--text-muted); text-decoration: line-through; }
.td-subtask-add {
  background: transparent;
  border: 1px dashed var(--border-subtle);
  color: var(--text-muted);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast, 0.2s);
}
.td-subtask-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

.td-tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgba(191,90,242,0.08);
  color: var(--neon-purple);
  border: 1px solid rgba(191,90,242,0.2);
  cursor: pointer;
}
.td-tag-add { background: transparent; color: var(--text-muted); border-style: dashed; border-color: var(--border-subtle); }
.td-lesson { padding: 0.55rem 0.7rem; background: rgba(191,90,242,0.04); border: 1px solid rgba(191,90,242,0.18); border-radius: var(--radius-md); }

.td-linked-sess {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  background: rgba(0,255,242,0.03);
  border: 1px solid rgba(0,255,242,0.15);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.td-linked-sess:hover { border-color: var(--border-glow); }

.td-journal { display: flex; flex-direction: column; gap: 0.4rem; }
.td-journal-entry {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 0.55rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-purple);
  border-radius: var(--radius-sm);
}
.td-journal-date {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--neon-purple);
  margin-right: 0.6rem;
  font-weight: 600;
}

.td-promote, .td-meta-block, .td-run {
  display: flex; flex-direction: column; gap: 0.4rem;
  padding: 0.85rem 0.9rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.td-promote-btn {
  display: flex; align-items: center; gap: 0.55rem;
  width: 100%;
  padding: 0.55rem 0.7rem;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  text-align: left;
}
.td-promote-btn:hover {
  border-color: var(--border-glow);
  background: rgba(0,255,242,0.05);
  transform: translateX(2px);
}
.td-promote-title { font-family: var(--font-mono); font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }
.td-promote-sub { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); margin-top: 1px; }
.td-promote-chev { font-family: var(--font-mono); font-size: 0.9rem; color: var(--text-muted); }
.td-promote-btn:hover .td-promote-chev { color: var(--neon-cyan); }

.td-meta-row {
  display: grid; grid-template-columns: 75px 1fr auto;
  gap: 0.5rem; align-items: center;
  padding: 0.35rem 0;
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.td-meta-k { color: var(--text-muted); text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em; }
.td-meta-v { color: var(--text-primary); }
.td-meta-edit { color: var(--text-muted); cursor: pointer; opacity: 0.4; }
.td-meta-row:hover .td-meta-edit { opacity: 1; }

.td-run-btn {
  display: flex; align-items: center; gap: 0.55rem;
  width: 100%;
  padding: 0.7rem 0.85rem;
  background: var(--gradient-primary);
  color: var(--bg-void);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 0 20px rgba(0,255,242,0.3);
  transition: all var(--transition-fast, 0.2s);
}
.td-run-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 30px rgba(0,255,242,0.45); }
.td-run-kbd {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  background: rgba(0,0,0,0.2);
  padding: 1px 6px;
  border-radius: 3px;
}

.td-modal-foot {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--border-subtle);
  background: rgba(0,0,0,0.15);
}
.np-btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  border: 1px solid var(--border-subtle);
}
.np-btn.ghost { background: transparent; color: var(--text-secondary); }
.np-btn.ghost:hover { border-color: var(--border-glow); color: var(--neon-cyan); }
.np-btn.ghost.danger:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.np-btn.primary {
  background: var(--gradient-primary);
  color: var(--bg-void);
  border-color: transparent;
  font-weight: 700;
  box-shadow: 0 0 18px rgba(0,255,242,0.3);
}
.np-btn.primary:hover { transform: translateY(-1px); box-shadow: 0 4px 24px rgba(0,255,242,0.45); }
`;
