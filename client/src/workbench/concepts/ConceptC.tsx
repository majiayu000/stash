import type { ReactNode } from 'react';
import { CountUp, CursorGlow, LiveDot, ParticleField } from '../../components/effects';
import { fmt, type WBData, type WBProject } from '../data';
import { ModelBadge, ProgressBar, ProjectIcon, StatusPill, Topbar, TodoItem } from '../shared';

/**
 * Concept C — Hero + Stream. One project as cinematic hero, others as a
 * compact strip, right rail is a real agent activity feed (newest first).
 *
 * Backend coverage:
 *   - hero project (workboard.projects[0]): real
 *   - feed lines: real — pulled from `data.sessions` newest-first.
 */
export function ConceptC({ data }: { data: WBData; reload: () => void }) {
  const { projects, todos, sessions } = data;
  const hero = projects[0];

  if (!hero) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            no projects yet
          </div>
        </div>
      </div>
    );
  }

  const others = projects.slice(1);
  const heroTodos = todos.filter((t) => t.project === hero.id && !t.done);

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          {/* LEFT */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
            <CursorGlow color="rgba(0,255,242,0.15)" size={400}>
              <div className="hero-card">
                <ParticleField density={0.0002} color="0, 255, 242" maxLink={80} />
                <div className="hero-inner">
                  <div className="hero-tag">
                    <LiveDot color="var(--neon-green)" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--neon-green)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>focused</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <ProjectIcon icon={hero.emoji} size="4rem" style={{ filter: 'drop-shadow(0 0 22px var(--neon-cyan))', animation: 'pulse 3s ease-in-out infinite' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '2.6rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: '0.4rem', margin: 0 }}>
                        <span style={{ background: 'var(--gradient-logo)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{hero.name}</span>
                      </h1>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>
                        <span style={{ color: 'var(--neon-cyan)', marginRight: 8, animation: 'blink 1s steps(1) infinite' }}>&gt;</span>
                        {hero.doing || <span style={{ color: 'var(--text-muted)' }}>(no active focus — set one via /c/k/{hero.id})</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <StatusPill status={hero.status} />
                        <ModelBadge model={hero.lastModel} />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>overall progress</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                        <CountUp to={hero.progress} format={(n: number) => Math.round(n) + '%'} />
                      </span>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <ProgressBar value={hero.progress} fat />
                      {[25, 50, 75].map((m) => (
                        <div key={m} style={{ position: 'absolute', top: -3, left: m + '%', width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }} />
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <HeroStat label="tokens · 24h" value={fmt.k(hero.tokens24h)} color="var(--neon-cyan)" />
                    <HeroStat label="cost · 24h"   value={'$' + hero.cost24h.toFixed(2)} color="var(--neon-green)" />
                    <HeroStat label="sessions"     value={String(hero.sessions)} color="var(--neon-purple)" />
                    <HeroStat label="open todos"   value={String(hero.todoCount)} color="var(--neon-orange)" />
                    <HeroStat label="last"         value={fmt.ago(hero.lastTouched)} color="var(--text-secondary)" />
                  </div>

                  {hero.features.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {hero.features.map((f) => (
                        <div key={f.name} className="feat-pill">
                          <span className={`feat-dot ${f.status}`} />
                          <span>{f.name}</span>
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{f.progress}%</span>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--bg-elevated)', borderRadius: '0 0 var(--radius-pill) var(--radius-pill)', overflow: 'hidden' }}>
                            <div style={{ width: f.progress + '%', height: '100%', background: f.status === 'done' ? 'var(--neon-green)' : f.status === 'almost' ? 'var(--neon-cyan)' : f.status === 'wip' ? 'var(--neon-orange)' : 'var(--text-muted)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CursorGlow>

            {others.length > 0 && (
              <div>
                <div className="sec-head">
                  <span className="prompt">&gt;</span> other projects <span className="count">— {others.length}</span>
                  <span className="right">click to focus</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
                  {others.slice(0, 5).map((p) => <MiniProjectCard key={p.id} p={p} />)}
                </div>
              </div>
            )}

            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
                <span className="prompt">&gt;</span> {hero.name} · todos <span className="count">— {heroTodos.length} open</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {heroTodos.length === 0
                  ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>(no open todos for this project)</div>
                  : heroTodos.slice(0, 6).map((t) => <TodoItem key={t.id} t={t} projects={projects} showProject={false} />)}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0, minHeight: 0 }}>
            <div className="sec-head" style={{ marginBottom: 0 }}>
              <span className="prompt">&gt;</span> live stream
              <LiveDot color="var(--neon-green)" />
            </div>
            <div className="live-feed">
              {sessions.length === 0 ? (
                <FeedLine ts="--:--" type="info">no agent sessions yet — dispatch one from a todo via "▶ run with"</FeedLine>
              ) : (
                sessions.slice(0, 12).map((s) => {
                  const ts = new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const tone: 'tool' | 'msg' | 'done' =
                    s.state === 'live' ? 'tool'
                    : s.state === 'idle' ? 'msg'
                    : 'done';
                  return (
                    <FeedLine key={`${s.provider}:${s.id}`} ts={ts} type={tone}>
                      <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>{s.provider}</span>
                      {' · '}
                      <span style={{ color: tone === 'done' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {s.title || s.id.slice(0, 12)}
                      </span>
                      {s.preview && (
                        <span style={{ color: 'var(--text-muted)' }}> · {s.preview.replace(/\s+/g, ' ').slice(0, 60)}</span>
                      )}
                    </FeedLine>
                  );
                })
              )}
            </div>

            <div className="surface" style={{ padding: '0.75rem 0.9rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>quick capture</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.7rem', background: 'var(--bg-void)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)' }}>$</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1 }}>
                  press <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '0 5px', fontFamily: 'inherit', fontSize: '0.7rem' }}>c</kbd> anywhere to capture
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 3 }}>⏎</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{conceptCStyles}</style>
    </div>
  );
}

function HeroStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '0.6rem 0.7rem', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function MiniProjectCard({ p }: { p: WBProject }) {
  return (
    <div className="mini-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <ProjectIcon icon={p.emoji} size="1.1rem" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--neon-cyan)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{p.name}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
        {p.doing}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{p.progress}%</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>{p.todoCount}t · {p.sessions}s</span>
      </div>
      <ProgressBar value={p.progress} thin />
    </div>
  );
}

function FeedLine({ ts, type, children }: { ts: string; type: 'ok' | 'warn' | 'info' | 'tool' | 'msg' | 'user' | 'done'; children: ReactNode }) {
  return (
    <div className={`feed-line feed-${type}`}>
      <span className="feed-ts">{ts}</span>
      <span className="feed-msg">{children}</span>
    </div>
  );
}

const conceptCStyles = `
.hero-card {
  position: relative;
  background: linear-gradient(135deg, rgba(0,255,242,0.05), rgba(191,90,242,0.05), rgba(255,0,255,0.03));
  border: 1px solid rgba(0,255,242,0.2);
  border-radius: var(--radius-xl, 16px);
  padding: 2rem;
  overflow: hidden;
  box-shadow:
    0 25px 60px rgba(0,0,0,0.4),
    0 0 40px rgba(0,255,242,0.08),
    inset 0 1px 0 rgba(255,255,255,0.08);
}
.hero-card::before {
  content: '';
  position: absolute;
  inset: -2px;
  background: linear-gradient(90deg, var(--neon-cyan), var(--neon-purple), var(--neon-magenta), var(--neon-cyan));
  background-size: 300% 100%;
  border-radius: var(--radius-xl, 16px);
  z-index: -1;
  opacity: 0.4;
  animation: borderFlow 6s linear infinite;
  filter: blur(8px);
}
@keyframes borderFlow { 0% { background-position: 0% 0; } 100% { background-position: 300% 0; } }
.hero-inner { position: relative; z-index: 1; }
.hero-tag {
  position: absolute; top: 0; right: 0;
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  background: rgba(48,209,88,0.08);
  border: 1px solid rgba(48,209,88,0.3);
  border-radius: var(--radius-pill);
}

.feat-pill {
  position: relative;
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.85rem 0.5rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-primary);
  overflow: hidden;
}

.mini-card {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.75rem 0.85rem;
  transition: all var(--transition-base, 0.25s);
  cursor: pointer;
}
.mini-card:hover {
  border-color: var(--border-glow);
  transform: translateY(-4px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.3), 0 0 20px rgba(0,255,242,0.1);
}

.live-feed {
  flex: 1; min-height: 0;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  padding: 0.85rem 1rem;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  line-height: 1.65;
  overflow-y: auto;
  box-shadow: inset 0 0 30px rgba(0,255,242,0.04);
}
.feed-line {
  display: flex; gap: 0.6rem;
  padding: 2px 0;
  border-left: 2px solid transparent;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
}
.feed-ts { color: var(--text-muted); font-size: 0.66rem; flex-shrink: 0; padding-top: 1px; }
.feed-msg { color: var(--text-secondary); }
.feed-line.feed-ok    { border-left-color: var(--neon-green); }
.feed-line.feed-ok    .feed-msg { color: var(--neon-green); }
.feed-line.feed-warn  { border-left-color: var(--neon-orange); }
.feed-line.feed-warn  .feed-msg { color: var(--neon-orange); }
.feed-line.feed-done  { border-left-color: var(--neon-cyan); }
.feed-line.feed-done  .feed-msg { color: var(--neon-cyan); }
.feed-line.feed-user  { border-left-color: var(--neon-green); }
.feed-line.feed-user  .feed-msg { color: var(--text-primary); font-weight: 500; }
.feed-line.feed-tool  .feed-msg { color: var(--text-muted); }
.feed-line.feed-info  .feed-msg { color: var(--text-muted); }
`;
