import type { ReactNode } from 'react';
import { CountUp, LiveDot, Typewriter } from '../components/effects';
import { fmt, type WBData, type WBProject, type WBSession, type WBTodo } from './data';

export function Topbar({ data, right }: { data: WBData; right?: ReactNode }) {
  const { stats } = data;
  return (
    <div className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">🎯</span>
        <span className="topbar-title">stash</span>
        <span className="topbar-tag">
          <Typewriter
            phrases={[
              `> ${stats.projects} projects · ${stats.activeSessions} live sessions`,
              `> ${fmt.k(stats.totalTokens24h)} tokens spent today`,
              `> ${fmt.cost(stats.totalCost24h)} burn`,
              '> claude-code + codex monitor',
            ]}
            speed={45}
            pause={2200}
          />
        </span>
      </div>
      {right ?? (
        <div className="topbar-stats">
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              <CountUp to={stats.activeSessions} duration={1000} />
            </span>
            <span className="tb-stat-label"><LiveDot /> &nbsp; live</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              <CountUp to={stats.totalTokens24h} duration={1500} format={(n: number) => fmt.k(Math.round(n))} />
            </span>
            <span className="tb-stat-label">tokens · 24h</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              <CountUp to={stats.totalCost24h} duration={1500} format={(n: number) => '$' + n.toFixed(2)} />
            </span>
            <span className="tb-stat-label">cost · 24h</span>
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

export function ProgressBar({ value, thin, fat }: { value: number; thin?: boolean; fat?: boolean }) {
  const cls = ['pbar', thin && 'thin', fat && 'fat'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="pbar-fill" style={{ width: value + '%' }} />
    </div>
  );
}

export function ModelBadge({ model }: { model: string }) {
  const kind = model.startsWith('sonnet') ? 'sonnet'
    : model.startsWith('codex') ? 'codex'
    : model.startsWith('haiku') ? 'haiku'
    : model.startsWith('opus') ? 'opus' : 'sonnet';
  return <span className={`model-badge ${kind}`}>● {model}</span>;
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

export function SessionRow({ s, projects, compact }: { s: WBSession; projects: WBProject[]; compact?: boolean }) {
  const proj = projects.find((p) => p.id === s.project);
  const icon = s.tool === 'codex' ? '$' : '>';
  return (
    <div className={`sess ${s.state}`}>
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
        <div className="sess-tokens">{fmt.k(s.tokens)}</div>
        <div className="sess-cost">${s.cost.toFixed(2)} · {fmt.dur(s.duration)}</div>
      </div>
    </div>
  );
}

export function TodoItem({ t, projects, showProject = true }: { t: WBTodo; projects: WBProject[]; showProject?: boolean }) {
  const proj = projects.find((p) => p.id === t.project);
  const isIdea = t.kind === 'idea';
  return (
    <div className={`todo ${t.done ? 'done' : ''} ${isIdea ? 'idea' : ''}`}>
      <div className="todo-check">
        {isIdea && !t.done && <span style={{ fontSize: 9, color: 'var(--neon-purple)' }}>💡</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="todo-text">{t.text}</div>
        <div className="todo-tags">
          {showProject && proj && <span className="todo-tag proj">#{proj.name}</span>}
          {!proj && !t.done && <span className="todo-tag inbox">#inbox</span>}
          {t.tags.map((tag) => <span key={tag} className="todo-tag">{tag}</span>)}
        </div>
      </div>
      {!t.done && (
        <span className={`todo-prio ${t.priority}`}>
          {t.priority === 'high' ? '!!' : t.priority === 'med' ? '!' : '·'}
        </span>
      )}
    </div>
  );
}
