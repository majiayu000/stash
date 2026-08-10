import type { JournalEntry, Lesson, WorkItem } from '@stash/shared';
import { useNavigate } from 'react-router-dom';
import type { LinkedSessionEdge } from '../../api/agent-sessions';
import { fmt, type WBProject, type WBSession, type WBTodo } from '../data';
import { SubTask } from './todo-detail.meta';

/**
 * The stacked sections of the todo detail main column. Each one renders a
 * slice of the task and calls back for every mutation — the page keeps
 * ownership of the state these act on.
 */

export function SubTasksSection({
  subtasksLoading,
  realSubs,
  onAdd,
  onToggle,
  onDrop,
}: {
  subtasksLoading: boolean;
  realSubs: WorkItem[] | null;
  onAdd: () => void;
  onToggle: (sub: WorkItem) => void;
  onDrop: (sub: WorkItem) => void;
}) {
  return (
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
                onToggle={() => onToggle(s)}
                onDrop={() => onDrop(s)}
              />
            ))}
        <button className="td-subtask-add" type="button" onClick={onAdd} disabled={subtasksLoading}>+ add sub-task</button>
      </div>
    </div>
  );
}

export function SystemHistorySection({
  item,
  historyRuns,
  realSubs,
}: {
  item: WorkItem | null;
  historyRuns: WorkItem[];
  realSubs: WorkItem[] | null;
}) {
  const navigate = useNavigate();
  return (
    <>
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

    </>
  );
}

export function LessonsSection({ lessons, proj }: { lessons: Lesson[]; proj: WBProject | undefined }) {
  return (
    <>
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
    </>
  );
}

export function TagsSection({
  item,
  onAddLabel,
  onRemoveLabel,
}: {
  item: WorkItem | null;
  onAddLabel: () => void;
  onRemoveLabel: (label: string) => void;
}) {
  return (
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
              onClick={() => onRemoveLabel(t)}
              style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: '0.7rem' }}
              aria-label={`remove ${t}`}
            >×</button>
          </span>
        ))}
        <button
          type="button"
          onClick={onAddLabel}
          className="td-tag td-tag-add"
          style={{ background: 'transparent', border: '1px dashed var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer', font: 'inherit' }}
        >+ add</button>
      </div>
    </div>
  );
}

export function LinkedSessionsSection({
  todo,
  sessions,
  linkedEdges,
  onLink,
  onUnlink,
}: {
  todo: WBTodo;
  sessions: WBSession[];
  linkedEdges: LinkedSessionEdge[];
  onLink: () => void;
  onUnlink: (edge: LinkedSessionEdge) => void;
}) {
  return (
    <div className="td-section">
      <div className="td-section-label">
        <span>linked sessions</span>
        <button
          type="button"
          onClick={onLink}
          style={{ background: 'transparent', border: 0, color: 'var(--neon-cyan)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem' }}
        >+ link</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {linkedEdges.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none — link an agent session to keep its trace tied to this todo</div>
        ) : (
          linkedEdges.map((e) => {
            const sess = sessions.find((s) => s.id === e.sessionId && s.provider === e.provider);
            return (
              <div key={`${e.provider}:${e.sessionId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-hair)', borderRadius: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--neon-cyan)', textTransform: 'uppercase' }}>{e.provider}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sess?.title || e.sessionId.slice(0, 12)}
                </span>
                <button
                  type="button"
                  onClick={() => onUnlink(e)}
                  style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}
                  title="unlink"
                >×</button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function JournalSection({
  journalEntries,
  onAdd,
  onRemove,
}: {
  journalEntries: JournalEntry[];
  onAdd: () => void;
  onRemove: (entry: JournalEntry) => void;
}) {
  return (
    <div className="td-section">
      <div className="td-section-label">
        <span>journal</span>
        <button
          type="button"
          onClick={onAdd}
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
                onClick={() => onRemove(j)}
                style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
                title="delete entry"
              >×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
