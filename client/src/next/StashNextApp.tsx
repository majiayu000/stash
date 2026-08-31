import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { WorkItem } from '@stash/shared';
import { captureWorkItem, getWorkItem, updateWorkItem } from '../api/work-items';
import type { WBData, WBProject, WBTodo } from '../workbench/data';
import {
  buildDailyRecommendations,
  estimatedPlanMinutes,
  isMyDayTodo,
  sortMyDay,
  type DailyRecommendation,
} from './planning';
import { stashNextStyles } from './stash-next.styles';

type NextView = 'my-day' | 'inbox' | 'planned' | 'projects';
type Panel = 'planner' | 'detail' | null;
type Feedback = { tone: 'ok' | 'error'; message: string };

function viewFromPath(pathname: string): NextView {
  if (pathname.startsWith('/next/inbox')) return 'inbox';
  if (pathname.startsWith('/next/planned')) return 'planned';
  if (pathname.startsWith('/next/projects')) return 'projects';
  return 'my-day';
}

function projectLabel(todo: WBTodo, projects: WBProject[]): string | undefined {
  if (!todo.project) return undefined;
  return projects.find((project) => project.id === todo.project)?.name ?? todo.project;
}

function displayDate(value: string | undefined, calendarDate: string): string | undefined {
  if (!value) return undefined;
  const date = value.slice(0, 10);
  if (date < calendarDate) return 'Overdue';
  if (date === calendarDate) return 'Today';
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(parsed);
}

function pageDate(calendarDate: string): { eyebrow: string; title: string } {
  const parsed = new Date(`${calendarDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { eyebrow: 'Today', title: calendarDate };
  return {
    eyebrow: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(parsed),
    title: new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(parsed),
  };
}

export function StashNextApp({ data, reload }: { data: WBData; reload: () => void }) {
  const location = useLocation();
  const view = viewFromPath(location.pathname);
  const [captureText, setCaptureText] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<WorkItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const recommendations = useMemo(
    () => buildDailyRecommendations(data.todos, data.runtime.calendarDate, data.runtime.now),
    [data.runtime.calendarDate, data.runtime.now, data.todos],
  );
  const recommendationById = useMemo(
    () => new Map(recommendations.map((recommendation) => [recommendation.todo.id, recommendation])),
    [recommendations],
  );
  const myDay = useMemo(
    () => sortMyDay(data.todos.filter((todo) => isMyDayTodo(todo, data.runtime.calendarDate))),
    [data.runtime.calendarDate, data.todos],
  );
  const inbox = data.todos.filter((todo) => !todo.done && todo.status === 'inbox');
  const planned = data.todos.filter((todo) =>
    !todo.done
    && todo.status !== 'done'
    && todo.status !== 'dropped'
    && todo.status !== 'inbox'
    && !isMyDayTodo(todo, data.runtime.calendarDate),
  );
  const selectedTodo = selectedTodoId
    ? data.todos.find((todo) => todo.id === selectedTodoId)
    : undefined;

  useEffect(() => {
    if (!selectedTodoId || panel !== 'detail') {
      setDetailItem(null);
      setDetailError(null);
      return;
    }
    let current = true;
    setDetailLoading(true);
    setDetailError(null);
    void getWorkItem(selectedTodoId)
      .then((item) => { if (current) setDetailItem(item); })
      .catch((error: unknown) => {
        if (current) setDetailError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => { if (current) setDetailLoading(false); });
    return () => { current = false; };
  }, [panel, selectedTodoId]);

  function openPlanner() {
    setSelectedPlanIds(new Set(recommendations.map((item) => item.todo.id)));
    setPanel('planner');
  }

  function openTaskPanel(todo: WBTodo) {
    setSelectedTodoId(todo.id);
    setPanel('detail');
  }

  async function handleQuickCapture(event: FormEvent) {
    event.preventDefault();
    const raw = captureText.trim();
    if (!raw || busy) return;
    setBusy('capture');
    setFeedback(null);
    try {
      await captureWorkItem(raw);
      setCaptureText('');
      setFeedback({ tone: 'ok', message: 'Added to Inbox' });
      reload();
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function applyTodoAction(todo: WBTodo, action: 'start' | 'complete' | 'tomorrow') {
    if (busy) return;
    setBusy(`${action}:${todo.id}`);
    setFeedback(null);
    try {
      if (action === 'start') {
        await updateWorkItem(todo.id, { status: 'active', todayPinned: true });
        setFeedback({ tone: 'ok', message: `Started “${todo.text}”` });
      } else if (action === 'complete') {
        await updateWorkItem(todo.id, { status: 'done', todayPinned: false, sortOrder: null });
        setFeedback({ tone: 'ok', message: `Completed “${todo.text}”` });
        setPanel(null);
      } else {
        await updateWorkItem(todo.id, {
          status: 'planned',
          todayPinned: false,
          scheduledForRelative: 'tomorrow',
          sortOrder: null,
        });
        setFeedback({ tone: 'ok', message: `Moved “${todo.text}” to tomorrow` });
        setPanel(null);
      }
      reload();
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function acceptPlan() {
    const plan = recommendations.filter((item) => selectedPlanIds.has(item.todo.id));
    if (plan.length === 0 || busy) return;
    setBusy('plan');
    setFeedback(null);
    let completed = 0;
    let failure: unknown;
    for (const [index, recommendation] of plan.entries()) {
      try {
        await updateWorkItem(recommendation.todo.id, {
          status: recommendation.todo.status === 'active' ? 'active' : 'planned',
          todayPinned: true,
          scheduledForRelative: 'today',
          sortOrder: index + 1,
        });
        completed += 1;
      } catch (error) {
        failure = error;
        break;
      }
    }
    reload();
    if (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setFeedback({
        tone: 'error',
        message: `Planning stopped after ${completed} of ${plan.length} tasks: ${message}`,
      });
    } else {
      setFeedback({ tone: 'ok', message: `${completed} tasks planned for today` });
      setPanel(null);
    }
    setBusy(null);
  }

  return (
    <div className="sn-app" data-testid="stash-next">
      <aside className="sn-sidebar">
        <Link to="/next" className="sn-brand" aria-label="Stash Next My Day">
          <span className="sn-brand-mark">s</span>
          <span>stash</span>
        </Link>
        <nav className="sn-nav" aria-label="Stash Next navigation">
          <NextNavLink to="/next" label="My Day" icon="☀" count={myDay.length} active={view === 'my-day'} />
          <NextNavLink to="/next/inbox" label="Inbox" icon="⌄" count={inbox.length} active={view === 'inbox'} />
          <NextNavLink to="/next/planned" label="Planned" icon="□" count={planned.length} active={view === 'planned'} />
          <NextNavLink to="/next/projects" label="Projects" icon="◫" count={data.projects.length} active={view === 'projects'} />
        </nav>
        <div className="sn-sidebar-note">
          <span>Local and private</span>
          <p>Your tasks stay on this device.</p>
        </div>
        <Link className="sn-old-link" to="/">Open original stash ↗</Link>
      </aside>

      <main className={`sn-content view-${view}`}>
        <div className="sn-sky" aria-hidden><span /><span /></div>
        <header className="sn-mobile-header">
          <Link to="/next" className="sn-brand"><span className="sn-brand-mark">s</span><span>stash</span></Link>
          <nav aria-label="Compact navigation">
            <Link to="/next">Day</Link><Link to="/next/inbox">Inbox</Link><Link to="/next/planned">Planned</Link><Link to="/next/projects">Projects</Link>
          </nav>
        </header>
        <div className="sn-page">
          {view === 'my-day' && (
            <MyDayView
              data={data}
              items={myDay}
              recommendations={recommendations}
              recommendationById={recommendationById}
              captureText={captureText}
              busy={busy}
              onCaptureText={setCaptureText}
              onCapture={handleQuickCapture}
              onOpenPlanner={openPlanner}
              onOpenDetail={openTaskPanel}
              onComplete={(todo) => applyTodoAction(todo, 'complete')}
            />
          )}
          {view === 'inbox' && (
            <SimpleListView
              eyebrow="Unsorted"
              title="Inbox"
              description="Capture first. Decide what it means when you have the attention for it."
              items={inbox}
              data={data}
              empty="Your Inbox is clear."
              captureText={captureText}
              busy={busy}
              onCaptureText={setCaptureText}
              onCapture={handleQuickCapture}
              onOpenDetail={openTaskPanel}
              onComplete={(todo) => applyTodoAction(todo, 'complete')}
            />
          )}
          {view === 'planned' && (
            <SimpleListView
              eyebrow="Beyond today"
              title="Planned"
              description="Upcoming, waiting, and someday work — visible without crowding today."
              items={planned}
              data={data}
              empty="Nothing is waiting beyond today."
              onOpenDetail={openTaskPanel}
              onComplete={(todo) => applyTodoAction(todo, 'complete')}
            />
          )}
          {view === 'projects' && (
            <ProjectsView projects={data.projects} todos={data.todos} onOpenDetail={openTaskPanel} />
          )}
        </div>
      </main>

      {feedback && (
        <div className={`sn-toast ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
          <span>{feedback.tone === 'error' ? '!' : '✓'}</span>{feedback.message}
          <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss message">×</button>
        </div>
      )}

      {panel && <button className="sn-scrim" type="button" onClick={() => setPanel(null)} aria-label="Close panel" />}
      {panel === 'planner' && (
        <PlannerPanel
          recommendations={recommendations}
          selectedIds={selectedPlanIds}
          busy={busy === 'plan'}
          onToggle={(id) => setSelectedPlanIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onAccept={acceptPlan}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'detail' && selectedTodo && (
        <TaskDetailPanel
          todo={selectedTodo}
          item={detailItem}
          loading={detailLoading}
          error={detailError}
          project={projectLabel(selectedTodo, data.projects)}
          calendarDate={data.runtime.calendarDate}
          busy={busy}
          onStart={() => applyTodoAction(selectedTodo, 'start')}
          onComplete={() => applyTodoAction(selectedTodo, 'complete')}
          onTomorrow={() => applyTodoAction(selectedTodo, 'tomorrow')}
          onClose={() => setPanel(null)}
        />
      )}
      <style>{stashNextStyles}</style>
    </div>
  );
}

function NextNavLink({ to, label, icon, count, active }: { to: string; label: string; icon: string; count: number; active: boolean }) {
  return <Link to={to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><i>{icon}</i><span>{label}</span><small>{count}</small></Link>;
}

function MyDayView({
  data,
  items,
  recommendations,
  recommendationById,
  captureText,
  busy,
  onCaptureText,
  onCapture,
  onOpenPlanner,
  onOpenDetail,
  onComplete,
}: {
  data: WBData;
  items: WBTodo[];
  recommendations: DailyRecommendation[];
  recommendationById: Map<string, DailyRecommendation>;
  captureText: string;
  busy: string | null;
  onCaptureText: (value: string) => void;
  onCapture: (event: FormEvent) => void;
  onOpenPlanner: () => void;
  onOpenDetail: (todo: WBTodo) => void;
  onComplete: (todo: WBTodo) => void;
}) {
  const date = pageDate(data.runtime.calendarDate);
  const active = items.find((todo) => todo.status === 'active');
  return (
    <>
      <header className="sn-page-head sn-day-head">
        <div><span>{date.eyebrow}</span><h1>My Day</h1><p>{date.title} · A fresh list for what matters now.</p></div>
        <button type="button" className="sn-suggest-button" onClick={onOpenPlanner}><span>✦</span> Why this order <strong>{recommendations.length}</strong></button>
      </header>
      {active && (
        <button type="button" className="sn-current" onClick={() => onOpenDetail(active)}>
          <span className="sn-current-dot" />
          <small>Continue</small>
          <strong>{active.text}</strong>
          <i>Open ↗</i>
        </button>
      )}
      <CaptureBar value={captureText} busy={busy === 'capture'} onChange={onCaptureText} onSubmit={onCapture} />
      <section className="sn-list" aria-label="My Day tasks">
        {items.map((todo) => (
          <TaskRow
            key={todo.id}
            todo={todo}
            data={data}
            reason={recommendationById.get(todo.id)?.reasons[0]}
            completing={busy === `complete:${todo.id}`}
            onOpen={() => onOpenDetail(todo)}
            onComplete={() => onComplete(todo)}
          />
        ))}
        {items.length === 0 && (
          <div className="sn-empty">
            <span>☀</span><h2>Your day is open.</h2><p>Let stash choose a small, explainable starting plan.</p>
            <button type="button" onClick={onOpenPlanner}>Review suggestions</button>
          </div>
        )}
      </section>
      {items.length > 0 && <p className="sn-list-foot">{items.length} task{items.length === 1 ? '' : 's'} in My Day · Start at the top, or open suggestions to replan.</p>}
    </>
  );
}

function CaptureBar({ value, busy, onChange, onSubmit }: { value: string; busy: boolean; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <form className="sn-capture" onSubmit={onSubmit}>
      <span aria-hidden>＋</span>
      <label htmlFor="stash-next-capture">Add a task</label>
      <input id="stash-next-capture" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Add a task" disabled={busy} />
      <button type="submit" disabled={!value.trim() || busy}>{busy ? 'Adding…' : 'Add'}</button>
    </form>
  );
}

function SimpleListView({ eyebrow, title, description, items, data, empty, captureText, busy, onCaptureText, onCapture, onOpenDetail, onComplete }: {
  eyebrow: string; title: string; description: string; items: WBTodo[]; data: WBData; empty: string;
  captureText?: string; busy?: string | null; onCaptureText?: (value: string) => void; onCapture?: (event: FormEvent) => void;
  onOpenDetail: (todo: WBTodo) => void; onComplete: (todo: WBTodo) => void;
}) {
  return (
    <>
      <header className="sn-page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><strong>{items.length}</strong></header>
      {captureText !== undefined && onCaptureText && onCapture && <CaptureBar value={captureText} busy={busy === 'capture'} onChange={onCaptureText} onSubmit={onCapture} />}
      <section className="sn-list" aria-label={`${title} tasks`}>
        {items.map((todo) => <TaskRow key={todo.id} todo={todo} data={data} completing={busy === `complete:${todo.id}`} onOpen={() => onOpenDetail(todo)} onComplete={() => onComplete(todo)} />)}
        {items.length === 0 && <div className="sn-empty compact"><span>✓</span><h2>{empty}</h2></div>}
      </section>
    </>
  );
}

function TaskRow({ todo, data, reason, completing, onOpen, onComplete }: { todo: WBTodo; data: WBData; reason?: string; completing: boolean; onOpen: () => void; onComplete: () => void }) {
  const project = projectLabel(todo, data.projects);
  const date = displayDate(todo.dueAt ?? todo.scheduledFor, data.runtime.calendarDate);
  return (
    <article className={`sn-task ${todo.status === 'active' ? 'active' : ''}`}>
      <button type="button" className="sn-check" onClick={onComplete} disabled={completing} aria-label={`Complete ${todo.text}`}>{completing ? '…' : ''}</button>
      <button type="button" className="sn-task-body" onClick={onOpen}>
        <strong>{todo.text}</strong>
        <span>{project && <i>{project}</i>}{date && <i className={date === 'Overdue' ? 'overdue' : ''}>{date}</i>}{reason && <i>{reason}</i>}</span>
      </button>
      {(todo.priority === 'p0' || todo.priority === 'p1') && <span className="sn-important" title={`${todo.priority} priority`}>★</span>}
    </article>
  );
}

function ProjectsView({ projects, todos, onOpenDetail }: { projects: WBProject[]; todos: WBTodo[]; onOpenDetail: (todo: WBTodo) => void }) {
  return (
    <>
      <header className="sn-page-head"><div><span>Quiet structure</span><h1>Projects</h1><p>Containers for commitments, not another dashboard.</p></div><strong>{projects.length}</strong></header>
      <section className="sn-projects">
        {projects.map((project) => {
          const open = todos.filter((todo) => !todo.done && todo.project === project.id);
          const next = sortMyDay(open)[0] ?? open[0];
          return (
            <article key={project.id}>
              <span>{project.emoji}</span><div><h2>{project.name}</h2><p>{open.length} open task{open.length === 1 ? '' : 's'}</p></div>
              {next && <button type="button" onClick={() => onOpenDetail(next)}>Next: {next.text}<i>↗</i></button>}
            </article>
          );
        })}
        {projects.length === 0 && <div className="sn-empty compact"><span>◫</span><h2>No projects yet.</h2></div>}
      </section>
    </>
  );
}

function PlannerPanel({ recommendations, selectedIds, busy, onToggle, onAccept, onClose }: {
  recommendations: DailyRecommendation[]; selectedIds: Set<string>; busy: boolean;
  onToggle: (id: string) => void; onAccept: () => void; onClose: () => void;
}) {
  const selected = recommendations.filter((item) => selectedIds.has(item.todo.id));
  return (
    <aside className="sn-panel sn-planner" aria-label="Daily suggestions">
      <header><div><span>✦ Daily suggestions</span><h2>Let’s make today realistic.</h2><p>Chosen from deadlines, active work, priority, and age. Nothing changes until you confirm.</p></div><button type="button" onClick={onClose} aria-label="Close suggestions">×</button></header>
      <div className="sn-plan-summary"><strong>{selected.length}</strong><span>tasks selected</span><strong>{formatMinutes(estimatedPlanMinutes(selected))}</strong><span>estimated focus</span></div>
      <div className="sn-plan-list">
        {recommendations.map((recommendation, index) => (
          <label key={recommendation.todo.id}>
            <input type="checkbox" checked={selectedIds.has(recommendation.todo.id)} onChange={() => onToggle(recommendation.todo.id)} />
            <span className="sn-plan-check">✓</span>
            <span><small>{String(index + 1).padStart(2, '0')}</small><strong>{recommendation.todo.text}</strong><em>{recommendation.reasons.join(' · ')}</em></span>
          </label>
        ))}
        {recommendations.length === 0 && <div className="sn-panel-empty">No eligible tasks need to be pulled into today.</div>}
      </div>
      <footer><button type="button" className="primary" onClick={onAccept} disabled={selected.length === 0 || busy}>{busy ? 'Planning…' : `Plan ${selected.length} tasks`}</button><button type="button" onClick={onClose}>Keep current day</button></footer>
    </aside>
  );
}

function TaskDetailPanel({ todo, item, loading, error, project, calendarDate, busy, onStart, onComplete, onTomorrow, onClose }: {
  todo: WBTodo; item: WorkItem | null; loading: boolean; error: string | null; project?: string; calendarDate: string; busy: string | null;
  onStart: () => void; onComplete: () => void; onTomorrow: () => void; onClose: () => void;
}) {
  return (
    <aside className="sn-panel sn-detail" aria-label="Task details">
      <header><div><span>{project ?? 'Personal task'}</span><h2>{item?.title ?? todo.text}</h2></div><button type="button" onClick={onClose} aria-label="Close task details">×</button></header>
      {loading && <div className="sn-detail-state">Loading details…</div>}
      {error && <div className="sn-detail-state error" role="alert">{error}</div>}
      <section className="sn-detail-actions">
        {todo.status !== 'active' && <button type="button" className="primary" onClick={onStart} disabled={busy !== null}>Start now</button>}
        <button type="button" onClick={onComplete} disabled={busy !== null}>Mark complete</button>
        <button type="button" onClick={onTomorrow} disabled={busy !== null}>Tomorrow</button>
      </section>
      {item?.description && <section className="sn-detail-section"><h3>Notes</h3><p>{item.description}</p></section>}
      {item && item.checklist.length > 0 && <section className="sn-detail-section"><h3>Steps</h3>{item.checklist.map((step) => <div className="sn-step" key={step.id}><span>{step.completed ? '✓' : ''}</span><p>{step.text}</p></div>)}</section>}
      <section className="sn-detail-section sn-properties"><h3>Details</h3><dl><div><dt>Status</dt><dd>{todo.status}</dd></div><div><dt>Priority</dt><dd>{todo.priority}</dd></div>{displayDate(todo.dueAt ?? todo.scheduledFor, calendarDate) && <div><dt>When</dt><dd>{displayDate(todo.dueAt ?? todo.scheduledFor, calendarDate)}</dd></div>}{item?.estimateMinutes && <div><dt>Estimate</dt><dd>{formatMinutes(item.estimateMinutes)}</dd></div>}</dl></section>
      {item && item.labels.length > 0 && <div className="sn-labels">{item.labels.map((label) => <span key={label}>#{label}</span>)}</div>}
    </aside>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
