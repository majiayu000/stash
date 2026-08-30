import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { captureWorkItem, updateWorkItem } from '../../api/work-items';
import type { WBData, WBProject, WBTodo } from '../data';
import { doneMoveInput, moveInputForColumn } from './work.lifecycle';
import { denseWorkDemoStyles } from './dense-work-demo.styles';

interface WorkBuckets {
  open: WBTodo[];
  focus: WBTodo[];
  inbox: WBTodo[];
  later: WBTodo[];
}

type Feedback = { message: string; tone: 'ok' | 'error' };

const PRIORITY_RANK: Record<WBTodo['priority'], number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

function isTodayTodo(todo: WBTodo, calendarDate: string, nowIso: string): boolean {
  if (todo.status === 'done' || todo.status === 'dropped' || todo.status === 'inbox') return false;
  if (todo.status === 'active' || todo.todayPinned) return true;
  if (todo.startAt && todo.startAt <= nowIso) return true;
  if (todo.dueAt && todo.dueAt < calendarDate) return true;
  return todo.scheduledFor === calendarDate;
}

function sortForFocus(items: WBTodo[]): WBTodo[] {
  return [...items].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    if (a.todayPinned !== b.todayPinned) return a.todayPinned ? -1 : 1;
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
}

function makeBuckets(todos: WBTodo[], calendarDate: string, nowIso: string): WorkBuckets {
  const open = todos.filter((todo) => !todo.done && todo.status !== 'done' && todo.status !== 'dropped');
  const focus = sortForFocus(open.filter((todo) => isTodayTodo(todo, calendarDate, nowIso)));
  const focusIds = new Set(focus.map((todo) => todo.id));
  const inbox = sortForFocus(open.filter((todo) => todo.status === 'inbox'));
  const inboxIds = new Set(inbox.map((todo) => todo.id));
  const later = sortForFocus(open.filter((todo) => !focusIds.has(todo.id) && !inboxIds.has(todo.id)));
  return { open, focus, inbox, later };
}

function displayProjectName(todo: WBTodo, projects: WBProject[]): string {
  if (!todo.project) return 'No project';
  return projects.find((project) => project.id === todo.project)?.name ?? todo.project;
}

function formatCalendarDate(value: string): { weekday: string; date: string } {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { weekday: 'Today', date: value };
  return {
    weekday: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date),
    date: new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(date),
  };
}

function scheduleLabel(todo: WBTodo, calendarDate: string): string {
  if (todo.status === 'active') return 'in progress';
  if (todo.status === 'blocked') return 'blocked';
  if (todo.status === 'waiting') return 'waiting';
  if (todo.todayPinned || todo.scheduledFor === calendarDate) return 'today';
  if (todo.scheduledFor) return todo.scheduledFor.slice(5);
  if (todo.status === 'someday') return 'someday';
  return 'no date';
}

export function DenseWorkDemoPage({ data, reload }: { data: WBData; reload: () => void }) {
  const navigate = useNavigate();
  const [captureText, setCaptureText] = useState('');
  const [selectedNowId, setSelectedNowId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const buckets = useMemo(
    () => makeBuckets(data.todos, data.runtime.calendarDate, data.runtime.now),
    [data.runtime.calendarDate, data.runtime.now, data.todos],
  );
  const selectedNow = selectedNowId
    ? buckets.open.find((todo) => todo.id === selectedNowId)
    : undefined;
  const now = selectedNow ?? buckets.focus[0];
  const todayQueue = buckets.focus.filter((todo) => todo.id !== now?.id);
  const liveSession = now?.project
    ? data.sessions.find((session) => session.state === 'live' && session.project === now.project)
    : undefined;
  const calendar = formatCalendarDate(data.runtime.calendarDate);

  async function handleCapture(event: React.FormEvent) {
    event.preventDefault();
    const raw = captureText.trim();
    if (!raw || busyKey) return;
    setBusyKey('capture');
    setFeedback(null);
    try {
      await captureWorkItem(raw);
      setCaptureText('');
      setFeedback({ message: 'Saved to Inbox. You can keep moving.', tone: 'ok' });
      reload();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : String(error), tone: 'error' });
    } finally {
      setBusyKey(null);
    }
  }

  async function transition(todo: WBTodo, action: 'start' | 'complete' | 'defer') {
    const key = `${action}:${todo.id}`;
    if (busyKey) return;
    setBusyKey(key);
    setFeedback(null);
    try {
      if (action === 'start') {
        await updateWorkItem(todo.id, moveInputForColumn('doing'));
        setSelectedNowId(todo.id);
        setFeedback({ message: `Now working on “${todo.text}”.`, tone: 'ok' });
      } else if (action === 'complete') {
        await updateWorkItem(todo.id, doneMoveInput());
        if (selectedNowId === todo.id || now?.id === todo.id) setSelectedNowId(null);
        setFeedback({ message: `Completed “${todo.text}”.`, tone: 'ok' });
      } else {
        await updateWorkItem(todo.id, moveInputForColumn('later'));
        if (selectedNowId === todo.id || now?.id === todo.id) setSelectedNowId(null);
        setFeedback({ message: `Moved “${todo.text}” out of today.`, tone: 'ok' });
      }
      reload();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : String(error), tone: 'error' });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="now-first" data-testid="dense-work-demo">
      <div className="nf-grain" aria-hidden />
      <header className="nf-header">
        <Link className="nf-wordmark" to="/" aria-label="Return to current stash board">
          <span className="nf-mark">s</span>
          <span>stash</span>
          <small>today</small>
        </Link>
        <div className="nf-date">
          <span>{calendar.weekday}</span>
          <strong>{calendar.date}</strong>
        </div>
        <Link className="nf-current-link" to="/">Current board <span>↗</span></Link>
      </header>

      <main className="nf-main">
        <form className="nf-capture" onSubmit={handleCapture}>
          <span className="nf-capture-plus" aria-hidden>+</span>
          <label htmlFor="now-first-capture">Capture without sorting</label>
          <input
            id="now-first-capture"
            value={captureText}
            onChange={(event) => setCaptureText(event.target.value)}
            placeholder="Something you don't want to keep in your head…"
            disabled={busyKey === 'capture'}
          />
          <button type="submit" disabled={!captureText.trim() || busyKey !== null}>
            {busyKey === 'capture' ? 'Saving…' : 'Add to Inbox'}
          </button>
          <small><code>#project</code>, <code>!today</code>, and <code>^p1</code> work when you need them.</small>
        </form>

        {feedback && (
          <div className={`nf-feedback ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
            <span aria-hidden>{feedback.tone === 'error' ? '!' : '✓'}</span>
            {feedback.message}
          </div>
        )}

        <div className="nf-primary-grid">
          <section className="nf-now" aria-labelledby="now-heading">
            <div className="nf-section-label">
              <span>01</span>
              <div>
                <h1 id="now-heading">Now</h1>
                <p>Make room for one thing.</p>
              </div>
            </div>

            {now ? (
              <article className="nf-focus-card">
                <div className="nf-focus-topline">
                  <span className={`nf-priority priority-${now.priority}`}>{now.priority}</span>
                  <span>{displayProjectName(now, data.projects)}</span>
                  <span>{scheduleLabel(now, data.runtime.calendarDate)}</span>
                </div>
                <button className="nf-focus-title" type="button" onClick={() => navigate(`/todos/${now.id}`)}>
                  {now.text}
                </button>
                <p className="nf-focus-note">
                  {now.status === 'active'
                    ? 'This is already in motion. Finish it, move it out, or open the full context.'
                    : 'Nothing else needs your attention until you decide what happens here.'}
                </p>
                {liveSession && (
                  <button
                    type="button"
                    className="nf-agent-context"
                    onClick={() => navigate(`/sessions/${liveSession.provider}/${liveSession.id}`)}
                  >
                    <span className="nf-agent-pulse" /> Agent active in {displayProjectName(now, data.projects)}
                    <strong>Open context ↗</strong>
                  </button>
                )}
                <div className="nf-focus-actions">
                  {now.status !== 'active' && (
                    <button
                      className="primary"
                      type="button"
                      onClick={() => transition(now, 'start')}
                      disabled={busyKey !== null}
                    >
                      {busyKey === `start:${now.id}` ? 'Starting…' : 'Start now'}
                    </button>
                  )}
                  <button
                    className="complete"
                    type="button"
                    onClick={() => transition(now, 'complete')}
                    disabled={busyKey !== null}
                  >
                    {busyKey === `complete:${now.id}` ? 'Finishing…' : 'Complete'}
                  </button>
                  <button
                    className="quiet"
                    type="button"
                    onClick={() => transition(now, 'defer')}
                    disabled={busyKey !== null}
                  >
                    {busyKey === `defer:${now.id}` ? 'Moving…' : 'Not today'}
                  </button>
                  <button className="text" type="button" onClick={() => navigate(`/todos/${now.id}`)}>Open details ↗</button>
                </div>
              </article>
            ) : (
              <div className="nf-focus-empty">
                <span aria-hidden>○</span>
                <h2>Nothing has your attention.</h2>
                <p>Choose one item from Inbox, or enjoy the empty space.</p>
                {buckets.inbox[0] && (
                  <button type="button" onClick={() => transition(buckets.inbox[0]!, 'start')} disabled={busyKey !== null}>
                    Start “{buckets.inbox[0].text}”
                  </button>
                )}
              </div>
            )}
          </section>

          <aside className="nf-today" aria-labelledby="today-heading">
            <div className="nf-today-head">
              <div>
                <span>02</span>
                <h2 id="today-heading">Today</h2>
              </div>
              <strong>{todayQueue.length}</strong>
            </div>
            <p className="nf-today-intro">A short runway, not another backlog.</p>
            <div className="nf-today-list">
              {todayQueue.slice(0, 5).map((todo, index) => (
                <article className="nf-today-row" key={todo.id}>
                  <span className="nf-row-index">{String(index + 1).padStart(2, '0')}</span>
                  <button type="button" className="nf-row-title" onClick={() => navigate(`/todos/${todo.id}`)}>
                    {todo.text}
                  </button>
                  <span className="nf-row-meta">{displayProjectName(todo, data.projects)} · {todo.priority}</span>
                  <button
                    type="button"
                    className="nf-make-now"
                    onClick={() => transition(todo, 'start')}
                    disabled={busyKey !== null}
                    aria-label={`Make ${todo.text} the current focus`}
                  >
                    focus
                  </button>
                </article>
              ))}
              {todayQueue.length === 0 && <div className="nf-list-empty">No queue behind Now.</div>}
            </div>
            {todayQueue.length > 5 && <p className="nf-overflow-note">+ {todayQueue.length - 5} more kept out of sight</p>}
          </aside>
        </div>

        <section className="nf-support" aria-label="Supporting commitments">
          <CommitmentPreview
            index="03"
            title="Inbox"
            note="Unsorted thoughts can wait here without competing for attention."
            items={buckets.inbox}
            projects={data.projects}
            calendarDate={data.runtime.calendarDate}
            onOpen={(todo) => navigate(`/todos/${todo.id}`)}
          />
          <CommitmentPreview
            index="04"
            title="Later"
            note="Real commitments, deliberately outside today."
            items={buckets.later}
            projects={data.projects}
            calendarDate={data.runtime.calendarDate}
            onOpen={(todo) => navigate(`/todos/${todo.id}`)}
          />
        </section>
      </main>

      <footer className="nf-footer">
        <span>One thing now. Everything else has a place.</span>
        <span>{buckets.open.length} open commitments · local data</span>
      </footer>
      <style>{denseWorkDemoStyles}</style>
    </div>
  );
}

function CommitmentPreview({
  index,
  title,
  note,
  items,
  projects,
  calendarDate,
  onOpen,
}: {
  index: string;
  title: string;
  note: string;
  items: WBTodo[];
  projects: WBProject[];
  calendarDate: string;
  onOpen: (todo: WBTodo) => void;
}) {
  return (
    <article className="nf-preview">
      <header>
        <span>{index}</span>
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        <strong>{items.length}</strong>
      </header>
      <div className="nf-preview-list">
        {items.slice(0, 3).map((todo) => (
          <button type="button" key={todo.id} onClick={() => onOpen(todo)}>
            <span>{todo.text}</span>
            <small>{displayProjectName(todo, projects)} · {scheduleLabel(todo, calendarDate)}</small>
            <i aria-hidden>↗</i>
          </button>
        ))}
        {items.length === 0 && <div className="nf-preview-empty">Clear.</div>}
      </div>
      {items.length > 3 && <p className="nf-preview-more">{items.length - 3} more, intentionally collapsed</p>}
    </article>
  );
}
