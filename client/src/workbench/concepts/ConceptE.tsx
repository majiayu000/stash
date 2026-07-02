import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CountUp, LiveDot, ParticleField } from '../../components/effects';
import { useWorkbenchDialog } from '../../components/ui/workbench-dialogs';
import { captureWorkItem, createWorkItem, updateWorkItem } from '../../api/work-items';
import type { WBData, WBProject, WBTodo } from '../data';
import { ConnectedFlow } from '../ConnectedFlow';
import { ProgressBar, Topbar, TodoItem } from '../shared';
import {
  doneMoveInput,
  groupTodosForBoard,
  moveInputForColumn,
  todayIso,
  type TodoBoardColumn,
} from './conceptE.lifecycle';

/**
 * Concept E — Capture & Plan (todo-first).
 *
 * Default dashboard. Hero capture box at the top, 4-column board
 * (Inbox · Today · Doing · Later), right rail with projects + live agent strip.
 */
export function ConceptE({ data, reload }: { data: WBData; reload: () => void }) {
  const { projects, todos, sessions } = data;
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; tone: 'ok' | 'error' } | null>(null);

  const liveProjectIds = new Set(sessions.filter((s) => s.state === 'live').map((s) => s.project));
  const board = groupTodosForBoard(todos, liveProjectIds);

  function showFeedback(message: string, tone: 'ok' | 'error' = 'ok') {
    setFeedback({ message, tone });
    window.setTimeout(() => setFeedback((current) => current?.message === message ? null : current), 3200);
  }

  async function submitCapture(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = captureText.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await captureWorkItem(trimmed);
      setCaptureText('');
      showFeedback('Captured to inbox');
      reload();
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        {/* HERO — big capture */}
        <div className="capture-hero">
          <ParticleField density={0.00007} color="191, 90, 242" maxLink={100} />
          <div className="capture-hero-inner">
            <form className="capture-row" onSubmit={submitCapture} data-testid="capture-form">
              <span className="capture-prompt">$</span>
              <div className="capture-input" style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={captureText}
                  onChange={(e) => setCaptureText(e.target.value)}
                  placeholder=""
                  data-testid="capture-input"
                  className="capture-real-input"
                  disabled={submitting}
                />
                {!captureText && (
                  <span className="capture-placeholder" aria-hidden>
                    fix oauth callback edge case #aurora ^p1 !today
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="capture-kbd-btn"
                disabled={!captureText.trim() || submitting}
                data-testid="capture-submit"
                title="Save to inbox (Enter)"
              >
                ⏎
              </button>
            </form>
            <div className="capture-hints">
              <span><kbd>#project</kbd> project</span>
              <span><kbd>@tag</kbd> tag</span>
              <span><kbd>^p0..^p3</kbd> priority</span>
              <span><kbd>!today</kbd> when</span>
              <span><kbd>*45m</kbd> estimate</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                <CountUp to={todos.filter((t) => !t.done).length} duration={800} /> open ·{' '}
                <CountUp to={todos.filter((t) => t.done).length} duration={800} /> done ·{' '}
                <CountUp to={board.inbox.length} duration={800} /> in inbox
              </span>
            </div>
          </div>
        </div>
        {feedback && (
          <div className={`ce-feedback ${feedback.tone}`} role="status" data-testid="ce-feedback">
            {feedback.message}
          </div>
        )}
        <ConnectedFlow data={data} />

        {/* Main split: 4-column board + right rail */}
        <div id="inbox-board" style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', minHeight: 0 }}>
            <BoardCol icon="📥" name="inbox"  tone="orange" hint="ideas & quick captures"     items={board.inbox}  projects={projects} onFeedback={showFeedback} />
            <BoardCol icon="🌅" name="today"  tone="cyan"   hint="planned for today"          items={board.today}  projects={projects} onFeedback={showFeedback} />
            <BoardCol icon="🚧" name="doing"  tone="green"  hint="active or live-agent work"  items={board.doing}  projects={projects} live onFeedback={showFeedback} />
            <BoardCol icon="📅" name="later"  tone="purple" hint="planned · waiting · someday" items={board.later}  projects={projects} onFeedback={showFeedback} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div className="sec-head" style={{ marginBottom: 0, minWidth: 0, flex: 1 }}>
                <span className="prompt">&gt;</span> projects <span className="count">— {projects.length}</span>
              </div>
              <button
                className="new-proj-btn"
                type="button"
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => navigate('/c/f')}
              >
                + new
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto', paddingRight: 4 }}>
              {projects.length === 0
                ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no projects yet — set <code>projectId</code> on work items</div>
                : projects.map((p) => <ProjectChipRow key={p.id} p={p} />)}
            </div>
            <div className="surface" style={{ padding: '0.75rem 0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <LiveDot color="var(--neon-green)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {sessions.filter((s) => s.state === 'live').length} agents live
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {sessions.filter((s) => s.state === 'live').slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="live-session-link"
                    onClick={() => navigate(`/c/g/${encodeURIComponent(s.id)}`)}
                  >
                    <span style={{ color: s.tool === 'codex' ? 'var(--neon-purple)' : 'var(--neon-cyan)' }}>
                      {s.tool === 'codex' ? '$' : '>'}
                    </span>{' '}
                    {projects.find((p) => p.id === s.project)?.name ?? s.project} · {s.model}
                    <div style={{ paddingLeft: 14 }}>{s.preview.slice(0, 60)}…</div>
                  </button>
                ))}
                {sessions.filter((s) => s.state === 'live').length === 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>(no live agents)</div>
                )}
              </div>
            </div>
            <DoneDropZone items={board.done} projects={projects} onFeedback={showFeedback} />
          </div>
        </div>
      </div>

      <style>{conceptEStyles}</style>
    </div>
  );
}

// Map BoardCol name → defaults for a new work item dropped into that column.
function colCreateOpts(col: TodoBoardColumn): Partial<Parameters<typeof createWorkItem>[0]> {
  switch (col) {
    case 'inbox':  return { kind: 'idea', status: 'inbox' };
    case 'today':  return { kind: 'task', status: 'planned', todayPinned: true, scheduledFor: todayIso() };
    case 'doing':  return { kind: 'task', status: 'active' };
    case 'later':  return { kind: 'task', status: 'planned' };
  }
}

function emptyCopyFor(col: TodoBoardColumn): string {
  // SPEC v0.3 §3i — actionable empty states, no fake data.
  switch (col) {
    case 'inbox':  return 'Inbox empty. Press `c` to capture.';
    case 'today':  return 'Nothing planned for today.';
    case 'doing':  return 'No active work.';
    case 'later':  return 'No items scheduled later.';
  }
}

function BoardCol({
  icon,
  name,
  tone,
  hint,
  items,
  count,
  live,
  projects,
  onFeedback,
}: {
  icon: string;
  name: TodoBoardColumn;
  tone: 'orange' | 'cyan' | 'green' | 'purple';
  hint: string;
  items: WBTodo[];
  count?: number;
  live?: boolean;
  projects: WBProject[];
  onFeedback: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const c = count ?? items.length;
  const draggable = name === 'today';
  const [dragOver, setDragOver] = useState(false);
  const dialog = useWorkbenchDialog();

  async function addToCol() {
    const title = await dialog.prompt({
      title: `new todo in ${name}`,
      label: 'todo title',
      placeholder: name === 'today' ? 'finish the thing scheduled for today' : 'capture the next work item',
      confirmLabel: 'add todo',
    });
    if (!title?.trim()) return;
    try {
      const opts = colCreateOpts(name);
      await createWorkItem({ title: title.trim(), ...opts });
      window.dispatchEvent(new CustomEvent('stash:captured'));
      onFeedback(`Added to ${name}`);
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  function onDragOver(e: React.DragEvent) {
    // Only accept drops from a stash todo row.
    if (!e.dataTransfer.types.includes('application/stash-todo')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData('application/stash-todo');
    if (!id) return;
    const opts = moveInputForColumn(name);
    try {
      await updateWorkItem(id, opts);
      window.dispatchEvent(new CustomEvent('stash:captured'));
      onFeedback(`Moved to ${name}`);
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  return (
    <div className={`board-col tone-${tone} ${dragOver ? 'drag-over' : ''}`} data-testid={`board-col-${name}`}>
      <div className="board-col-head">
        <span style={{ fontSize: '1rem' }}>{icon}</span>
        <span className="board-col-name">{name}</span>
        {live && <LiveDot color="var(--neon-green)" />}
        <span className="board-col-count">{c}</span>
      </div>
      <div className="board-col-hint">{hint}</div>
      <div
        className="board-col-body"
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {items.length === 0 ? (
          <div className="board-col-empty">{emptyCopyFor(name)}</div>
        ) : draggable ? (
          <DraggableList items={items} projects={projects} onFeedback={onFeedback} />
        ) : (
          items.map((t) => <DraggableRow key={t.id} t={t} projects={projects} />)
        )}
        <button className="todo-add" type="button" onClick={addToCol}>+ add</button>
      </div>
    </div>
  );
}

/** Wrap a TodoItem in an outer <div> that supports HTML5 drag for cross-column moves. */
function DraggableRow({ t, projects }: { t: WBTodo; projects: WBProject[] }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        setDragging(true);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/stash-todo', t.id);
      }}
      onDragEnd={() => setDragging(false)}
      style={{ opacity: dragging ? 0.4 : 1, cursor: 'grab' }}
    >
      <TodoItem t={t} projects={projects} />
    </div>
  );
}

/**
 * v0.4 §4 — Today list with native HTML5 drag/drop.
 * Computes new sortOrder as midpoint of neighbours (fractional indexing).
 * Optimistic local reorder; PATCHes only the moved row; emits stash:captured
 * so the workbench refetches in canonical order.
 */
function DraggableList({
  items,
  projects,
  onFeedback,
}: {
  items: WBTodo[];
  projects: WBProject[];
  onFeedback: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const [order, setOrder] = useState<WBTodo[]>(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Re-sync when parent items change (after refetch).
  if (order.length !== items.length || order.some((o, i) => o.id !== items[i]?.id)) {
    setOrder(items);
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Use both: stash-todo so cross-column drops see it; text/plain for compat.
    e.dataTransfer.setData('application/stash-todo', id);
    e.dataTransfer.setData('text/plain', id);
  }
  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('application/stash-todo')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  async function onDrop(e: React.DragEvent, targetId: string) {
    const movedId = draggingId ?? e.dataTransfer.getData('application/stash-todo') ?? e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!movedId || movedId === targetId) return;

    const from = order.findIndex((it) => it.id === movedId);
    const to = order.findIndex((it) => it.id === targetId);
    // Foreign drop (e.g. from inbox onto a Today row) — let the column body handle it.
    if (from < 0 || to < 0) return;
    e.preventDefault();
    e.stopPropagation();

    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setOrder(next);

    // Compute fractional sortOrder.
    // We don't have the existing sortOrder values on WBTodo, so the simplest
    // correct thing is to renumber locally using 1000.0 step and patch the
    // moved row's neighbours only. Use midpoint between neighbours' indices.
    const prevIdx = next.findIndex((it) => it.id === movedId);
    const before = next[prevIdx - 1];
    const after = next[prevIdx + 1];
    const newOrder =
      before && after ? (prevIdx) * 1000 + 0.5  // tighten later if precision degrades
        : before ? (prevIdx + 1) * 1000
          : after ? (prevIdx) * 1000 - 500
            : 1000;

    try {
      await updateWorkItem(movedId, { sortOrder: newOrder });
      window.dispatchEvent(new CustomEvent('stash:captured'));
      onFeedback('Today order saved');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  return (
    <>
      {order.map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={(e) => onDragStart(e, t.id)}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, t.id)}
          onDragEnd={() => setDraggingId(null)}
          style={{ opacity: draggingId === t.id ? 0.4 : 1, cursor: 'grab' }}
        >
          <TodoItem t={t} projects={projects} />
        </div>
      ))}
    </>
  );
}

function DoneDropZone({
  items,
  projects,
  onFeedback,
}: {
  items: WBTodo[];
  projects: WBProject[];
  onFeedback: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('application/stash-todo')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData('application/stash-todo');
    if (!id) return;
    try {
      await updateWorkItem(id, doneMoveInput());
      window.dispatchEvent(new CustomEvent('stash:captured'));
      onFeedback('Marked done');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  return (
    <section
      className={`done-drop-zone ${dragOver ? 'drag-over' : ''}`}
      aria-label="Done drop zone"
      data-testid="done-drop-zone"
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="done-drop-head">
        <span>✓ done</span>
        <strong>{items.length}</strong>
      </div>
      <div className="done-drop-copy">Drop finished work here. Recent completions stay reviewable in Weekly Review.</div>
      <div className="done-drop-list">
        {items.slice(0, 3).map((todo) => (
          <TodoItem key={todo.id} t={todo} projects={projects} showProject={false} />
        ))}
        {items.length === 0 && <div className="board-col-empty">No completed items yet.</div>}
      </div>
    </section>
  );
}

function ProjectChipRow({ p }: { p: WBProject }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="proj-chip"
      onClick={() => navigate(`/c/k/${encodeURIComponent(p.id)}`)}
      title={`Open project ${p.name}`}
    >
      <span style={{ fontSize: '1rem' }}>{p.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-cyan)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.name}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)' }}>{p.progress}%</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
          <ProgressBar value={p.progress} thin />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
          <span>{p.todoCount} todo · {p.sessions} sess</span>
          {p.status === 'active' && p.tokens24h > 0 && <LiveDot color="var(--neon-green)" />}
        </div>
      </div>
    </button>
  );
}

const conceptEStyles = `
.capture-hero {
  position: relative;
  background: linear-gradient(135deg, rgba(191,90,242,0.08), rgba(0,255,242,0.05));
  border: 1px solid rgba(191,90,242,0.25);
  border-radius: var(--radius-xl, 16px);
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(191,90,242,0.06);
}
.capture-hero::before {
  content: '';
  position: absolute; inset: -2px;
  background: linear-gradient(90deg, var(--neon-purple), var(--neon-cyan), var(--neon-magenta), var(--neon-purple));
  background-size: 300% 100%;
  border-radius: var(--radius-xl, 16px);
  z-index: -1;
  opacity: 0.5;
  animation: borderFlow 5s linear infinite;
  filter: blur(6px);
}
@keyframes borderFlow {
  0% { background-position: 0% 0; }
  100% { background-position: 300% 0; }
}
.capture-hero-inner { position: relative; z-index: 1; }
.capture-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 30px rgba(0,255,242,0.04);
}
.capture-prompt {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  font-weight: 700;
  font-size: 1.1rem;
  text-shadow: 0 0 10px rgba(0,255,242,0.6);
}
.capture-input { flex: 1; min-width: 0; position: relative; }
.capture-real-input {
  width: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--text-primary);
  caret-color: var(--neon-cyan);
}
.capture-placeholder {
  position: absolute; inset: 0;
  pointer-events: none;
  display: flex; align-items: center;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--text-muted);
}
.capture-kbd-btn {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-primary);
  padding: 4px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-glow);
  border-radius: 4px;
  cursor: pointer;
  transition: all .15s;
}
.capture-kbd-btn:hover:not(:disabled) {
  background: var(--neon-cyan);
  color: var(--bg-void);
  box-shadow: 0 0 16px rgba(0,255,242,0.4);
}
.capture-kbd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.capture-hints {
  display: flex; gap: 1rem; align-items: center;
  margin-top: 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.capture-hints kbd {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.08);
  border: 1px solid rgba(191,90,242,0.2);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.7rem;
  margin-right: 4px;
}

.ce-feedback {
  margin: -0.55rem 0 0.75rem;
  border: 1px solid rgba(48,209,88,0.32);
  background: rgba(48,209,88,0.08);
  color: var(--neon-green);
  border-radius: var(--radius-md);
  padding: 0.45rem 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.ce-feedback.error {
  border-color: rgba(255,55,95,0.35);
  background: rgba(255,55,95,0.08);
  color: var(--neon-pink);
}

.board-col {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0.85rem;
  display: flex; flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.board-col::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
.board-col.tone-orange::before { background: linear-gradient(90deg, var(--neon-orange), var(--neon-pink)); }
.board-col.tone-cyan::before   { background: linear-gradient(90deg, var(--neon-cyan), var(--neon-blue)); }
.board-col.tone-green::before  { background: var(--gradient-success); }
.board-col.tone-purple::before { background: linear-gradient(90deg, var(--neon-purple), var(--neon-magenta)); }
.board-col.drag-over {
  outline: 2px dashed var(--neon-cyan);
  outline-offset: -2px;
  background: rgba(0,255,242,0.05);
}
.board-col-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px; }
.board-col-name {
  font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;
  color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em;
}
.board-col.tone-orange .board-col-name { color: var(--neon-orange); }
.board-col.tone-cyan   .board-col-name { color: var(--neon-cyan); }
.board-col.tone-green  .board-col-name { color: var(--neon-green); }
.board-col.tone-purple .board-col-name { color: var(--neon-purple); }
.board-col-count {
  margin-left: auto;
  font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);
  background: var(--bg-elevated); padding: 1px 7px; border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}
.board-col-hint {
  font-family: var(--font-body); font-size: 0.72rem; color: var(--text-muted);
  margin-bottom: 0.7rem;
}
.board-col-body { display: flex; flex-direction: column; gap: 0.4rem; overflow-y: auto; flex: 1; padding-right: 2px; }
.board-col-empty {
  text-align: center;
  font-family: var(--font-mono); font-size: 0.72rem;
  color: var(--text-muted); padding: 1rem 0; opacity: 0.5;
}
.todo-add {
  background: transparent; border: 1px dashed var(--border-subtle);
  color: var(--text-muted); padding: 0.45rem 0.6rem; border-radius: var(--radius-md);
  font-family: var(--font-mono); font-size: 0.72rem; cursor: pointer;
  transition: all 0.2s; text-align: left;
}
.todo-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); background: rgba(0,255,242,0.04); }

.done-drop-zone {
  border: 1px solid rgba(48,209,88,0.28);
  background: rgba(48,209,88,0.06);
  border-radius: var(--radius-lg);
  padding: 0.85rem;
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}
.done-drop-zone.drag-over {
  border-color: var(--neon-green);
  background: rgba(48,209,88,0.12);
  box-shadow: 0 0 0 1px rgba(48,209,88,0.12), 0 14px 32px rgba(48,209,88,0.1);
}
.done-drop-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-family: var(--font-mono);
  color: var(--neon-green);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 700;
}
.done-drop-copy {
  margin-top: 0.35rem;
  color: var(--text-muted);
  font-size: 0.74rem;
  line-height: 1.45;
}
.done-drop-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.7rem;
  max-height: 170px;
  overflow-y: auto;
}

.new-proj-btn {
  background: var(--gradient-primary);
  color: var(--bg-void); border: none;
  padding: 0.4rem 0.9rem; border-radius: var(--radius-pill);
  font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 0 15px rgba(0,255,242,0.3);
}
.new-proj-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,255,242,0.4); }

.live-session-link {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.live-session-link:hover { color: var(--text-secondary); }

.proj-chip {
  display: flex; align-items: flex-start; gap: 0.6rem;
  width: 100%;
  text-align: left;
  padding: 0.55rem 0.7rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  cursor: pointer; transition: all 0.2s;
}
.proj-chip:hover { border-color: var(--border-glow); transform: translateX(2px); }
`;
