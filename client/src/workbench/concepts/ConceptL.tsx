import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CoachApplySummaryResponse, JournalEntry, Lesson, Priority, WorkItem, WorkItemStatus } from '@stash/shared';
import { apiGet } from '../../api/client';
import { ChecklistPanel, useChecklist } from './conceptL.checklist';
import { useEscToClose } from './conceptL.hooks';
import { EvidencePanel, usePendingEvidence } from './conceptL.evidence';
import { IdeaDecomposeAction } from './conceptL.ai';
import { TaskCoachPanel } from './conceptL.coach';
import {
  EditableDescription,
  EditableTitle,
  MetaRow,
  PromoteBtn,
  SubTask,
  optionToRecurrence,
  recurrenceToOption,
  toLocalDateTime,
} from './conceptL.meta';
import { linkSession, listLinkedSessions, unlinkSession, type LinkedSessionEdge } from '../../api/agent-sessions';
import { createArea } from '../../api/areas';
import { createLesson } from '../../api/project-knowledge';
import { useWorkbenchDialog } from '../../components/ui/workbench-dialogs';
import {
  appendJournal,
  createWorkItem,
  deleteJournalEntry,
  getWorkItem,
  listJournal,
  updateWorkItem,
} from '../../api/work-items';
import { fmt, type WBData, type WBTodo } from '../data';
import { reportAsyncError } from '../reportAsyncError';
import { Topbar } from '../shared';
import { conceptLStyles } from './conceptL.styles';
import { slugify, stubSubTasks } from './conceptL.stubs';

/** Concept L — Todo detail modal over a dimmed board preview. */
export function ConceptL({ data, reload }: { data: WBData; reload: () => void }) {
  const { projects, todos } = data;
  const { workItemId } = useParams<{ workItemId?: string }>();
  const navigate = useNavigate();
  const dialog = useWorkbenchDialog();

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
      .catch((error) => { if (!cancelled) reportAsyncError('load todo detail', error); });

    apiGet<{ data: WorkItem[] }>(`/work-items/${todo.id}/subtasks`)
      .then((res) => { if (!cancelled) setRealSubs(res.data); })
      .catch((error) => {
        if (!cancelled) {
          setRealSubs([]);
          reportAsyncError('load subtasks', error);
        }
      });

    const params = new URLSearchParams();
    if (todo.project) params.set('projectId', todo.project);
    todo.tags.forEach((t) => params.append('label', t.replace(/^#/, '')));
    params.set('limit', '3');
    apiGet<{ data: Lesson[] }>(`/lessons/relevant?${params.toString()}`)
      .then((res) => { if (!cancelled) setLessons(res.data); })
      .catch((error) => {
        if (!cancelled) {
          setLessons([]);
          reportAsyncError('load relevant lessons', error);
        }
      });

    return () => { cancelled = true; };
  }, [todo.id]);

  useEscToClose(() => navigate(-1));

  async function save<K extends 'title' | 'description' | 'priority' | 'status' | 'dueAt' | 'projectId' | 'areaId' | 'labels' | 'recurrence' | 'reminderAt'>(field: K, value: WorkItem[K]) {
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

  async function reloadSubs() {
    if (!todo) return;
    try {
      const res = await apiGet<{ data: WorkItem[] }>(`/work-items/${todo.id}/subtasks`);
      setRealSubs(res.data);
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  }

  async function dropSubtask(sub: WorkItem) {
    try {
      await updateWorkItem(sub.id, { status: 'dropped' });
      await reloadSubs();
    } catch { /* ignore */ }
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
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    listJournal(journalTodoId).then((rows) => { if (!cancelled) setJournalEntries(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [journalTodoId]);

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
    } catch { /* swallow */ }
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

  // Stub fallback only when real subtasks aren't loaded yet, for visual continuity.
  const stubSubs = stubSubTasks(todo);
  const showStub = realSubs === null;
  const subs = showStub ? stubSubs : [];
  const doneSubs = subs.filter((s) => s.done).length;

  // SPEC v0.3 — real linked sessions via /api/work-items/:id/sessions (proxied by listLinkedSessions).
  const todoId = todo.id;
  const [linkedEdges, setLinkedEdges] = useState<LinkedSessionEdge[]>([]);
  useEffect(() => {
    let cancelled = false;
    listLinkedSessions(todoId)
      .then((e) => { if (!cancelled) setLinkedEdges(e); })
      .catch(() => { if (!cancelled) setLinkedEdges([]); });
    return () => { cancelled = true; };
  }, [todoId]);

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
    } catch { /* swallow */ }
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
      navigate(`/c/k/${area.id}`);
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
      navigate(item.projectId ? `/c/k/${item.projectId}` : '/');
    } catch (e) { flashSaved(`✕ ${e instanceof Error ? e.message : String(e)}`); }
  }

  return (
    <div className="dashboard-canvas" style={{ position: 'relative' }}>
      <div className="td-topbar-layer"><Topbar data={data} /></div>
      <div className="inner td-backdrop-preview" style={{ overflow: 'hidden', filter: 'blur(2px) brightness(0.5)', pointerEvents: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', marginBottom: '1rem' }}>
          {['📥', '🌅', '🚧', '📅'].map((e, i) => (
            <div key={i} className="board-col tone-purple" style={{ height: 200 }}>
              <div className="board-col-head"><span style={{ fontSize: '1rem' }}>{e}</span><span className="board-col-name">col</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <div className="td-overlay" onClick={(e) => { if (e.target === e.currentTarget) navigate(-1); }}>
        <div className="td-modal" onClick={(e) => e.stopPropagation()}>
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
                  <button className="td-subtask-add" type="button" onClick={addSubtask}>+ add sub-task</button>
                </div>
              </div>

              <ChecklistPanel state={checklist} />

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

              <EvidencePanel state={evidence} />

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

                <MetaRow k="kind" v={<span style={{ color: todo.kind === 'idea' ? 'var(--neon-purple)' : 'var(--neon-cyan)' }}>{todo.kind === 'idea' ? '💡 idea' : '✓ task'}</span>} />

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
                    value={item?.reminderAt ? toLocalDateTime(item.reminderAt) : ''}
                    onChange={(e) => save('reminderAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                    disabled={!item}
                    style={{ background: 'transparent', border: 0, color: item?.reminderAt ? 'var(--neon-pink)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', colorScheme: 'dark' }}
                    data-testid="td-remind"
                  />
                } />

                <MetaRow k="id" v={todo.id.slice(0, 12) + '…'} />
              </div>

              <div className="td-run">
                <div className="td-section-label" style={{ color: 'var(--neon-cyan)' }}>▶ run with</div>
                <IdeaDecomposeAction item={item} onFlash={flashSaved} />
                <button
                  className="td-run-btn"
                  type="button"
                  onClick={() => navigate(`/c/o?todoId=${journalTodoId}`)}
                  data-testid="td-run"
                >
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
