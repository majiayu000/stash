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
              <div className="td-section">
                <div className="td-section-label">
                  <span>sub-tasks{subtasksLoading && ' '}{subtasksLoading && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(loading…)</span>}</span>
                  {subtasksLoading
                    ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                    : <span style={{ color: 'var(--neon-green)' }}>{(realSubs ?? []).filter((s) => s.status === 'done').length}/{(realSubs ?? []).length}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {subtasksLoading
                    ? <div data-testid="subtasks-loading" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>loading sub-tasks…</div>
                    : (realSubs ?? []).length === 0
                      ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no sub-tasks. break the work down to keep your context fresh next session.</div>
                      : (realSubs ?? []).map((s) => (
                        <SubTask
                          key={s.id}
                          done={s.status === 'done'}
                          dropped={s.status === 'dropped'}
                          text={s.title}
                          onToggle={() => toggleSubtask(s)}
                          onDrop={() => dropSubtask(s)}
                        />
                      ))}
                  <button className="td-subtask-add" type="button" onClick={addSubtask} disabled={subtasksLoading}>+ add sub-task</button>
                </div>
              </div>

              <ChecklistPanel state={checklist} />

              {item?.kind === 'system' && (
                <div className="td-section" data-testid="system-history">
                  <div className="td-section-label">
                    <span>history Runs</span>
                    <span style={{ color: 'var(--text-muted)' }}>{historyRuns.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {realSubs === null ? (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>loading runs…</div>
                    ) : historyRuns.length === 0 ? (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no runs yet — press Run system to create the first execution.</div>
                    ) : historyRuns.map((run) => {
                      const total = run.checklist.length;
                      const done = run.checklist.filter((step) => step.completed).length;
                      const date = run.scheduledFor ?? run.createdAt.slice(0, 10);
                      return (
                        <button
                          key={run.id}
                          type="button"
                          className="td-history-run"
                          onClick={() => navigate(`/todos/${run.id}`)}
                          data-testid="system-history-run"
                        >
                          <span>{date}</span>
                          <strong>{run.title}</strong>
                          <em>{run.status} · {done}/{total}</em>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  {(item?.labels ?? []).length === 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>(no tags)</span>
                  )}
                  {(item?.labels ?? []).map((t) => (
                    <span key={t} className="td-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      #{t}
                      <button
                        type="button"
                        onClick={() => removeLabel(t)}
                        style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: '0.7rem' }}
                        aria-label={`remove ${t}`}
                      >×</button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={addLabel}
                    className="td-tag td-tag-add"
                    style={{ background: 'transparent', border: '1px dashed var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer', font: 'inherit' }}
                  >+ add</button>
                </div>
              </div>

              <div className="td-section">
                <div className="td-section-label">
                  <span>linked sessions</span>
                  <button
                    type="button"
                    onClick={linkPick}
                    style={{ background: 'transparent', border: 0, color: 'var(--neon-cyan)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem' }}
                  >+ link</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedEdges.length === 0 ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none — link an agent session to keep its trace tied to this todo</div>
                  ) : (
                    linkedEdges.map((e) => {
                      const sess = data.sessions.find((s) => s.id === e.sessionId && s.provider === e.provider);
                      return (
                        <div key={`${e.provider}:${e.sessionId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-hair)', borderRadius: 4 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--neon-cyan)', textTransform: 'uppercase' }}>{e.provider}</span>
                          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sess?.title || e.sessionId.slice(0, 12)}
                          </span>
                          <button
                            type="button"
                            onClick={() => unlinkOne(e)}
                            style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}
                            title="unlink"
                          >×</button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {item && <EvidencePanel state={evidence} />}

              <TaskCoachPanel item={item} onApplied={onCoachApplied} onFlash={flashSaved} />

              <div className="td-section">
                <div className="td-section-label">
                  <span>journal</span>
                  <button
                    type="button"
                    onClick={addJournal}
                    style={{ background: 'transparent', border: 0, color: 'var(--neon-cyan)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem' }}
                  >+ entry</button>
                </div>
                <div className="td-journal">
                  {journalEntries.length === 0 ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      no journal entries — press <code>+ entry</code> to log a thought.
                    </div>
                  ) : (
                    journalEntries.map((j) => (
                      <div key={j.id} className="td-journal-entry" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span className="td-journal-date" title={j.createdAt}>{fmt.ago(Date.parse(j.createdAt))}</span>
                        <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{j.body}</span>
                        <button
                          type="button"
                          onClick={() => removeJournal(j)}
                          style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
                          title="delete entry"
                        >×</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Meta column */}
            <div className="td-modal-meta">
              <div className="td-run">
                <div className="td-section-label" style={{ color: 'var(--neon-cyan)' }}>▶ run with</div>
                <IdeaDecomposeAction item={item} onFlash={flashSaved} />
                <button
                  className="td-run-btn"
                  type="button"
                  onClick={() => navigate(`/sessions/new?todoId=${journalTodoId}`)}
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
                    onChange={(e) => setProjectField(e.target.value || undefined)}
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
                    onChange={(e) => setDue(e.target.value)}
                    disabled={!item}
                    style={{ background: 'transparent', border: 0, color: item?.dueAt ? 'var(--neon-orange)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', colorScheme: 'dark' }}
                    data-testid="td-due"
                  />
                } />

                <MetaRow k="kind" v={<span style={{ color: shownKind.color }}>{shownKind.label}</span>} />

                <MetaRow k="repeats" v={
                  <select
                    value={recurrenceToOption(item?.recurrence)}
                    onChange={(e) => save('recurrence', optionToRecurrence(e.target.value))}
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
                      ? toLocalDateTime(item.reminderAt, data.runtime.timeZone)
                      : ''}
                    onChange={(e) => { void saveReminder(e.target.value); }}
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
                  onClick={promoteToFeature}
                  disabled={!item || item.kind === 'feature'}
                />
                <PromoteBtn
                  icon="📁"
                  title="into a new project"
                  sub={`scaffold "${slugify(todo.text)}"`}
                  onClick={promoteToNewProject}
                  disabled={!item}
                />
                <PromoteBtn
                  icon="📑"
                  title="into a lesson"
                  sub="save as cross-project knowledge, drop the source"
                  onClick={promoteToLesson}
                  disabled={!item}
                />
              </div>

            </div>
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
