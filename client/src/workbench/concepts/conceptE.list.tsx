import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UpdateWorkItemInput, WorkItemStatus } from '@stash/shared';
import { updateWorkItem } from '../../api/work-items';
import type { WBProject, WBTodo } from '../data';
import { ProjectIcon } from '../shared';
import { invalidMoveMessage, isStatusMoveAllowed, statusLabel, type ToastAction, type ToastTone } from './conceptE.dnd';

type Flash = (message: string, tone?: ToastTone, action?: ToastAction) => void;
type TodoListTone = 'orange' | 'cyan' | 'green' | 'pink' | 'purple';

export interface TodoListGroup {
  id: string;
  title: string;
  subtitle: string;
  items: WBTodo[];
  tone: TodoListTone;
  empty: string;
}

export function TodoListSurface({
  groups,
  projects,
  selectedTodoId,
  onSelectTodo,
  onDragStart,
  onDragEnd,
  onFlash,
  onUpdated,
}: {
  groups: TodoListGroup[];
  projects: WBProject[];
  selectedTodoId: string | null;
  onSelectTodo: (todo: WBTodo) => void;
  onDragStart: (todo: WBTodo) => void;
  onDragEnd: () => void;
  onFlash: Flash;
  onUpdated: () => void;
}) {
  const navigate = useNavigate();
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const openCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const blockedCount = groups.find((group) => group.id === 'blocked')?.items.length ?? 0;
  const activeCount = groups.find((group) => group.id === 'active')?.items.length ?? 0;

  async function applyListUpdate(todo: WBTodo, input: UpdateWorkItemInput, success: string) {
    if (input.status && !isStatusMoveAllowed(todo.status, input.status)) {
      onFlash(invalidMoveMessage(todo, input.status) ?? `Cannot move to ${input.status}.`, 'error');
      return;
    }
    try {
      await updateWorkItem(todo.id, input);
      window.dispatchEvent(new CustomEvent('stash:captured'));
      onUpdated();
      onFlash(success, 'ok');
    } catch (err) {
      onFlash(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async function setCompletion(todo: WBTodo) {
    const nextStatus: WorkItemStatus = todo.done ? 'planned' : 'done';
    await applyListUpdate(todo, { status: nextStatus }, todo.done ? 'Reopened task' : 'Marked done');
  }

  function navigateToDetail(todo: WBTodo) {
    navigate(`/tasks/${todo.id}`);
  }

  return (
    <section className="todo-list-surface" aria-label="Command task list">
      <div className="todo-list-summary">
        <SummaryTile label="待处理" value={openCount} />
        <SummaryTile label="进行中" value={activeCount} tone="green" />
        <SummaryTile label="阻塞" value={blockedCount} tone={blockedCount > 0 ? 'pink' : 'green'} />
      </div>

      <div className="todo-list-stack">
        {groups.map((group) => (
          <section className={`todo-list-group tone-${group.tone}`} key={group.id}>
            <div className="todo-list-group-head">
              <div>
                <span>{group.title}</span>
                <small>{group.subtitle}</small>
              </div>
              <strong>{group.items.length}</strong>
            </div>
            {group.items.length === 0 ? (
              <div className="todo-list-empty">{group.empty}</div>
            ) : (
              group.items.map((todo) => (
                <TaskListRow
                  key={todo.id}
                  todo={todo}
                  project={todo.project ? projectById.get(todo.project) : undefined}
                  selected={selectedTodoId === todo.id}
                  onSelect={onSelectTodo}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onOpen={navigateToDetail}
                  onPatch={applyListUpdate}
                  onToggleDone={setCompletion}
                />
              ))
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function SummaryTile({ label, value, tone = 'cyan' }: { label: string; value: number; tone?: 'cyan' | 'green' | 'pink' }) {
  return (
    <div className={`todo-list-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskListRow({
  todo,
  project,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
  onOpen,
  onPatch,
  onToggleDone,
}: {
  todo: WBTodo;
  project?: WBProject;
  selected: boolean;
  onSelect: (todo: WBTodo) => void;
  onDragStart: (todo: WBTodo) => void;
  onDragEnd: () => void;
  onOpen: (todo: WBTodo) => void;
  onPatch: (todo: WBTodo, input: UpdateWorkItemInput, success: string) => Promise<void>;
  onToggleDone: (todo: WBTodo) => Promise<void>;
}) {
  function selectFromKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onSelect(todo);
  }

  const actions = quickActions(todo);

  return (
    <div
      className={`todo-list-row ${selected ? 'selected' : ''}`}
      draggable
      role="button"
      tabIndex={0}
      onClick={() => onSelect(todo)}
      onKeyDown={selectFromKey}
      onDragStart={(e) => {
        onDragStart(todo);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/stash-todo', todo.id);
        e.dataTransfer.setData('text/plain', todo.id);
      }}
      onDragEnd={onDragEnd}
      data-testid={`todo-list-row-${todo.id}`}
    >
      <button
        type="button"
        className={`todo-list-check ${todo.done ? 'done' : ''}`}
        aria-label={todo.done ? 'mark not done' : 'mark done'}
        onClick={(e) => {
          e.stopPropagation();
          void onToggleDone(todo);
        }}
      >
        {todo.done ? '✓' : ''}
      </button>

      <div className="todo-list-main">
        <strong>{todo.text}</strong>
        <span>{todo.context || todo.description || todo.outcome || '暂无补充说明'}</span>
      </div>

      <div className="todo-list-project">
        {project ? <ProjectIcon icon={project.emoji} size="0.9rem" /> : <span className="todo-list-project-dot" />}
        <span>{project?.name ?? '收件箱'}</span>
      </div>

      <span className={`todo-status-pill ${todo.status}`}>{statusLabel(todo.status)}</span>
      <span className={`todo-priority-pill ${todo.priority}`}>{priorityLabel(todo.priority)}</span>
      <span className="todo-list-date">{scheduleLabel(todo)}</span>

      <div className="todo-list-actions">
        {actions.slice(0, 3).map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onPatch(todo, action.input, action.success);
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="subtle"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(todo);
          }}
        >
          打开
        </button>
      </div>
    </div>
  );
}

function quickActions(todo: WBTodo): Array<{ label: string; input: UpdateWorkItemInput; success: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const candidates: Array<{ label: string; status: WorkItemStatus; input: UpdateWorkItemInput; success: string }> = [
    { label: '今日', status: 'planned', input: { status: 'planned', todayPinned: true, scheduledFor: today }, success: '已安排到今天' },
    { label: '开始', status: 'active', input: { status: 'active', todayPinned: false }, success: '已开始处理' },
    { label: '完成', status: 'done', input: { status: 'done' }, success: '已完成' },
  ];
  return candidates
    .filter((action) => todo.status !== action.status && isStatusMoveAllowed(todo.status, action.status))
    .map(({ label, input, success }) => ({ label, input, success }));
}

function priorityLabel(priority: WBTodo['priority']): string {
  if (priority === 'high') return '高';
  if (priority === 'med') return '中';
  return '低';
}

function scheduleLabel(todo: WBTodo): string {
  if (todo.todayPinned || todo.due === 'today') return '今天';
  if (todo.scheduledFor) return todo.scheduledFor.slice(5);
  if (todo.dueAt) return todo.dueAt.slice(5, 10);
  if (todo.due === 'this-week') return '本周';
  if (todo.due === 'someday') return '以后';
  return '未安排';
}

export const todoListStyles = `
.todo-list-surface {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}
.todo-list-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}
.todo-list-stat {
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.03);
  padding: 0.62rem 0.7rem;
}
.todo-list-stat span {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.todo-list-stat strong {
  display: block;
  margin-top: 0.15rem;
  color: var(--neon-cyan);
  font-family: var(--font-mono);
  font-size: 1.35rem;
  line-height: 1;
}
.todo-list-stat.green strong { color: var(--neon-green); }
.todo-list-stat.pink strong { color: var(--neon-pink); }
.todo-list-stack {
  min-height: 0;
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.025);
}
.todo-list-group {
  border-bottom: 1px solid var(--border-hair);
}
.todo-list-group:last-child { border-bottom: 0; }
.todo-list-group-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 42px;
  padding: 0.58rem 0.78rem;
  background: color-mix(in srgb, var(--bg-void) 86%, transparent);
  border-bottom: 1px solid var(--border-hair);
  backdrop-filter: blur(18px);
}
.todo-list-group-head div {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
}
.todo-list-group-head span {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.todo-list-group-head small {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.todo-list-group-head strong {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.todo-list-group.tone-orange .todo-list-group-head span { color: var(--neon-orange); }
.todo-list-group.tone-cyan .todo-list-group-head span { color: var(--neon-cyan); }
.todo-list-group.tone-green .todo-list-group-head span { color: var(--neon-green); }
.todo-list-group.tone-pink .todo-list-group-head span { color: var(--neon-pink); }
.todo-list-group.tone-purple .todo-list-group-head span { color: var(--neon-purple); }
.todo-list-empty {
  padding: 1rem 0.8rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.todo-list-row {
  display: grid;
  grid-template-columns: 28px minmax(280px, 1fr) minmax(112px, 0.32fr) 88px 72px 96px minmax(190px, auto);
  gap: 0.7rem;
  align-items: center;
  min-height: 64px;
  padding: 0.64rem 0.78rem;
  border-bottom: 1px solid var(--border-hair);
  cursor: pointer;
}
.todo-list-row:last-child { border-bottom: 0; }
.todo-list-row:hover,
.todo-list-row.selected {
  background: rgba(0,255,242,0.045);
}
.todo-list-row.selected {
  box-shadow: inset 3px 0 0 var(--neon-cyan);
}
.todo-list-check {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--text-muted);
  border-radius: 5px;
  background: transparent;
  color: var(--bg-void);
  cursor: pointer;
  font: 800 0.7rem var(--font-mono);
}
.todo-list-check.done {
  background: var(--gradient-success);
  border-color: transparent;
}
.todo-list-main {
  min-width: 0;
  display: grid;
  gap: 0.22rem;
}
.todo-list-main strong {
  min-width: 0;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 0.9rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-list-main span {
  min-width: 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-list-project {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.38rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.7rem;
}
.todo-list-project span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-list-project-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--neon-orange);
}
.todo-status-pill,
.todo-priority-pill {
  justify-self: start;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-pill);
  padding: 0.18rem 0.48rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 800;
  white-space: nowrap;
}
.todo-status-pill.inbox { color: var(--neon-orange); border-color: rgba(255,159,10,0.25); }
.todo-status-pill.planned,
.todo-status-pill.someday { color: var(--neon-cyan); border-color: rgba(0,255,242,0.24); }
.todo-status-pill.active { color: var(--neon-green); border-color: rgba(48,209,88,0.26); }
.todo-status-pill.waiting,
.todo-status-pill.blocked { color: var(--neon-pink); border-color: rgba(255,55,95,0.28); }
.todo-status-pill.done { color: var(--text-muted); }
.todo-priority-pill.high { color: var(--neon-pink); }
.todo-priority-pill.med { color: var(--neon-orange); }
.todo-priority-pill.low { color: var(--text-muted); }
.todo-list-date {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  white-space: nowrap;
}
.todo-list-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.todo-list-actions button {
  border: 1px solid rgba(0,255,242,0.26);
  border-radius: var(--radius-sm);
  background: rgba(0,255,242,0.045);
  color: var(--neon-cyan);
  padding: 0.28rem 0.48rem;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.66rem;
}
.todo-list-actions button.subtle {
  border-color: var(--border-hair);
  background: rgba(255,255,255,0.025);
  color: var(--text-secondary);
}
@media (max-width: 1120px) {
  .todo-list-row {
    grid-template-columns: 28px minmax(220px, 1fr) 96px 82px 70px;
  }
  .todo-list-project,
  .todo-list-date {
    display: none;
  }
}
@media (max-width: 760px) {
  .todo-list-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .todo-list-stat {
    padding: 0.56rem 0.58rem;
  }
  .todo-list-stat strong {
    font-size: 1.1rem;
  }
  .todo-list-group-head {
    align-items: flex-start;
  }
  .todo-list-group-head div {
    display: grid;
    gap: 0.18rem;
  }
  .todo-list-row {
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 0.55rem;
    align-items: start;
    padding: 0.75rem;
  }
  .todo-list-main strong {
    white-space: normal;
    overflow: visible;
  }
  .todo-list-main span {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .todo-status-pill,
  .todo-priority-pill,
  .todo-list-date,
  .todo-list-actions {
    grid-column: 2;
  }
  .todo-list-project {
    grid-column: 2;
    display: flex;
  }
  .todo-list-actions {
    justify-content: flex-start;
  }
}
`;
