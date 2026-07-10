import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LiveDot } from '../components/effects';
import { fmt, type WBData, type WBProject, type WBSession, type WBTodo } from './data';
import { ModelBadge } from './shared';

function projectName(projects: WBProject[], id: string | null | undefined): string {
  if (!id) return 'inbox';
  return projects.find((p) => p.id === id)?.name ?? id;
}

function doneThisWeek(todos: WBTodo[]): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return todos.filter((t) => t.done && t.completedAt && new Date(t.completedAt).getTime() >= weekAgo).length;
}

export function ConnectedFlow({ data }: { data: WBData }) {
  const navigate = useNavigate();
  const openTodos = data.todos.filter((t) => !t.done);
  const nextTodo = openTodos.find((t) => t.status === 'active')
    ?? openTodos.find((t) => t.todayPinned)
    ?? openTodos[0];
  const activeProject = data.projects.find((p) => p.status === 'active') ?? data.projects[0];
  const recentSession = data.sessions.find((s) => s.state === 'live') ?? data.sessions[0];
  const doneCount = doneThisWeek(data.todos);

  return (
    <section className="connected-flow" aria-label="Connected work view" data-testid="connected-flow">
      <FlowCard
        tone="cyan"
        eyebrow="project"
        title={activeProject?.name ?? 'no project'}
        meta={activeProject ? `${activeProject.progress}% · ${activeProject.todoCount} open` : 'create a project'}
        detail={activeProject?.doing ?? 'no project selected'}
        disabled={!activeProject}
        testId="flow-project"
        onClick={() => activeProject && navigate(`/c/k/${encodeURIComponent(activeProject.id)}`)}
      />
      <FlowCard
        tone="green"
        eyebrow="next todo"
        title={nextTodo?.text ?? 'inbox clear'}
        meta={nextTodo ? `${projectName(data.projects, nextTodo.project)} · ${nextTodo.priority}` : 'nothing open'}
        detail={nextTodo ? (nextTodo.status === 'active' ? 'active work' : nextTodo.todayPinned ? 'today' : nextTodo.status) : 'capture from the prompt'}
        disabled={!nextTodo}
        testId="flow-todo"
        onClick={() => nextTodo && navigate(`/c/l/${encodeURIComponent(nextTodo.id)}`)}
      />
      <FlowCard
        tone="purple"
        eyebrow="session"
        title={recentSession?.title ?? 'no session'}
        meta={recentSession ? `${projectName(data.projects, recentSession.project)} · ${fmt.ago(recentSession.at)}` : 'start from a todo'}
        detail={recentSession ? <SessionMeta session={recentSession} /> : 'agent trace will appear here'}
        disabled={!recentSession}
        testId="flow-session"
        onClick={() => recentSession && navigate(`/c/g/${encodeURIComponent(recentSession.id)}`)}
      />
      <FlowCard
        tone="orange"
        eyebrow="review"
        title={`${doneCount} closed this week`}
        meta={`${data.stats.todosOpen} open · ${data.stats.todosDone} done`}
        detail="weekly progress"
        testId="flow-review"
        onClick={() => navigate('/c/j')}
      />
      <FlowCard
        tone="pink"
        eyebrow="burn"
        title={`${fmt.cost(data.stats.totalEstimatedCost)} estimated`}
        meta={`${fmt.k(data.stats.totalEstimatedTokens)} estimated tokens`}
        detail={`derived from ${data.stats.activeSessions} active sessions`}
        testId="flow-burn"
        onClick={() => navigate('/c/h')}
      />
      <style>{connectedFlowStyles}</style>
    </section>
  );
}

function SessionMeta({ session }: { session: WBSession }) {
  return (
    <span className="flow-session-meta">
      {session.state === 'live' && <LiveDot color="var(--neon-green)" />}
      <ModelBadge model={session.model} />
    </span>
  );
}

function FlowCard({
  eyebrow,
  title,
  meta,
  detail,
  tone,
  disabled,
  testId,
  onClick,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  detail: ReactNode;
  tone: 'cyan' | 'green' | 'purple' | 'orange' | 'pink';
  disabled?: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flow-card tone-${tone}`}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <span className="flow-eyebrow">{eyebrow}</span>
      <span className="flow-title">{title}</span>
      <span className="flow-meta">{meta}</span>
      <span className="flow-detail">{detail}</span>
    </button>
  );
}

const connectedFlowStyles = `
.connected-flow {
  display: grid;
  grid-template-columns: 1.15fr 1.2fr 1.15fr 0.9fr 0.9fr;
  gap: 0.75rem;
  margin: 0 0 1.25rem;
}
.flow-card {
  appearance: none;
  min-width: 0;
  min-height: 118px;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015));
  color: var(--text-primary);
  cursor: pointer;
  display: grid;
  align-content: start;
  gap: 0.35rem;
  padding: 0.9rem;
  text-align: left;
  position: relative;
  overflow: hidden;
  transition: transform 0.16s var(--ease-smooth), border-color 0.16s var(--ease-smooth), box-shadow 0.16s var(--ease-smooth);
}
.flow-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--flow-accent);
  box-shadow: 0 0 18px var(--flow-accent);
}
.flow-card::after {
  content: '>';
  position: absolute;
  right: 0.75rem;
  top: 0.7rem;
  color: var(--flow-accent);
  font-family: var(--font-mono);
  font-weight: 700;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.16s var(--ease-smooth), transform 0.16s var(--ease-smooth);
}
.flow-card:hover:not(:disabled),
.flow-card:focus-visible:not(:disabled) {
  border-color: var(--flow-accent);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--flow-accent) 15%, transparent);
  transform: translateY(-2px);
  outline: none;
}
.flow-card:hover:not(:disabled)::after,
.flow-card:focus-visible:not(:disabled)::after {
  opacity: 1;
  transform: translateX(0);
}
.flow-card:disabled {
  cursor: default;
  opacity: 0.55;
}
.flow-card.tone-cyan { --flow-accent: var(--neon-cyan); }
.flow-card.tone-green { --flow-accent: var(--neon-green); }
.flow-card.tone-purple { --flow-accent: var(--neon-purple); }
.flow-card.tone-orange { --flow-accent: var(--neon-orange); }
.flow-card.tone-pink { --flow-accent: var(--neon-pink); }
.flow-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--flow-accent);
}
.flow-title {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.flow-meta,
.flow-detail {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--text-muted);
}
.flow-detail {
  color: var(--text-secondary);
  margin-top: auto;
}
.flow-session-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
@media (max-width: 1100px) {
  .connected-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .connected-flow { grid-template-columns: 1fr; }
}
`;
