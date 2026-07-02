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
import { conceptEStyles } from './conceptE.styles';

const INSIGHTS_STORAGE_KEY = 'stash:concept-e:insights-open';

type ConceptEBoard = ReturnType<typeof groupTodosForBoard>;

function readInsightsOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INSIGHTS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistInsightsOpen(open: boolean): void {
  try {
    window.localStorage.setItem(INSIGHTS_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Rendering must not depend on storage availability.
  }
}

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
  const [insightsOpen, setInsightsOpen] = useState(readInsightsOpen);

  const liveProjectIds = new Set(sessions.filter((s) => s.state === 'live').map((s) => s.project));
  const board = groupTodosForBoard(todos, liveProjectIds);
  const openTodos = todos.filter((t) => !t.done).length;

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
      <div className="inner concept-e-home">
        <Topbar
          data={data}
          tag={`> ${openTodos} open todos · ${board.inbox.length} inbox · ${board.today.length} today`}
          right={<ConceptETopbarStats board={board} todos={todos} />}
        />

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

        {/* Main split: 4-column board + right rail */}
        <div id="inbox-board" data-testid="concept-e-board-shell" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 270px', gap: '1rem', flex: '1 1 520px', minHeight: 0 }}>
          <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', minHeight: 0 }}>
            <BoardCol icon="📥" name="inbox"  tone="inbox"   hint="ideas & quick captures"      items={board.inbox}  projects={projects} onFeedback={showFeedback} />
            <BoardCol icon="🌅" name="today"  tone="due"     hint="planned for today"           items={board.today}  projects={projects} onFeedback={showFeedback} />
            <BoardCol icon="🚧" name="doing"  tone="active"  hint="active or live-agent work"   items={board.doing}  projects={projects} live onFeedback={showFeedback} />
            <BoardCol icon="📅" name="later"  tone="someday" hint="planned · waiting · someday" items={board.later}  projects={projects} onFeedback={showFeedback} />
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
        <ConceptEInsights
          data={data}
          open={insightsOpen}
          onToggle={(open) => {
            setInsightsOpen(open);
            persistInsightsOpen(open);
          }}
        />
      </div>

      <style>{conceptEStyles}</style>
    </div>
  );
}

function ConceptETopbarStats({ board, todos }: { board: ConceptEBoard; todos: WBTodo[] }) {
  const openTodos = todos.filter((t) => !t.done);
  const urgent = openTodos.filter((t) => t.priority === 'p0' || t.priority === 'p1').length;
  return (
    <div className="ce-topbar-stats topbar-stats" data-testid="topbar-stats">
      <div className="tb-stat">
        <span className="tb-stat-val">{board.inbox.length}</span>
        <span className="tb-stat-label">inbox</span>
      </div>
      <div className="tb-stat">
        <span className="tb-stat-val">{board.today.length}</span>
        <span className="tb-stat-label">today</span>
      </div>
      <div className="tb-stat">
        <span className="tb-stat-val">{urgent}</span>
        <span className="tb-stat-label">p0/p1</span>
      </div>
      <div className="tb-stat">
        <span className="tb-stat-val">{openTodos.length}</span>
        <span className="tb-stat-label">open todos</span>
      </div>
    </div>
  );
}

function ConceptEInsights({
  data,
  open,
  onToggle,
}: {
  data: WBData;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <section className={`ce-insights ${open ? 'open' : ''}`} data-testid="ce-insights">
      <button
        type="button"
        className="ce-insights-summary"
        aria-expanded={open}
        onClick={() => onToggle(!open)}
      >
        <span>work context</span>
        <span>projects · sessions · review · burn</span>
      </button>
      {open && <ConnectedFlow data={data} />}
    </section>
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
  tone: 'inbox' | 'due' | 'active' | 'someday';
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
