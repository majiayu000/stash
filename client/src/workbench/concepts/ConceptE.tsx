import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { type UpdateWorkItemInput } from '@stash/shared';
import { CountUp, LiveDot, ParticleField } from '../../components/effects';
import { captureWorkItem, createWorkItem, updateWorkItem } from '../../api/work-items';
import type { WBData, WBProject, WBTodo } from '../data';
import { Topbar, TodoItem } from '../shared';
import { useWorkbenchFeedback } from '../WorkbenchFeedback';
import { DoneDropZone, invalidMoveMessage, isStatusMoveAllowed, type ToastAction, type ToastTone } from './conceptE.dnd';
import { conceptEDragStyles } from './conceptE.drag.styles';
import {
  DoneReviewPanel,
  TodoCommandRail,
  TodoInspector,
  buildSuggestions,
  todayIso,
  todoCommandStyles,
  viewTitle,
  type TodoViewId,
} from './conceptE.command';
import { TodoListSurface, todoListStyles, type TodoListGroup } from './conceptE.list';

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
  const [draggingTodo, setDraggingTodo] = useState<WBTodo | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [view, setView] = useState<TodoViewId>('command');
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Column membership is keyed on real WorkItem status / todayPinned, not on
  // project-presence. A captured "buy milk" with no project still moves to
  // today when you drag it onto the today column.
  //
  // inbox:  status === 'inbox' (newly captured, untriaged)
  // today:  todayPinned OR scheduledFor === today (and not inbox/active/done)
  // doing:  status === 'active'
  // later:  everything else still open
  const isTodayBucket = (t: WBTodo) => (t.todayPinned || t.due === 'today') && t.status !== 'inbox' && t.status !== 'active' && !t.done;
  const inbox = todos.filter((t) => t.status === 'inbox' && !t.done);
  const doing = todos.filter((t) => t.status === 'active' && !t.done);
  const waiting = todos.filter((t) => (t.status === 'waiting' || t.status === 'blocked') && !t.done);
  const today = sortByManualOrder(todos.filter(isTodayBucket));
  const later = todos.filter((t) =>
    t.status !== 'inbox'
    && t.status !== 'active'
    && t.status !== 'waiting'
    && t.status !== 'blocked'
    && !t.done
    && !isTodayBucket(t)
  );
  const done = todos.filter((t) => t.done).sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const doneToday = done.filter((t) => (t.completedAt ?? t.updatedAt).slice(0, 10) === todayIso());
  const suggestions = buildSuggestions({ inbox, today, doing, waiting, later });
  const selectedTodo = todos.find((t) => t.id === selectedTodoId)
    ?? doing[0]
    ?? today[0]
    ?? inbox[0]
    ?? waiting[0]
    ?? later[0]
    ?? done[0]
    ?? null;

  useEffect(() => {
    if (selectedTodoId && todos.some((todo) => todo.id === selectedTodoId)) return;
    setSelectedTodoId(selectedTodo?.id ?? null);
  }, [selectedTodoId, selectedTodo?.id, todos]);

  const columns = [
    { id: 'inbox' as const, icon: '📥', name: 'inbox', tone: 'orange' as const, hint: 'quick captures to clarify', items: inbox },
    { id: 'today' as const, icon: '🌅', name: 'today', tone: 'cyan' as const, hint: 'planned and pinned now', items: today },
    { id: 'active' as const, icon: '▶', name: 'doing', tone: 'green' as const, hint: 'in execution right now', items: doing, live: true },
    { id: 'waiting' as const, icon: '⏸', name: 'blocked', tone: 'pink' as const, hint: 'waiting or blocked', items: waiting },
    { id: 'later' as const, icon: '📅', name: 'later', tone: 'purple' as const, hint: 'scheduled later or someday', items: later },
  ];
  const visibleColumns = view === 'command'
    ? columns
    : columns.filter((col) => col.id === view);
  const listGroups: TodoListGroup[] = [
    { id: 'active', title: '进行中', subtitle: '已经开始处理的任务', tone: 'green', items: doing, empty: '暂无进行中的任务。' },
    { id: 'today', title: '今天', subtitle: '今天要推进的任务', tone: 'cyan', items: today, empty: '今天还没有安排任务。' },
    { id: 'inbox', title: '收件箱', subtitle: '需要判断归类的新事项', tone: 'orange', items: inbox, empty: '收件箱为空，可以从上方捕获新任务。' },
    { id: 'blocked', title: '阻塞', subtitle: '等待外部条件的任务', tone: 'pink', items: waiting, empty: '暂无阻塞或等待中的任务。' },
    { id: 'later', title: '稍后', subtitle: '以后再处理的任务', tone: 'purple', items: later, empty: '暂无稍后处理的任务。' },
  ];

  async function submitCapture(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = captureText.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await captureWorkItem(trimmed);
      setCaptureText('');
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function flash(message: string, tone: ToastTone = 'info', action?: ToastAction) {
    setToast({ message, tone, action });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 8000 : 2400);
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
              </div>
              <button
                type="submit"
                className="capture-submit-btn"
                disabled={!captureText.trim() || submitting}
                data-testid="capture-submit"
                title="Save to inbox"
              >
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </form>
            <div className="capture-hints">
              <span><code>#project</code> project</span>
              <span><code>@tag</code> label</span>
              <span><code>^p1</code> priority</span>
              <span><code>!today</code> schedule</span>
              <span><code>*45m</code> estimate</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                <CountUp to={todos.filter((t) => !t.done).length} duration={800} /> open ·{' '}
                <CountUp to={todos.filter((t) => t.done).length} duration={800} /> done ·{' '}
                <CountUp to={inbox.length} duration={800} /> in inbox
              </span>
            </div>
          </div>
        </div>

        <div className="todo-command-shell">
          <TodoCommandRail
            view={view}
            counts={{
              inbox: inbox.length,
              today: today.length,
              active: doing.length,
              waiting: waiting.length,
              later: later.length,
              doneToday: doneToday.length,
            }}
            suggestions={suggestions}
            allTodos={todos}
            draggingTodo={draggingTodo}
            onViewChange={setView}
            onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
            onDragEnd={() => setDraggingTodo(null)}
            onFlash={flash}
          />

          <main className="todo-flow-panel" data-testid="todo-flow-panel">
            <div className="flow-panel-head">
              <div>
                <span className="todo-rail-kicker">{view === 'command' ? 'work flow' : view}</span>
                <h2>{view === 'command' ? '捕获、判断、执行' : viewTitle(view)}</h2>
              </div>
              <button type="button" className="flow-panel-link" onClick={() => navigate('/done')}>
                完成归档
              </button>
            </div>

            {view === 'done' ? (
              <DoneReviewPanel
                doneToday={doneToday}
                doneOlder={done}
                onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
                onOpenDone={() => navigate('/done')}
              />
            ) : view === 'command' ? (
              <>
                <DoneDropZone
                  active={draggingTodo !== null}
                  allTodos={todos}
                  draggingTodo={draggingTodo}
                  onDragEnd={() => setDraggingTodo(null)}
                  onFlash={flash}
                />
                <TodoListSurface
                  groups={listGroups}
                  projects={projects}
                  selectedTodoId={selectedTodo?.id ?? null}
                  onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
                  onDragStart={setDraggingTodo}
                  onDragEnd={() => setDraggingTodo(null)}
                  onFlash={flash}
                  onUpdated={reload}
                />
              </>
            ) : (
              <>
                <div
                  className={`todo-lane-grid ${visibleColumns.length === 1 ? 'focused' : ''}`}
                  style={{ '--lane-count': visibleColumns.length } as CSSProperties}
                >
                  {visibleColumns.map((col) => (
                    <BoardCol
                      key={col.id}
                      icon={col.icon}
                      name={col.name}
                      tone={col.tone}
                      hint={col.hint}
                      items={col.items}
                      projects={projects}
                      allTodos={todos}
                      draggingTodo={draggingTodo}
                      selectedTodoId={selectedTodo?.id ?? null}
                      onSelectTodo={(todo: WBTodo) => setSelectedTodoId(todo.id)}
                      onDragStart={setDraggingTodo}
                      onDragEnd={() => setDraggingTodo(null)}
                      onFlash={flash}
                      live={col.live}
                    />
                  ))}
                </div>
                <DoneDropZone
                  active={draggingTodo !== null}
                  allTodos={todos}
                  draggingTodo={draggingTodo}
                  onDragEnd={() => setDraggingTodo(null)}
                  onFlash={flash}
                />
              </>
            )}
          </main>

          <TodoInspector
            todo={selectedTodo}
            projects={projects}
            sessions={sessions}
            onFlash={flash}
            onUpdated={reload}
          />
        </div>
      </div>
      {toast && (
        <div className={`ce-toast ${toast.tone}`} role="status" data-testid="ce-toast">
          <span>{toast.message}</span>
          {toast.action && (
            <button type="button" onClick={() => { void toast.action?.run(); }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      <style>{conceptEStyles}</style>
      <style>{conceptEDragStyles}</style>
      <style>{todoCommandStyles}</style>
      <style>{todoListStyles}</style>
    </div>
  );
}

interface ToastState {
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

// Map BoardCol name → defaults for a new work item dropped into that column.
function colCreateOpts(col: string): Partial<Parameters<typeof createWorkItem>[0]> {
  switch (col) {
    case 'inbox':  return { kind: 'idea', status: 'inbox' };
    case 'today':  return { kind: 'task', status: 'planned', todayPinned: true, scheduledFor: new Date().toISOString().slice(0, 10) };
    case 'doing':  return { kind: 'task', status: 'active' };
    case 'blocked': return { kind: 'task', status: 'blocked' };
    case 'later':  return { kind: 'task', status: 'planned' };
    default:       return { kind: 'task', status: 'inbox' };
  }
}

function emptyCopyFor(col: string): string {
  // SPEC v0.3 §3i — actionable empty states, no fake data.
  switch (col) {
    case 'inbox':  return '收件箱为空，可以从上方捕获新任务。';
    case 'today':  return '今天还没有安排任务。';
    case 'doing':  return '暂无进行中的任务。';
    case 'blocked': return '暂无阻塞或等待中的任务。';
    case 'later':  return '暂无稍后处理的任务。';
    default:       return '— empty —';
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
  allTodos,
  draggingTodo,
  selectedTodoId,
  onSelectTodo,
  onDragStart,
  onDragEnd,
  onFlash,
}: {
  icon: string;
  name: string;
  tone: 'orange' | 'cyan' | 'green' | 'purple' | 'pink';
  hint: string;
  items: WBTodo[];
  count?: number;
  live?: boolean;
  projects: WBProject[];
  allTodos: WBTodo[];
  draggingTodo: WBTodo | null;
  selectedTodoId: string | null;
  onSelectTodo: (todo: WBTodo) => void;
  onDragStart: (todo: WBTodo) => void;
  onDragEnd: () => void;
  onFlash: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}) {
  const c = count ?? items.length;
  const draggable = name === 'today';
  const [dragOver, setDragOver] = useState(false);
  const feedback = useWorkbenchFeedback();
  const target = colMoveOpts(name).status;
  const invalidTarget = Boolean(draggingTodo && target && !isStatusMoveAllowed(draggingTodo.status, target));

  async function addToCol() {
    const title = await feedback.prompt({
      title: `New todo in ${name}`,
      placeholder: 'Todo title',
    });
    if (!title?.trim()) return;
    try {
      const opts = colCreateOpts(name);
      await createWorkItem({ title: title.trim(), ...opts });
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) { onFlash(e instanceof Error ? e.message : String(e), 'error'); }
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
    const todo = allTodos.find((t) => t.id === id);
    if (!todo) return;
    const opts = colMoveOpts(name);
    const invalid = invalidMoveMessage(todo, opts.status);
    if (invalid) {
      onFlash(invalid, 'error');
      return;
    }
    try {
      await updateWorkItem(id, opts);
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (err) { onFlash(err instanceof Error ? err.message : String(err), 'error'); }
  }

  return (
    <div className={`board-col tone-${tone} ${dragOver ? 'drag-over' : ''} ${dragOver && invalidTarget ? 'invalid-over' : ''}`} data-testid={`board-col-${name}`}>
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
          <DraggableList items={items} projects={projects} selectedTodoId={selectedTodoId} onSelectTodo={onSelectTodo} onDragStart={onDragStart} onDragEnd={onDragEnd} onFlash={onFlash} />
        ) : (
          items.map((t) => <DraggableRow key={t.id} t={t} projects={projects} selectedTodoId={selectedTodoId} onSelectTodo={onSelectTodo} onDragStart={onDragStart} onDragEnd={onDragEnd} />)
        )}
        <button className="todo-add" type="button" onClick={addToCol}>+ add</button>
      </div>
    </div>
  );
}

/**
 * Map a target column → the status/pin transition to apply when a row is
 * dropped on it. Mirror of colCreateOpts but for existing items.
 */
function colMoveOpts(col: string): UpdateWorkItemInput {
  switch (col) {
    case 'inbox':  return { status: 'inbox',   todayPinned: false };
    case 'today':  return { status: 'planned', todayPinned: true, scheduledFor: new Date().toISOString().slice(0, 10) };
    case 'doing':  return { status: 'active',  todayPinned: false };
    case 'blocked': return { status: 'blocked', todayPinned: false };
    case 'later':  return { status: 'planned', todayPinned: false, scheduledFor: null };
    default:       return {};
  }
}

function sortByManualOrder(items: WBTodo[]): WBTodo[] {
  return items
    .map((item, index) => ({ item, order: item.sortOrder ?? (index + 1) * 1000 }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.item.text.localeCompare(b.item.text);
    })
    .map(({ item }) => item);
}

/** Wrap a TodoItem in an outer <div> that supports HTML5 drag for cross-column moves. */
function DraggableRow({ t, projects, selectedTodoId, onSelectTodo, onDragStart, onDragEnd }: {
  t: WBTodo;
  projects: WBProject[];
  selectedTodoId: string | null;
  onSelectTodo: (todo: WBTodo) => void;
  onDragStart: (todo: WBTodo) => void;
  onDragEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        setDragging(true);
        onDragStart(t);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/stash-todo', t.id);
      }}
      onDragEnd={() => { setDragging(false); onDragEnd(); }}
      className={`todo-row-shell ${selectedTodoId === t.id ? 'selected' : ''}`}
      style={{ opacity: dragging ? 0.4 : 1, cursor: 'grab' }}
    >
      <TodoItem t={t} projects={projects} onOpen={onSelectTodo} />
    </div>
  );
}

/**
 * v0.4 §4 — Today list with native HTML5 drag/drop.
 * Computes new sortOrder as midpoint of neighbours (fractional indexing).
 * Optimistic local reorder; PATCHes only the moved row; emits stash:captured
 * so the workbench refetches in canonical order.
 */
function DraggableList({ items, projects, selectedTodoId, onSelectTodo, onDragStart: onExternalDragStart, onDragEnd, onFlash }: {
  items: WBTodo[];
  projects: WBProject[];
  selectedTodoId: string | null;
  onSelectTodo: (todo: WBTodo) => void;
  onDragStart: (todo: WBTodo) => void;
  onDragEnd: () => void;
  onFlash: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}) {
  const [order, setOrder] = useState<WBTodo[]>(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Re-sync when parent items change (after refetch).
  if (order.length !== items.length || order.some((o, i) => o.id !== items[i]?.id)) {
    setOrder(items);
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    const todo = items.find((it) => it.id === id);
    if (todo) onExternalDragStart(todo);
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

    // Compute a fractional order between the new neighbours. Items without a
    // persisted order get a stable local fallback so the first drag seeds order.
    const prevIdx = next.findIndex((it) => it.id === movedId);
    const before = next[prevIdx - 1];
    const after = next[prevIdx + 1];
    const fallbackOrder = (idx: number) => (idx + 1) * 1000;
    const beforeOrder = before ? (before.sortOrder ?? fallbackOrder(prevIdx - 1)) : undefined;
    const afterOrder = after ? (after.sortOrder ?? fallbackOrder(prevIdx + 1)) : undefined;
    const newOrder =
      beforeOrder !== undefined && afterOrder !== undefined ? (beforeOrder + afterOrder) / 2
        : beforeOrder !== undefined ? beforeOrder + 1000
          : afterOrder !== undefined ? afterOrder - 1000
            : 1000;

    try {
      await updateWorkItem(movedId, { sortOrder: newOrder });
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (err) {
      setOrder(items);
      onFlash(err instanceof Error ? err.message : String(err), 'error');
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
          onDragEnd={() => { setDraggingId(null); onDragEnd(); }}
          className={`todo-row-shell ${selectedTodoId === t.id ? 'selected' : ''}`}
          style={{ opacity: draggingId === t.id ? 0.4 : 1, cursor: 'grab' }}
        >
          <TodoItem t={t} projects={projects} onOpen={onSelectTodo} />
        </div>
      ))}
    </>
  );
}

const conceptEStyles = `
.capture-hero {
  position: relative;
  background: linear-gradient(135deg, rgba(191,90,242,0.055), rgba(0,255,242,0.035));
  border: 1px solid rgba(191,90,242,0.18);
  border-radius: var(--radius-lg, 12px);
  padding: 1rem 1.15rem;
  margin-bottom: 1rem;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.12);
}
.capture-hero::before {
  display: none;
}
@keyframes borderFlow {
  0% { background-position: 0% 0; }
  100% { background-position: 300% 0; }
}
.capture-hero-inner { position: relative; z-index: 1; }
.capture-hero .particle-field { opacity: 0.18; }
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
.capture-submit-btn {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-primary);
  padding: 5px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all .15s;
  min-width: 72px;
}
.capture-submit-btn:hover:not(:disabled) {
  background: var(--neon-cyan);
  color: var(--bg-void);
  box-shadow: 0 0 16px rgba(0,255,242,0.4);
}
.capture-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.capture-hints {
  display: flex; gap: 1rem; align-items: center;
  margin-top: 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.capture-hints code {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.08);
  border: 1px solid rgba(191,90,242,0.2);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.7rem;
  margin-right: 4px;
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
.board-col.tone-pink::before   { background: linear-gradient(90deg, var(--neon-pink), var(--neon-orange)); }
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
.board-col.tone-pink   .board-col-name { color: var(--neon-pink); }
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

@media (max-width: 760px) {
  .capture-hero {
    padding: 0.85rem;
    margin-bottom: 0.85rem;
  }
  .capture-row {
    gap: 0.55rem;
    padding: 0.72rem 0.75rem;
  }
  .capture-real-input {
    font-size: 0.95rem;
  }
  .capture-submit-btn {
    min-width: 62px;
    padding: 5px 10px;
  }
  .capture-hints {
    gap: 0.55rem 0.75rem;
    font-size: 0.68rem;
  }
}
`;
