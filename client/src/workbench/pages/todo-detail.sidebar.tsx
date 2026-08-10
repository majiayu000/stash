import { useNavigate } from 'react-router-dom';
import type { WorkItem } from '@stash/shared';
import type { WBProject, WBTodo } from '../data';
import { IdeaDecomposeAction } from './todo-detail.ai';
import {
  MetaRow,
  PromoteBtn,
  optionToRecurrence,
  recurrenceToOption,
  toLocalDateTime,
} from './todo-detail.meta';
import { slugify } from './todo-detail.utils';

/**
 * The todo detail sidebar: run-with launcher, editable properties, and the
 * promote actions. Every mutation stays owned by the page — this renders the
 * column and calls back.
 */
export function TodoDetailSidebar({
  item,
  todo,
  projects,
  timeZone,
  shownKind,
  onFlash,
  onSave,
  onSaveReminder,
  onSetProject,
  onSetDue,
  onPromoteToFeature,
  onPromoteToNewProject,
  onPromoteToLesson,
}: {
  item: WorkItem | null;
  todo: WBTodo;
  projects: WBProject[];
  timeZone: string;
  shownKind: { label: string; color: string };
  onFlash: (message: string) => void;
  onSave: (field: 'recurrence', value: WorkItem['recurrence']) => void;
  onSaveReminder: (localDateTime: string) => void;
  onSetProject: (projectId: string | undefined) => void;
  onSetDue: (value: string) => void;
  onPromoteToFeature: () => void;
  onPromoteToNewProject: () => void;
  onPromoteToLesson: () => void;
}) {
  const navigate = useNavigate();
  return (
            <div className="td-modal-meta">
              <div className="td-run">
                <div className="td-section-label" style={{ color: 'var(--neon-cyan)' }}>▶ run with</div>
                <IdeaDecomposeAction item={item} onFlash={onFlash} />
                <button
                  className="td-run-btn"
                  type="button"
                  onClick={() => navigate(`/sessions/new?todoId=${todo.id}`)}
                  data-testid="td-run"
                >
                  <span style={{ fontSize: '1.05rem' }}>🤖</span>
                  <span>claude code · sonnet-4.5</span>
                  <span className="td-run-kbd">⌘↵</span>
                </button>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5, padding: '0.5rem' }}>
                  Opens the session starter with this task and its linked sessions as context.
                </div>
              </div>

              <div className="td-meta-block">
                <div className="td-section-label">properties</div>

                <MetaRow k="project" v={
                  <select
                    value={item?.projectId ?? ''}
                    onChange={(e) => onSetProject(e.target.value || undefined)}
                    disabled={!item}
                    style={{ background: 'transparent', border: 0, color: item?.projectId ? 'var(--neon-cyan)' : 'var(--neon-orange)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', maxWidth: 160 }}
                    data-testid="td-project"
                  >
                    <option value="">#inbox</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>#{p.name}</option>
                    ))}
                  </select>
                } />

                <MetaRow k="priority" v={<span className={`todo-prio ${todo.priority}`} style={{ margin: 0 }}>· {item?.priority ?? todo.priority}</span>} />

                <MetaRow k="due" v={
                  <input
                    type="date"
                    value={item?.dueAt ? item.dueAt.slice(0, 10) : ''}
                    onChange={(e) => onSetDue(e.target.value)}
                    disabled={!item}
                    style={{ background: 'transparent', border: 0, color: item?.dueAt ? 'var(--neon-orange)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', colorScheme: 'dark' }}
                    data-testid="td-due"
                  />
                } />

                <MetaRow k="kind" v={<span style={{ color: shownKind.color }}>{shownKind.label}</span>} />

                <MetaRow k="repeats" v={
                  <select
                    value={recurrenceToOption(item?.recurrence)}
                    onChange={(e) => onSave('recurrence', optionToRecurrence(e.target.value))}
                    disabled={!item}
                    style={{ background: 'transparent', border: 0, color: item?.recurrence ? 'var(--neon-purple)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer' }}
                    data-testid="td-repeat"
                  >
                    <option value="none">none</option>
                    <option value="daily">daily</option>
                    <option value="weekdays">weekdays (mo–fr)</option>
                    <option value="weekly">weekly</option>
                    <option value="monthly">monthly</option>
                    <option value="after_1d">after done · +1d</option>
                    <option value="after_7d">after done · +7d</option>
                  </select>
                } />

                <MetaRow k="remind" v={
                  <input
                    type="datetime-local"
                    value={item?.reminderAt
                      ? toLocalDateTime(item.reminderAt, timeZone)
                      : ''}
                    onChange={(e) => { void onSaveReminder(e.target.value); }}
                    disabled={!item}
                    style={{ background: 'transparent', border: 0, color: item?.reminderAt ? 'var(--neon-pink)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', colorScheme: 'dark' }}
                    data-testid="td-remind"
                  />
                } />

                <MetaRow k="id" v={todo.id.slice(0, 12) + '…'} />
              </div>

              <div className="td-promote">
                <div className="td-section-label" style={{ color: 'var(--neon-purple)' }}>💎 promote this {todo.kind}</div>
                <PromoteBtn
                  icon="🌌"
                  title="into a feature"
                  sub={item?.kind === 'feature' ? 'already a feature' : 'switch kind=feature'}
                  onClick={onPromoteToFeature}
                  disabled={!item || item.kind === 'feature'}
                />
                <PromoteBtn
                  icon="📁"
                  title="into a new project"
                  sub={`scaffold "${slugify(todo.text)}"`}
                  onClick={onPromoteToNewProject}
                  disabled={!item}
                />
                <PromoteBtn
                  icon="📑"
                  title="into a lesson"
                  sub="save as cross-project knowledge, drop the source"
                  onClick={onPromoteToLesson}
                  disabled={!item}
                />
              </div>

            </div>
  );
}
