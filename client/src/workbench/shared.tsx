import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateWorkItem } from '../api/work-items';
import { CountUp, LiveDot } from '../components/effects';
import { fmt, sessionPath, type WBData, type WBProject, type WBSession, type WBTodo } from './data';
import { reportAsyncError } from './reportAsyncError';

export interface Feature {
  name: string;
  progress: number;
  status: 'done' | 'almost' | 'wip' | 'todo';
}

export function FeatureRow({ f }: { f: Feature }) {
  return (
    <div className="feat-row">
      <div className="feat-name"><span className={`feat-dot ${f.status}`} /> {f.name}</div>
      <div className="feat-pct">{f.progress}%</div>
    </div>
  );
}

export function ProjectCardFull({ p, onClick }: { p: WBProject; onClick?: () => void }) {
  const navigate = useNavigate();
  const openProject = onClick ?? (() => navigate(`/projects/${pathPart(p.id)}`));
  return (
    <div
      className="pcard"
      onClick={openProject}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openProject();
        }
      }}
      title={`Open project ${p.name}`}
    >
      <div className="pcard-head">
        <div className="pcard-emoji">{p.emoji}</div>
        <div className="pcard-titles">
          <div className="pcard-name">{p.name}</div>
        </div>
        <StatusPill status={p.status} />
      </div>

      <div className="pcard-doing">{p.doing}</div>

      <div style={{ marginBottom: '0.8rem' }}>
        <div className="pbar-row">
          <div className="pbar-label">overall</div>
          <div className="pbar-pct">{p.progress}%</div>
        </div>
        <ProgressBar value={p.progress} />
      </div>

      {p.features.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {p.features.map((f) => <FeatureRow key={f.name} f={f} />)}
        </div>
      )}

      <div className="pcard-foot">
        <span className="pcard-chip"><span className="chip-em">💬</span> <strong>{p.sessions}</strong> sessions</span>
        <span className="pcard-chip"><span className="chip-em">✓</span> <strong>{p.todoDone}</strong>/{p.todoCount + p.todoDone}</span>
        <span className="pcard-chip" style={{ marginLeft: 'auto' }}><ModelBadge model={p.lastModel} /></span>
      </div>
    </div>
  );
}

export function StatTile({ label, value, foot, tone, format }: { label: string; value: number | ReactNode; foot?: ReactNode; tone?: 'purple' | 'green' | 'orange'; format?: (n: number) => string }) {
  return (
    <div className={`stat-tile ${tone ?? ''}`}>
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">
        {typeof value === 'number'
          ? <CountUp to={value} duration={1200} format={format ?? ((n: number) => Math.round(n).toLocaleString())} />
          : value}
      </div>
      {foot && <div className="stat-tile-foot">{foot}</div>}
    </div>
  );
}

/** Compact key-value tile used in project detail and review KPIs. */
export function Tile({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div style={{ padding: '0.75rem 0.9rem', background: 'var(--bg-glass)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{k}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: c ?? 'var(--text-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
    </div>
  );
}

export function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="spark">
      {data.map((v, i) => (
        <div
          key={i}
          className={`spark-bar ${i === data.length - 1 ? 'last' : ''}`}
          style={{ height: ((v / max) * 100) + '%' }}
        />
      ))}
    </div>
  );
}

function pathPart(value: string | undefined): string | undefined {
  return value ? encodeURIComponent(value) : undefined;
}

export function Topbar({ data, right, tag }: { data: WBData; right?: ReactNode; tag?: ReactNode }) {
  const navigate = useNavigate();
  const { stats } = data;
  const status_line = tag ?? `> ${stats.projects} projects · ${stats.activeSessions} live · ${fmt.cost(stats.totalEstimatedCost)} estimated cost`;
  return (
    <div className="topbar">
      <div className="topbar-main">
        <button
          type="button"
          className="topbar-brand"
          onClick={() => navigate('/')}
          aria-label="Back to workbench"
        >
          <span className="topbar-logo">🎯</span>
          <span className="topbar-title">stash</span>
          <span className="topbar-tag">{status_line}</span>
        </button>
      </div>
      {right ?? (
        <div className="topbar-stats" data-testid="topbar-stats">
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              {stats.activeSessions}
            </span>
            <span className="tb-stat-label"><LiveDot /> &nbsp; live</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              {fmt.k(stats.totalEstimatedTokens)}
            </span>
            <span className="tb-stat-label">estimated tokens</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              {fmt.cost(stats.totalEstimatedCost)}
            </span>
            <span className="tb-stat-label">estimated cost</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val">
              {stats.todosOpen}
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 4 }}>
                /{stats.todosOpen + stats.todosDone}
              </span>
            </span>
            <span className="tb-stat-label">open todos</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function LoadErrorPanel({
  title,
  endpoint,
  error,
  onRetry,
  compact,
}: {
  title: string;
  endpoint: string;
  error: Error;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className="surface"
      role="alert"
      data-testid="load-error-panel"
      style={{
        padding: compact ? '0.9rem' : '1.5rem',
        borderColor: 'rgba(255,55,95,0.35)',
        boxShadow: '0 0 0 1px rgba(255,55,95,0.08), 0 18px 40px rgba(255,55,95,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? '0.76rem' : '0.9rem', color: 'var(--neon-pink)', fontWeight: 700 }}>
            {title}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6, wordBreak: 'break-word' }}>
            {endpoint}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: compact ? '0.78rem' : '0.9rem', color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            {error.message}
          </div>
        </div>
        {onRetry && (
          <button className="np-btn ghost" type="button" onClick={onRetry} style={{ flexShrink: 0, padding: compact ? '0.35rem 0.7rem' : '0.45rem 0.9rem' }}>
            retry
          </button>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({ value, thin, fat }: { value: number; thin?: boolean; fat?: boolean }) {
  const cls = ['pbar', thin && 'thin', fat && 'fat'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="pbar-fill" style={{ width: value + '%' }} />
    </div>
  );
}

export function ToolBadge({ tool }: { tool: WBSession['tool'] }) {
  const isCodex = tool === 'codex';
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.65rem',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '2px 7px',
      borderRadius: 'var(--radius-pill)',
      color: isCodex ? 'var(--neon-purple)' : 'var(--neon-cyan)',
      border: `1px solid ${isCodex ? 'rgba(191,90,242,0.35)' : 'rgba(0,255,242,0.35)'}`,
      background: isCodex ? 'rgba(191,90,242,0.06)' : 'rgba(0,255,242,0.06)',
    }}>
      {isCodex ? 'codex' : 'claude-code'}
    </span>
  );
}

export function ModelBadge({ model }: { model: string }) {
  const kind = model.startsWith('sonnet') ? 'sonnet'
    : model.startsWith('codex') ? 'codex'
    : model.startsWith('haiku') ? 'haiku'
    : model.startsWith('opus') ? 'opus' : 'sonnet';
  return <span className={`model-badge ${kind}`}>● {model}</span>;
}

export function PriorityBadge({ priority, style }: { priority: WBTodo['priority']; style?: React.CSSProperties }) {
  const label = priority.toUpperCase();
  return (
    <span className={`todo-prio ${priority}`} title={`priority ${label}`} aria-label={`priority ${label}`} style={style}>
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: WBProject['status'] }) {
  const map = {
    active:   { txt: 'active',   dot: 'var(--neon-green)' },
    shipping: { txt: 'shipping', dot: 'var(--neon-orange)' },
    paused:   { txt: 'paused',   dot: 'var(--text-muted)' },
    fresh:    { txt: 'fresh',    dot: 'var(--neon-purple)' },
  } as const;
  const s = map[status] ?? map.active;
  return (
    <span className={`pcard-status ${status}`}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: s.dot, boxShadow: `0 0 6px ${s.dot}` }} />
      {s.txt}
    </span>
  );
}

export function SessionRow({
  s,
  projects,
  compact,
  onClick,
}: {
  s: WBSession;
  projects: WBProject[];
  compact?: boolean;
  onClick?: () => void;
}) {
  const proj = projects.find((p) => p.id === s.project);
  const icon = s.tool === 'codex' ? '$' : '>';
  const navigate = useNavigate();
  const openSession = onClick ?? (() => navigate(sessionPath(s)));
  return (
    <div
      className={`sess ${s.state}`}
      role="button"
      tabIndex={0}
      onClick={openSession}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSession();
        }
      }}
      title={`Open session ${s.title}`}
    >
      <div className="sess-icon" style={{ color: s.tool === 'codex' ? 'var(--neon-purple)' : 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {icon}
      </div>
      <div className="sess-body">
        <div className="sess-meta">
          <span
            style={{
              background: s.state === 'live' ? 'rgba(48,209,88,0.15)'
                : s.state === 'idle' ? 'rgba(160,160,176,0.1)'
                : s.state === 'error' ? 'rgba(255,55,95,0.12)'
                : 'rgba(0,255,242,0.08)',
              color: s.state === 'live' ? 'var(--neon-green)'
                : s.state === 'idle' ? 'var(--text-muted)'
                : s.state === 'error' ? 'var(--neon-pink)'
                : 'var(--neon-cyan)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '1px 6px',
              borderRadius: '4px',
            }}
          >
            {s.state === 'live' ? <><LiveDot color="var(--neon-green)" /> live</> : s.state}
          </span>
          <span>{proj?.emoji} {proj?.name ?? s.project}</span>
          <ModelBadge model={s.model} />
          <span style={{ color: 'var(--text-muted)' }}>· {fmt.ago(s.at)}</span>
        </div>
        <div className="sess-title">{s.title}</div>
        {!compact && <div className="sess-preview">{s.preview}</div>}
      </div>
      <div className="sess-right">
        <div className="sess-tokens">{fmt.k(s.estimatedTokens)} est. tokens</div>
        <div className="sess-cost">${s.estimatedCost.toFixed(2)} est. · {fmt.dur(s.estimatedDuration)} est.</div>
      </div>
    </div>
  );
}

export function TodoItem({
  t,
  projects,
  calendarDate,
  showProject = true,
}: {
  t: WBTodo;
  projects: WBProject[];
  calendarDate: string;
  showProject?: boolean;
}) {
  const proj = projects.find((p) => p.id === t.project);
  const isIdea = t.kind === 'idea';
  const navigate = useNavigate();
  // SPEC v0.3 §3e — inbox rows participate in the triage cursor; gated on real
  // work-item status, not on absence of project (planned items can also lack a project).
  const inboxAttr = t.status === 'inbox' ? { 'data-inbox-item': t.id } : {};
  const nowIso = new Date().toISOString();
  const isToday =
    !t.done &&
    (t.todayPinned ||
      (t.startAt !== undefined && t.startAt <= nowIso) ||
      (t.dueAt !== undefined && t.dueAt < calendarDate) ||
      t.scheduledFor === calendarDate);
  const todayAttr = isToday ? { 'data-today-item': t.id } : {};

  async function toggleDone(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await updateWorkItem(t.id, { status: t.done ? 'planned' : 'done' });
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (error) {
      reportAsyncError('toggle todo completion', error);
    }
  }

  function openDetail(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    navigate(`/todos/${t.id}`);
  }

  return (
    <div
      className={`todo ${t.done ? 'done' : ''} ${isIdea ? 'idea' : ''}`}
      {...inboxAttr}
      {...todayAttr}
      tabIndex={0}
      role="button"
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openDetail(e);
        else if (e.key === ' ' || e.key === 'x') toggleDone(e);
      }}
    >
      <button
        type="button"
        className="todo-check"
        aria-label={t.done ? 'mark not done' : 'mark done'}
        title={t.done ? 'mark not done (Space)' : 'mark done (Space)'}
        onClick={toggleDone}
        data-testid={`todo-check-${t.id}`}
        style={{ background: 'transparent', padding: 0, font: 'inherit' }}
      >
        {!t.done && isIdea && <span style={{ fontSize: 9, color: 'var(--neon-purple)' }}>💡</span>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="todo-text">
          {t.text}
          {t.recurring && <span title="recurring task" style={{ marginLeft: 6, color: 'var(--neon-purple)', fontSize: '0.74rem' }}>🔁</span>}
          {t.reminding && <span title="has a reminder" style={{ marginLeft: 4, color: 'var(--neon-pink)', fontSize: '0.74rem' }}>🔔</span>}
        </div>
        <div className="todo-tags">
          {showProject && proj && <span className="todo-tag proj">#{proj.name}</span>}
          {!proj && !t.done && <span className="todo-tag inbox">#inbox</span>}
          {t.tags.map((tag) => <span key={tag} className="todo-tag">{tag}</span>)}
        </div>
      </div>
      {!t.done && <PriorityBadge priority={t.priority} />}
    </div>
  );
}
