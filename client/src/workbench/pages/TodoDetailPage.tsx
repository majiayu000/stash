import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CoachApplySummaryResponse, JournalEntry, Priority, WorkItem, WorkItemStatus } from '@stash/shared';
import { apiGet } from '../../api/client';
import { ChecklistPanel, useChecklist } from './todo-detail.checklist';
import {
  useEscToClose,
  useJournalEntries,
  useLinkedSessionEdges,
  useTodoDetailResources,
} from './todo-detail.hooks';
import { EvidencePanel, usePendingEvidence } from './todo-detail.evidence';
import { IdeaDecomposeAction } from './todo-detail.ai';
import { TaskCoachPanel } from './todo-detail.coach';
import {
  EditableDescription,
  EditableTitle,
  MetaRow,
  PromoteBtn,
  SubTask,
  optionToRecurrence,
  recurrenceToOption,
  toLocalDateTime,
} from './todo-detail.meta';
import { linkSession, listLinkedSessions, unlinkSession, type LinkedSessionEdge } from '../../api/agent-sessions';
import { createArea } from '../../api/areas';
import { createLesson } from '../../api/project-knowledge';
import { useWorkbenchDialog } from '../../components/ui/workbench-dialogs';
import {
  appendJournal,
  createWorkItem,
  deleteJournalEntry,
  getWorkItem,
  runSystem,
  updateWorkItem,
} from '../../api/work-items';
import { fmt, type WBData, type WBTodo } from '../data';
import { reportAsyncError } from '../reportAsyncError';
import { todoDetailStyles } from './todo-detail.styles';
import {
  JournalSection,
  LessonsSection,
  LinkedSessionsSection,
  SubTasksSection,
  SystemHistorySection,
  TagsSection,
} from './todo-detail.sections';
import { TodoDetailSidebar } from './todo-detail.sidebar';
import { slugify } from './todo-detail.utils';

function kindChrome(kind: WorkItem['kind']): { label: string; color: string } {
  if (kind === 'idea') return { label: '💡 idea', color: 'var(--neon-purple)' };
  if (kind === 'system') return { label: '🔁 system', color: 'var(--neon-cyan)' };
  return { label: `✓ ${kind}`, color: 'var(--neon-cyan)' };
}

/** Todo detail, planning, decomposition, evidence, and execution context. */
export function TodoDetailPage({ data, reload }: { data: WBData; reload: () => void }) {
  const { projects, todos } = data;
  const { workItemId } = useParams<{ workItemId?: string }>();
  const navigate = useNavigate();
  const dialog = useWorkbenchDialog();
  // Pick the todo from URL, or default to first idea/inbox, else first todo.
  const selectedTodo = workItemId
    ? todos.find((t) => t.id === workItemId)
    : todos.find((t) => t.kind === 'idea' && !t.done) ?? todos.find((t) => !t.done) ?? todos[0];
  const todo = selectedTodo ?? (workItemId
    ? ({
      id: workItemId,
      text: 'loading…',
      project: null,
      tags: [],
      done: false,
      status: 'planned',
      priority: 'p2',
      kind: 'task',
      todayPinned: false,
      updatedAt: '',
      recurring: false,
      reminding: false,
    } satisfies WBTodo)
    : undefined);
  if (!todo) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            No task selected. Return to Work and choose a task.
          </div>
        </div>
      </div>
    );
  }
  const proj = projects.find((p) => p.id === todo.project);
  const { itemState, setItem, realSubs, setRealSubs, lessons } = useTodoDetailResources(todo);
  const item = itemState?.id === todo.id ? itemState : null;
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const runInFlightRef = useRef(false), closeInFlightRef = useRef(false);
  const shownKind = kindChrome(item?.kind ?? todo.kind);
  async function closeDetail() {
    if (closeInFlightRef.current) return;
    closeInFlightRef.current = true;
    try {
      const current = item ?? await getWorkItem(todo!.id);
      navigate(current.parentId ? `/todos/${current.parentId}` : '/', { replace: true });
    } catch (error) { reportAsyncError('resolve detail close target', error); flashSaved(`✕ could not close: ${error instanceof Error ? error.message : String(error)}`); }
    finally { closeInFlightRef.current = false; }
  }
  useEscToClose(closeDetail);
  async function dropItem() {
    if (!item || item.status === 'dropped') return;
    const confirmed = await dialog.confirm({
      title: 'drop this task?',
      description: 'The task will leave active work. You can still find it in its project history.',
      confirmLabel: 'drop task',
      tone: 'danger',
    });
    if (confirmed) await save('status', 'dropped' as WorkItemStatus);
  }
  async function runThisSystem() {
    if (!item || item.kind !== 'system' || runInFlightRef.current) return;
    runInFlightRef.current = true; setIsCreatingRun(true);
    try {
      const run = await runSystem(item.id);
      flashSaved('run created');
      reload();
      navigate(`/todos/${run.id}`, { replace: false });
    } catch (e) {
      flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`);
    } finally { runInFlightRef.current = false; setIsCreatingRun(false); }
  }
  async function save<K extends 'title' | 'description' | 'priority' | 'status' | 'dueAt' | 'projectId' | 'areaId' | 'labels' | 'recurrence'>(field: K, value: WorkItem[K]) {
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
  async function saveReminder(local_date_time: string) {
    if (!item) return;
    try {
      const updated = await updateWorkItem(
        item.id,
        local_date_time
          ? { reminderLocalDateTime: local_date_time }
          : { reminderAt: null },
      );
      setItem(updated);
      flashSaved('saved');
      reload();
    } catch (error) {
      flashSaved(`✕ ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  function flashSaved(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 1400);
  }
  async function reloadSubs() {
    if (!todo) return;
    try {
      const res = await apiGet<{ data: WorkItem[] }>(`/work-items/${todo.id}/subtasks`);
      setRealSubs(res.data);
    } catch (error) {
      reportAsyncError('reload subtasks', error, reloadSubs);
    }
  }
  async function addSubtask() {
    if (!todo) return;
    const title = await dialog.prompt({
      title: 'new sub-task',
      label: 'title',
      placeholder: 'break this todo into one concrete next step',
      confirmLabel: 'add sub-task',
    });
    if (!title || !title.trim()) return;
    try {
      await createWorkItem({
        title: title.trim(),
        parentId: todo.id,
        projectId: item?.projectId,
        areaId: item?.areaId,
        kind: 'task',
        status: 'planned',
      });
      await reloadSubs();
      flashSaved('+ sub-task');
      reload();
    } catch (e) {
      flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function toggleSubtask(sub: WorkItem) {
    try {
      await updateWorkItem(sub.id, { status: sub.status === 'done' ? 'planned' : 'done' });
      await reloadSubs();
    } catch (error) {
      reportAsyncError('toggle subtask', error, () => toggleSubtask(sub));
    }
  }

  async function dropSubtask(sub: WorkItem) {
    try {
      await updateWorkItem(sub.id, { status: 'dropped' });
      await reloadSubs();
    } catch (error) {
      reportAsyncError('drop subtask', error, () => dropSubtask(sub));
    }
  }

  async function addLabel() {
    if (!item) return;
    const t = await dialog.prompt({
      title: 'new tag',
      label: 'tag',
      placeholder: 'auth',
      confirmLabel: 'add tag',
    });
    if (!t || !t.trim()) return;
    const tag = t.trim().replace(/^#/, '');
    if (item.labels.includes(tag)) return;
    await save('labels', [...item.labels, tag]);
  }

  async function removeLabel(label: string) {
    if (!item) return;
    await save('labels', item.labels.filter((l) => l !== label));
  }

  async function setDue(value: string) {
    await save('dueAt', value || undefined);
  }

  // v0.8 — real journal: append + delete with reload.
  // (todoId is captured further below for use in async closures.)
  const journalTodoId = todo.id;
  const { journalEntries, setJournalEntries, refreshJournal } = useJournalEntries(journalTodoId);

  async function addJournal() {
    const body = await dialog.prompt({
      title: 'journal entry',
      label: 'markdown',
      multiline: true,
      placeholder: 'what changed, what is blocked, or what should be remembered?',
      confirmLabel: 'add entry',
    });
    if (!body?.trim()) return;
    try {
      const entry = await appendJournal(journalTodoId, body);
      setJournalEntries((cur) => [entry, ...cur]);
      flashSaved('+ journal');
    } catch (e) { flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`); }
  }

  async function removeJournal(entry: JournalEntry) {
    const ok = await dialog.confirm({
      title: 'delete journal entry?',
      description: 'This removes the note from the todo journal.',
      confirmLabel: 'delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteJournalEntry(journalTodoId, entry.id);
      setJournalEntries((cur) => cur.filter((e) => e.id !== entry.id));
    } catch (error) {
      reportAsyncError('delete journal entry', error, refreshJournal);
    }
  }

  function onCoachApplied(result: CoachApplySummaryResponse) {
    if (result.item) setItem(result.item);
    if (result.journalEntry) setJournalEntries((cur) => [result.journalEntry!, ...cur]);
    reload();
  }

  const evidence = usePendingEvidence({
    workItemId: journalTodoId,
    onAccepted: setItem,
    onFlash: flashSaved,
    reload,
  });

  const checklist = useChecklist({
    workItem: item,
    onChange: setItem,
    onFlash: flashSaved,
  });

  async function setProjectField(projectId: string | undefined) {
    if (!item) return;
    const optimistic = { ...item, projectId, areaId: projectId };
    setItem(optimistic);
    try {
      const updated = await updateWorkItem(item.id, { projectId, areaId: projectId });
      setItem(updated);
      flashSaved('saved');
      reload();
    } catch (e) {
      setItem(item);
      flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const subtasksLoading = realSubs === null;
  const historyRuns = item?.kind === 'system' ? (realSubs ?? []) : [];

  // SPEC v0.3 — real linked sessions via /api/work-items/:id/sessions (proxied by listLinkedSessions).
  const todoId = todo.id;
  const { linkedEdges, setLinkedEdges, refreshLinkedSessions } = useLinkedSessionEdges(todoId);

  async function linkPick() {
    const candidates = data.sessions.slice(0, 12);
    if (candidates.length === 0) {
      await dialog.alert({ title: 'no agent sessions available yet' });
      return;
    }
    const choice = await dialog.prompt({
      title: 'pick a session to link',
      description: candidates.map((s, i) => `${i + 1}. [${s.provider}] ${s.title || s.id.slice(0, 8)}`).join('\n'),
      label: 'session number',
      placeholder: '1',
      confirmLabel: 'link session',
    });
    const idx = Number(choice ?? '') - 1;
    const pick = candidates[idx];
    if (!pick) return;
    try {
      await linkSession(todoId, pick.provider, pick.id);
      const fresh = await listLinkedSessions(todoId);
      setLinkedEdges(fresh);
    } catch (e) { await dialog.alert({ title: 'could not link session', description: e instanceof Error ? e.message : String(e), tone: 'danger' }); }
  }

  async function unlinkOne(edge: LinkedSessionEdge) {
    try {
      await unlinkSession(todoId, edge.provider, edge.sessionId);
      setLinkedEdges((cur) => cur.filter((e) => !(e.provider === edge.provider && e.sessionId === edge.sessionId)));
    } catch (error) {
      reportAsyncError('unlink session', error, refreshLinkedSessions);
    }
  }

  // ─── Promote handlers ─────────────────────────────────────────────────────

  async function promoteToFeature() {
    if (!item) return;
    if (item.kind === 'feature') { await dialog.alert({ title: 'already a feature' }); return; }
    await save('priority', item.priority);              // touch to refresh updatedAt
    try {
      const updated = await updateWorkItem(todoId, { kind: 'feature' });
      setItem(updated);
      flashSaved('✓ promoted to feature');
      reload();
    } catch (e) { flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`); }
  }

  async function promoteToNewProject() {
    if (!item) return;
    const suggestion = slugify(item.title);
    const name = await dialog.prompt({
      title: 'new project name',
      label: 'project',
      defaultValue: suggestion,
      confirmLabel: 'create project',
    });
    if (!name?.trim()) return;
    try {
      const area = await createArea({ name: name.trim() });
      const updated = await updateWorkItem(todoId, { projectId: area.id, areaId: area.id, kind: 'feature' });
      setItem(updated);
      flashSaved(`✓ project #${area.name} created`);
      reload();
      navigate(`/projects/${area.id}`);
    } catch (e) { flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`); }
  }

  async function promoteToLesson() {
    if (!item) return;
    try {
      await createLesson({
        title: item.title,
        body: item.description ?? '',
        projectId: item.projectId,
        tags: item.labels,
      });
      // Soft-drop the original; the lesson now carries its essence.
      await updateWorkItem(todoId, { status: 'dropped' });
      flashSaved('✓ saved as lesson, original dropped');
      reload();
      navigate(item.projectId ? `/projects/${item.projectId}` : '/');
    } catch (e) { flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`); }
  }

  return (
    <div className="dashboard-canvas todo-detail-page">
      <div className="inner td-page-shell">
        <article className="td-page" data-testid="todo-detail-page">
          {/* Header */}
          <div className="td-modal-head">
            <div className="td-header-row">
              <button
                className="td-back"
                type="button"
                onClick={closeDetail}
                aria-label={item?.parentId ? 'Back to system' : 'Close detail'}
                title={item?.parentId ? 'Back to system' : 'Close detail'}
              >
                <span aria-hidden>←</span>
                <span>{item?.parentId ? 'Back to system' : 'Back to work'}</span>
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: shownKind.color, background: 'rgba(191,90,242,0.1)', padding: '2px 7px', borderRadius: 'var(--radius-pill)', border: '1px solid rgba(191,90,242,0.25)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {shownKind.label} {proj ? `· #${proj.name}` : '· from inbox'}
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
              {item?.kind === 'system' && (
                <button
                  type="button"
                  onClick={runThisSystem}
                  disabled={isCreatingRun}
                  data-testid="system-run-button"
                  style={{ marginLeft: 'auto', marginRight: 8, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '2px 8px', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', background: 'transparent', borderRadius: 4, cursor: isCreatingRun ? 'default' : 'pointer', opacity: isCreatingRun ? 0.6 : 1 }}
                  title="Create a fresh run instance with current checklist"
                >
                  {isCreatingRun ? 'creating run…' : '▶ Run system'}
                </button>
              )}
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
              <SubTasksSection
                subtasksLoading={subtasksLoading}
                realSubs={realSubs}
                onAdd={() => { void addSubtask(); }}
                onToggle={(sub) => { void toggleSubtask(sub); }}
                onDrop={(sub) => { void dropSubtask(sub); }}
              />

              <ChecklistPanel state={checklist} />

              <SystemHistorySection item={item} historyRuns={historyRuns} realSubs={realSubs} />
              <LessonsSection lessons={lessons} proj={proj} />

              <TagsSection
                item={item}
                onAddLabel={() => { void addLabel(); }}
                onRemoveLabel={(label) => { void removeLabel(label); }}
              />

              <LinkedSessionsSection
                todo={todo}
                sessions={data.sessions}
                linkedEdges={linkedEdges}
                onLink={() => { void linkPick(); }}
                onUnlink={(edge) => { void unlinkOne(edge); }}
              />

              {item && <EvidencePanel state={evidence} />}

              <TaskCoachPanel item={item} onApplied={onCoachApplied} onFlash={flashSaved} />

              <JournalSection
                journalEntries={journalEntries}
                onAdd={() => { void addJournal(); }}
                onRemove={(entry) => { void removeJournal(entry); }}
              />
            </div>

            {/* Meta column */}
            <TodoDetailSidebar
              item={item}
              todo={todo}
              projects={projects}
              timeZone={data.runtime.timeZone}
              shownKind={shownKind}
              onFlash={flashSaved}
              onSave={(field, value) => { void save(field, value); }}
              onSaveReminder={(local) => { void saveReminder(local); }}
              onSetProject={(projectId) => { void setProjectField(projectId); }}
              onSetDue={(value) => { void setDue(value); }}
              onPromoteToFeature={() => { void promoteToFeature(); }}
              onPromoteToNewProject={() => { void promoteToNewProject(); }}
              onPromoteToLesson={() => { void promoteToLesson(); }}
            />
          </div>

          {/* Footer */}
          <div className="td-modal-foot">
            <details className="td-more-actions">
              <summary className="np-btn ghost">More actions</summary>
              <div className="td-more-menu">
                <button
                  className="np-btn ghost danger"
                  type="button"
                  disabled={!item || item.status === 'dropped'}
                  onClick={() => { void dropItem(); }}
                  data-testid="td-drop"
                >Drop task…</button>
              </div>
            </details>
            <span style={{ flex: 1 }} />
            <button
              className="np-btn primary"
              type="button"
              disabled={!item || item.kind === 'system'}
              title={item?.kind === 'system' ? 'System templates cannot be completed. Run the system and complete the Run instead.' : undefined}
              onClick={() => { void save('status', item?.status === 'done' ? ('planned' as WorkItemStatus) : ('done' as WorkItemStatus)); }}
              data-testid="td-done"
            >{item?.kind === 'system' ? 'template only' : item?.status === 'done' ? '↶ reopen' : '✓ mark done'}</button>
          </div>
        </article>
      </div>

      <style>{todoDetailStyles}</style>
    </div>
  );
}
