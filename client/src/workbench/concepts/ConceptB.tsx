import { useState } from 'react';
import { CountUp, LiveDot } from '../../components/effects';
import { fmt, type WBData, type WBProject, type WBSession } from '../data';
import { ProgressBar, SessionRow, StatusPill, Topbar, TodoItem } from '../shared';

/**
 * Concept B — Mission Control. 3-pane operations center.
 * Left:   project rail (compact list, totals at bottom)
 * Center: active project hero · features grid · todos
 * Right:  agent stream (terminal feed + token meter) · session history
 */
export function ConceptB({ data }: { data: WBData; reload: () => void }) {
  const { projects, sessions, todos } = data;
  const initial = projects[0]?.id ?? '';
  const [activeId, setActiveId] = useState<string>(initial);
  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  if (!active) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            no projects yet — set <code>projectId</code> on work items
          </div>
        </div>
      </div>
    );
  }

  const projectTodos = todos.filter((t) => t.project === active.id);
  const projectSessions = sessions.filter((s) => s.project === active.id);
  const totalEstimatedTokens = projects.reduce((a, p) => a + p.estimatedTokens, 0);
  const totalEstimatedCost = projects.reduce((a, p) => a + p.estimatedCost, 0);
  const totalLive = sessions.filter((s) => s.state === 'live').length;

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 380px', gap: '1rem', flex: 1, minHeight: 0 }}>
          {/* LEFT: project rail */}
          <div className="surface" style={{ padding: '0.75rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div className="sec-head" style={{ marginBottom: '0.6rem', padding: '0 0.4rem' }}>
              <span className="prompt">&gt;</span> projects
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {projects.map((p) => <ProjectRail key={p.id} p={p} active={p.id === active.id} onSelect={setActiveId} />)}
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border-hair)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <RailFoot label="estimated tokens" value={fmt.k(totalEstimatedTokens)} color="var(--neon-cyan)" />
              <RailFoot label="estimated cost" value={fmt.cost(totalEstimatedCost)} color="var(--neon-green)" />
              <RailFoot label="active sessions" value={String(totalLive)} color="var(--neon-orange)" />
            </div>
          </div>

          {/* CENTER: project detail */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            {/* Hero */}
            <div className="surface" style={{ padding: '1.5rem', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '3rem', filter: 'drop-shadow(0 0 18px var(--neon-cyan))' }}>{active.emoji}</div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 20px rgba(0,255,242,0.4)', lineHeight: 1.1, margin: 0 }}>
                    {active.name}
                  </h2>
                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusPill status={active.status} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>last touched {fmt.ago(active.lastTouched)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 700, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
                    <CountUp to={active.progress} format={(n: number) => Math.round(n) + '%'} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>overall</div>
                </div>
              </div>
              <div style={{ padding: '0.7rem 0.9rem', background: 'rgba(0,255,242,0.05)', border: '1px solid rgba(0,255,242,0.15)', borderLeft: '3px solid var(--neon-cyan)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--neon-cyan)', animation: 'blink 1.4s steps(1) infinite' }}>▶</span>
                <span style={{ color: 'var(--text-primary)' }}>doing:</span> {active.doing}
              </div>
              <ProgressBar value={active.progress} fat />
            </div>

            {/* Features grid */}
            <div className="surface">
              <div className="sec-head">
                <span className="prompt">&gt;</span> features <span className="count">— {active.features.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                {active.features.length === 0 ? (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>no features yet</div>
                ) : active.features.map((f) => (
                  <div key={f.name} style={{ padding: '0.75rem 0.9rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                        <span className={`feat-dot ${f.status}`} />
                        {f.name}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{f.progress}%</div>
                    </div>
                    <ProgressBar value={f.progress} />
                  </div>
                ))}
              </div>
            </div>

            {/* Todos */}
            <div className="surface">
              <div className="sec-head">
                <span className="prompt">&gt;</span> todos <span className="count">— {projectTodos.filter((t) => !t.done).length} open · {projectTodos.filter((t) => t.done).length} done</span>
                <span className="right" style={{ color: 'var(--neon-cyan)', cursor: 'pointer' }}>+ add</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {projectTodos.length === 0 ? (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no todos for this project</div>
                ) : projectTodos.map((t) => <TodoItem key={t.id} t={t} projects={projects} showProject={false} />)}
              </div>
            </div>
          </div>

          {/* RIGHT: live agent stream */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0, minHeight: 0 }}>
            <div className="surface" style={{ padding: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LiveDot color="var(--neon-green)" /> agent stream
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{active.name}</span>
              </div>
              {/* Token meter */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <MeterTile label="estimated tokens" color="var(--neon-cyan)" tint="rgba(0,255,242,0.04)" border="rgba(0,255,242,0.15)">
                  <CountUp to={active.estimatedTokens} format={(n: number) => fmt.k(Math.round(n))} />
                </MeterTile>
                <MeterTile label="estimated cost" color="var(--neon-green)" tint="rgba(48,209,88,0.04)" border="rgba(48,209,88,0.15)">
                  <CountUp to={active.estimatedCost} format={(n: number) => '$' + n.toFixed(2)} />
                </MeterTile>
              </div>
              {/* Terminal feed */}
              <div className="ms-terminal">
                <TerminalFeed active={active} projectSessions={projectSessions} />
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="sec-head">
                <span className="prompt">&gt;</span> session history <span className="count">— {projectSessions.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto', paddingRight: 4 }}>
                {projectSessions.length === 0 ? (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.5rem' }}>no sessions linked to this project</div>
                ) : projectSessions.map((s) => <SessionRow key={s.id} s={s} projects={projects} compact />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{conceptBStyles}</style>
    </div>
  );
}

function ProjectRail({ p, active, onSelect }: { p: WBProject; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button onClick={() => onSelect(p.id)} className={`rail-item ${active ? 'active' : ''}`} type="button" data-testid={`rail-${p.id}`}>
      <span className="rail-emoji">{p.emoji}</span>
      <div className="rail-body">
        <div className="rail-name">{p.name}</div>
        <div className="rail-foot">
          <span className="rail-pct">{p.progress}%</span>
          <span className="rail-meta">{p.todoCount} todo · {p.sessions} sess</span>
        </div>
        <ProgressBar value={p.progress} thin />
      </div>
      {p.status === 'active' && p.estimatedTokens > 0 && <LiveDot color="var(--neon-green)" />}
    </button>
  );
}

function RailFoot({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span>{label}</span><span style={{ color }}>{value}</span>
    </div>
  );
}

function MeterTile({ label, color, tint, border, children }: { label: string; color: string; tint: string; border: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '0.6rem 0.7rem', background: tint, border: `1px solid ${border}`, borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Terminal feed — real recent agent activity for the active project, newest
 * first. Uses WBSession.preview as the message body and WBSession.state to
 * decide tone (live = cyan, idle = purple, done = muted).
 */
function TerminalFeed({ active, projectSessions }: { active: WBProject; projectSessions: WBSession[] }) {
  if (projectSessions.length === 0) {
    return (
      <>
        <div className="terminal-text"><span className="cmd">$</span> sk tail --project={active.name}</div>
        <div className="terminal-text muted">(no agent sessions linked to this project yet)</div>
        <div className="terminal-text muted">start a session in Concept O to begin streaming</div>
      </>
    );
  }
  return (
    <>
      <div className="terminal-text"><span className="cmd">$</span> sk tail --project={active.name}</div>
      {projectSessions.slice(0, 8).map((s) => {
        const ts = new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const colorByState =
          s.state === 'live' ? 'var(--neon-cyan)'
          : s.state === 'idle' ? 'var(--neon-purple)'
          : s.state === 'error' ? 'var(--neon-pink)'
          : 'var(--text-muted)';
        const arrow = s.state === 'done' ? '✓' : s.state === 'error' ? '✕' : '>';
        return (
          <div key={`${s.provider}:${s.id}`} className="terminal-text">
            <span className="muted">[{ts}] </span>
            <span style={{ color: colorByState }}>{arrow}</span>
            {' '}
            <span style={{ color: 'var(--text-secondary)' }}>{s.model || s.tool}</span>
            {' · '}
            <span>{(s.preview || s.title || s.id.slice(0, 12)).replace(/\s+/g, ' ').slice(0, 80)}</span>
          </div>
        );
      })}
    </>
  );
}

const conceptBStyles = `
.rail-item {
  display: grid; grid-template-columns: 24px 1fr auto;
  gap: 0.5rem; align-items: center;
  width: 100%;
  padding: 0.55rem 0.6rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
  font-family: var(--font-body);
  transition: all var(--transition-fast, 0.2s);
}
.rail-item:hover { background: rgba(255,255,255,0.03); border-color: var(--border-hair); }
.rail-item.active {
  background: rgba(0,255,242,0.06);
  border-color: var(--border-glow);
  box-shadow: inset 2px 0 0 var(--neon-cyan);
}
.rail-emoji { font-size: 1.1rem; }
.rail-body { min-width: 0; }
.rail-name {
  font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rail-item.active .rail-name { color: var(--neon-cyan); text-shadow: 0 0 12px rgba(0,255,242,0.5); }
.rail-foot { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-muted); margin-top: 2px; }
.rail-pct { color: var(--text-secondary); font-weight: 600; }

.ms-terminal {
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  padding: 0.75rem 0.85rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.7;
  box-shadow: inset 0 0 25px rgba(0,255,242,0.04);
  max-height: 220px;
  overflow-y: auto;
}
.ms-terminal .terminal-text { white-space: pre-wrap; }
.ms-terminal code {
  background: var(--bg-elevated);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--neon-purple);
}
`;
