import { useNavigate } from 'react-router-dom';
import type { WorkItemStatus } from '@stash/shared';
import { updateWorkItem } from '../../api/work-items';
import type { WBProject, WBSession, WBTodo } from '../data';
import { fmt } from '../data';
import { ProjectIcon } from '../shared';
import { invalidMoveMessage, isStatusMoveAllowed, type ToastAction, type ToastTone } from './conceptE.dnd';

export type TodoViewId = 'command' | 'inbox' | 'today' | 'active' | 'waiting' | 'later' | 'done';

export interface TodoViewCounts {
  inbox: number;
  today: number;
  active: number;
  waiting: number;
  later: number;
  doneToday: number;
}

type Flash = (message: string, tone?: ToastTone, action?: ToastAction) => void;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function viewTitle(view: TodoViewId): string {
  switch (view) {
    case 'inbox': return 'Clarify the inbox';
    case 'today': return 'Plan today';
    case 'active': return 'Active work';
    case 'waiting': return 'Unblock work';
    case 'later': return 'Later queue';
    case 'done': return 'Review completions';
    case 'command':
    default: return 'Capture, decide, execute';
  }
}

export function buildSuggestions(groups: {
  inbox: WBTodo[];
  today: WBTodo[];
  doing: WBTodo[];
  waiting: WBTodo[];
  later: WBTodo[];
}): WBTodo[] {
  const seen = new Set<string>();
  const ordered = [
    ...groups.waiting,
    ...groups.doing,
    ...groups.today.filter(isHighPriority),
    ...groups.today,
    ...groups.inbox.filter(isHighPriority),
    ...groups.inbox,
    ...groups.later.filter(isHighPriority),
  ];
  return ordered.filter((todo) => {
    if (seen.has(todo.id) || todo.done) return false;
    seen.add(todo.id);
    return true;
  });
}

function isHighPriority(todo: WBTodo): boolean {
  return todo.priority === 'high';
}

export function TodoCommandRail({
  view,
  counts,
  suggestions,
  onViewChange,
  onSelectTodo,
}: {
  view: TodoViewId;
  counts: TodoViewCounts;
  suggestions: WBTodo[];
  onViewChange: (view: TodoViewId) => void;
  onSelectTodo: (todo: WBTodo) => void;
}) {
  const views: Array<{ id: TodoViewId; label: string; count: number; tone: string }> = [
    { id: 'command', label: 'Command', count: counts.inbox + counts.today + counts.active + counts.waiting, tone: 'cyan' },
    { id: 'inbox', label: 'Inbox', count: counts.inbox, tone: 'orange' },
    { id: 'today', label: 'Today', count: counts.today, tone: 'blue' },
    { id: 'active', label: 'Active', count: counts.active, tone: 'green' },
    { id: 'waiting', label: 'Blocked', count: counts.waiting, tone: 'pink' },
    { id: 'later', label: 'Later', count: counts.later, tone: 'purple' },
    { id: 'done', label: 'Done', count: counts.doneToday, tone: 'done' },
  ];

  return (
    <aside className="todo-command-rail" aria-label="Todo command views">
      <div className="todo-rail-head">
        <span className="todo-rail-kicker">daily command</span>
        <strong>{counts.active > 0 ? `${counts.active} active` : `${counts.today} planned`}</strong>
      </div>

      <div className="todo-view-stack">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`todo-view-chip ${item.tone} ${view === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
            data-testid={`todo-view-${item.id}`}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>

      <section className="todo-next-panel" aria-label="Suggested next tasks">
        <div className="todo-panel-title">
          <span>suggested next</span>
          <strong>{suggestions.length}</strong>
        </div>
        {suggestions.length === 0 ? (
          <div className="todo-muted-line">No urgent suggestions. Pull from Inbox or Later when ready.</div>
        ) : (
          <div className="todo-mini-list">
            {suggestions.slice(0, 5).map((todo) => (
              <button key={todo.id} type="button" className="todo-mini-row" onClick={() => onSelectTodo(todo)}>
                <span className={`todo-priority-dot ${todo.priority}`} />
                <span>{todo.text}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="todo-next-panel compact" aria-label="Flow quality">
        <div className="todo-panel-title">
          <span>flow quality</span>
          <strong>{counts.waiting === 0 ? 'clear' : 'blocked'}</strong>
        </div>
        <div className="todo-muted-line">
          {counts.waiting > 0
            ? 'Blocked or waiting tasks need a next action before more work is pulled in.'
            : 'Active work is not blocked. Keep the queue small and finish the current item.'}
        </div>
      </section>
    </aside>
  );
}

export function TodoInspector({
  todo,
  projects,
  sessions,
  onFlash,
  onUpdated,
}: {
  todo: WBTodo | null;
  projects: WBProject[];
  sessions: WBSession[];
  onFlash: Flash;
  onUpdated: () => void;
}) {
  const navigate = useNavigate();
  const project = todo?.project ? projects.find((p) => p.id === todo.project) : undefined;
  const relatedSessions = todo?.project
    ? sessions.filter((session) => session.project === todo.project).slice(0, 3)
    : [];

  async function patchTodo(input: Parameters<typeof updateWorkItem>[1], success: string) {
    if (!todo) return;
    try {
      await updateWorkItem(todo.id, input);
      window.dispatchEvent(new CustomEvent('stash:captured'));
      onUpdated();
      onFlash(success, 'ok');
    } catch (err) {
      onFlash(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async function moveStatus(status: WorkItemStatus, input: Parameters<typeof updateWorkItem>[1], success: string) {
    if (!todo) return;
    if (!isStatusMoveAllowed(todo.status, status)) {
      onFlash(invalidMoveMessage(todo, status) ?? `Cannot move to ${status}.`, 'error');
      return;
    }
    await patchTodo({ ...input, status }, success);
  }

  if (!todo) {
    return (
      <aside className="todo-inspector empty" aria-label="Task inspector">
        <div className="todo-inspector-kicker">task inspector</div>
        <h2>No task selected</h2>
        <p>Select a row to see project context, action buttons, and agent handoff.</p>
      </aside>
    );
  }

  return (
    <aside className="todo-inspector" aria-label="Task inspector" data-testid="todo-inspector">
      <div className="todo-inspector-kicker">task inspector</div>
      <h2>{todo.text}</h2>

      <div className="todo-meta-grid">
        <Meta label="status" value={todo.status} />
        <Meta label="priority" value={todo.priority} />
        <Meta label="project" value={project?.name ?? 'inbox'} icon={project?.emoji} />
        <Meta label="estimate" value={todo.estimateMinutes ? `${todo.estimateMinutes}m` : 'unset'} />
      </div>

      {(todo.description || todo.context || todo.outcome) && (
        <div className="todo-context-block">
          {todo.description && <p>{todo.description}</p>}
          {todo.context && <p>{todo.context}</p>}
          {todo.outcome && <p>{todo.outcome}</p>}
        </div>
      )}

      <div className="todo-action-grid">
        <button type="button" onClick={() => void moveStatus('planned', {
          todayPinned: true,
          scheduledFor: new Date().toISOString().slice(0, 10),
        }, 'Planned for today')}>
          Plan today
        </button>
        <button type="button" onClick={() => void moveStatus('active', { todayPinned: false }, 'Moved to active')}>
          Start work
        </button>
        <button type="button" onClick={() => void moveStatus('blocked', { todayPinned: false }, 'Marked blocked')}>
          Blocked
        </button>
        <button type="button" onClick={() => void moveStatus('done', {}, 'Marked done')}>
          Done
        </button>
      </div>

      <div className="todo-inspector-actions">
        <button type="button" onClick={() => navigate(`/tasks/${todo.id}`)}>Open detail</button>
        <button type="button" onClick={() => navigate(`/agent/new?todoId=${todo.id}`)}>Start agent</button>
      </div>

      {todo.tags.length > 0 && (
        <div className="todo-label-row">
          {todo.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}

      <section className="todo-session-strip" aria-label="Related agent sessions">
        <div className="todo-panel-title">
          <span>agent context</span>
          <strong>{relatedSessions.length}</strong>
        </div>
        {relatedSessions.length === 0 ? (
          <div className="todo-muted-line">No recent sessions on this project.</div>
        ) : relatedSessions.map((session) => (
          <button
            key={`${session.provider}-${session.id}`}
            type="button"
            className="todo-session-row"
            onClick={() => navigate(`/sessions/${session.provider}/${session.id}`)}
          >
            <span className={`todo-session-state ${session.state}`} />
            <span>{session.title}</span>
            <small>{fmt.ago(session.at)}</small>
          </button>
        ))}
      </section>
    </aside>
  );
}

function Meta({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="todo-meta">
      <span>{label}</span>
      <strong>{icon ? <ProjectIcon icon={icon} size="0.9rem" /> : null}{value}</strong>
    </div>
  );
}

export function DoneReviewPanel({
  doneToday,
  doneOlder,
  onSelectTodo,
  onOpenDone,
}: {
  doneToday: WBTodo[];
  doneOlder: WBTodo[];
  onSelectTodo: (todo: WBTodo) => void;
  onOpenDone: () => void;
}) {
  const rows = doneToday.length > 0 ? doneToday : doneOlder.slice(0, 8);
  return (
    <section className="done-review-panel" data-testid="done-review-panel">
      <div className="flow-panel-head">
        <div>
          <span className="todo-rail-kicker">done review</span>
          <h2>{doneToday.length > 0 ? 'Completed today' : 'Recent completions'}</h2>
        </div>
        <button type="button" className="flow-panel-link" onClick={onOpenDone}>Open archive</button>
      </div>
      {rows.length === 0 ? (
        <div className="done-review-empty">Nothing completed yet. Finish one active task and it lands here.</div>
      ) : (
        <div className="done-review-rows">
          {rows.map((todo) => (
            <button key={todo.id} type="button" className="done-review-row" onClick={() => onSelectTodo(todo)}>
              <span className="done-check">✓</span>
              <span>{todo.text}</span>
              <small>{todo.completedAt ? todo.completedAt.slice(0, 10) : 'done'}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export const todoCommandStyles = `
.todo-command-shell {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 320px;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}
.todo-command-rail,
.todo-inspector,
.todo-flow-panel {
  min-width: 0;
}
.todo-command-rail,
.todo-inspector {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.todo-rail-head,
.todo-next-panel,
.todo-inspector {
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.035);
  padding: 0.9rem;
}
.todo-rail-head {
  display: grid;
  gap: 0.2rem;
}
.todo-rail-kicker,
.todo-inspector-kicker {
  color: var(--neon-cyan);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.todo-rail-head strong {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 1.1rem;
}
.todo-view-stack {
  display: grid;
  gap: 0.42rem;
}
.todo-view-chip {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.025);
  color: var(--text-secondary);
  padding: 0.62rem 0.7rem;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  text-align: left;
}
.todo-view-chip strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.todo-view-chip.active {
  border-color: rgba(0,255,242,0.5);
  background: rgba(0,255,242,0.08);
  color: var(--neon-cyan);
}
.todo-panel-title,
.flow-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.todo-panel-title strong {
  color: var(--neon-green);
}
.todo-muted-line {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.55;
  margin-top: 0.6rem;
}
.todo-mini-list,
.done-review-rows {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.65rem;
}
.todo-mini-row,
.done-review-row,
.todo-session-row {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.025);
  color: var(--text-primary);
  padding: 0.55rem 0.62rem;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.todo-mini-row span:nth-child(2),
.done-review-row span:nth-child(2),
.todo-session-row span:nth-child(2) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-priority-dot,
.todo-session-state {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--text-muted);
}
.todo-priority-dot.high { background: var(--neon-pink); }
.todo-priority-dot.med { background: var(--neon-orange); }
.todo-priority-dot.low { background: var(--text-muted); }
.todo-flow-panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 0;
}
.flow-panel-head {
  text-transform: none;
  letter-spacing: 0;
}
.flow-panel-head h2 {
  margin: 0.15rem 0 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 1rem;
}
.flow-panel-link {
  border: 1px solid rgba(0,255,242,0.32);
  border-radius: var(--radius-sm);
  background: rgba(0,255,242,0.05);
  color: var(--neon-cyan);
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}
.todo-lane-grid {
  min-width: 0;
  max-width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--lane-count, 5), minmax(140px, 1fr));
  gap: 0.6rem;
  min-height: 0;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.2rem;
}
.todo-lane-grid.focused {
  --lane-count: 1;
}
.todo-row-shell.selected .todo {
  border-color: rgba(0,255,242,0.58);
  box-shadow: 0 0 0 1px rgba(0,255,242,0.16), 0 0 20px rgba(0,255,242,0.08);
}
.todo-inspector {
  align-self: stretch;
  overflow: auto;
}
.todo-inspector.empty {
  color: var(--text-muted);
}
.todo-inspector h2 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 1rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.todo-inspector p {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  line-height: 1.55;
}
.todo-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}
.todo-meta {
  min-width: 0;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.6rem;
  background: rgba(0,0,0,0.14);
}
.todo-meta span {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.25rem;
}
.todo-meta strong {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-context-block {
  display: grid;
  gap: 0.45rem;
  border-left: 2px solid rgba(0,255,242,0.32);
  padding-left: 0.75rem;
}
.todo-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}
.todo-action-grid button,
.todo-inspector-actions button {
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.035);
  color: var(--text-primary);
  padding: 0.52rem 0.55rem;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.todo-action-grid button:hover,
.todo-inspector-actions button:hover,
.todo-mini-row:hover,
.todo-session-row:hover,
.done-review-row:hover {
  border-color: rgba(0,255,242,0.45);
  background: rgba(0,255,242,0.06);
}
.todo-inspector-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}
.todo-label-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.todo-label-row span {
  color: var(--neon-cyan);
  border: 1px solid rgba(0,255,242,0.22);
  border-radius: var(--radius-sm);
  padding: 0.18rem 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
}
.todo-session-strip {
  display: grid;
  gap: 0.45rem;
}
.todo-session-state.live { background: var(--neon-green); }
.todo-session-state.idle { background: var(--neon-purple); }
.todo-session-state.done { background: var(--text-muted); }
.todo-session-state.error { background: var(--neon-pink); }
.todo-session-row small,
.done-review-row small {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 0.62rem;
  white-space: nowrap;
}
.done-review-panel {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.025);
  padding: 0.9rem;
  overflow: auto;
}
.done-review-empty {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 1.25rem 0;
}
.done-check {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(48,209,88,0.14);
  color: var(--neon-green);
  font-weight: 700;
}
@media (max-width: 1120px) {
  .todo-command-shell {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .todo-inspector {
    grid-column: 1 / -1;
  }
}
@media (max-width: 760px) {
  .todo-command-shell {
    grid-template-columns: 1fr;
  }
  .todo-flow-panel {
    order: 1;
  }
  .todo-command-rail {
    order: 2;
  }
  .todo-inspector {
    order: 3;
  }
  .todo-view-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .todo-lane-grid {
    grid-template-columns: repeat(var(--lane-count, 1), minmax(240px, 1fr));
    overflow-x: auto;
  }
}
`;
