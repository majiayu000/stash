import { useState } from 'react';
import { CountUp, LiveDot, ParticleField, Typewriter } from '../../components/effects';
import { createWorkItem } from '../../api/work-items';
import type { WBData, WBProject, WBTodo } from '../data';
import { ProgressBar, Topbar, TodoItem } from '../shared';

/**
 * Concept E — Capture & Plan (todo-first).
 *
 * Default dashboard. Hero capture box at the top, 4-column board
 * (Inbox · Today · Doing · Later), right rail with projects + live agent strip.
 */
export function ConceptE({ data, reload }: { data: WBData; reload: () => void }) {
  const { projects, todos, sessions } = data;
  const [submitting, setSubmitting] = useState(false);
  const [captureText, setCaptureText] = useState('');

  const liveProjectIds = new Set(sessions.filter((s) => s.state === 'live').map((s) => s.project));
  const inbox = todos.filter((t) => !t.project && !t.done);
  const doing = todos.filter((t) => t.project && liveProjectIds.has(t.project) && !t.done);
  const today = todos.filter((t) => t.project && !liveProjectIds.has(t.project) && t.due === 'today' && !t.done);
  const later = todos.filter((t) => t.project && !liveProjectIds.has(t.project) && (t.due === 'this-week' || t.due === 'someday') && !t.done);

  async function submitCapture(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = captureText.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await createWorkItem({ title: trimmed, kind: 'idea', status: 'inbox' });
      setCaptureText('');
      reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        {/* HERO — big capture */}
        <div className="capture-hero">
          <ParticleField density={0.00007} color="191, 90, 242" maxLink={100} />
          <div className="capture-hero-inner">
            <form className="capture-row" onSubmit={submitCapture} data-testid="capture-form">
              <span className="capture-prompt">$</span>
              <div className="capture-input" style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={captureText}
                  onChange={(e) => setCaptureText(e.target.value)}
                  placeholder=""
                  data-testid="capture-input"
                  className="capture-real-input"
                  disabled={submitting}
                />
                {!captureText && (
                  <span className="capture-typewriter" aria-hidden>
                    <Typewriter
                      phrases={[
                        'fix oauth callback edge case #aurora !high',
                        'idea: wasm + simd for lexer hot loop',
                        'reply to sam re contract scope',
                        'try voice-to-todo via whisper #idea',
                        'ship haiku-bot v1.2 #haiku-bot !high today',
                      ]}
                      speed={48}
                      pause={1900}
                    />
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="capture-kbd-btn"
                disabled={!captureText.trim() || submitting}
                data-testid="capture-submit"
                title="Save to inbox (Enter)"
              >
                ⏎
              </button>
            </form>
            <div className="capture-hints">
              <span><kbd>#proj</kbd> tag project</span>
              <span><kbd>!</kbd> priority</span>
              <span><kbd>@today</kbd> when</span>
              <span><kbd>💡</kbd> idea, not task</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                <CountUp to={todos.filter((t) => !t.done).length} duration={800} /> open ·{' '}
                <CountUp to={todos.filter((t) => t.done).length} duration={800} /> done ·{' '}
                <CountUp to={inbox.length} duration={800} /> in inbox
              </span>
            </div>
          </div>
        </div>

        {/* Main split: 4-column board + right rail */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', minHeight: 0 }}>
            <BoardCol icon="📥" name="inbox"  tone="orange" hint="ideas & quick captures"     items={inbox}  projects={projects} />
            <BoardCol icon="🌅" name="today"  tone="cyan"   hint="planned for today"          items={today}  projects={projects} />
            <BoardCol icon="🚧" name="doing"  tone="green"  hint="agent is on it right now"   items={doing}  projects={projects} live />
            <BoardCol icon="📅" name="later"  tone="purple" hint="this week · someday"        items={later}  projects={projects} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div className="sec-head" style={{ marginBottom: 0, minWidth: 0, flex: 1 }}>
                <span className="prompt">&gt;</span> projects <span className="count">— {projects.length}</span>
              </div>
              <button className="new-proj-btn" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>+ new</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto', paddingRight: 4 }}>
              {projects.length === 0
                ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no projects yet — set <code>projectId</code> on work items</div>
                : projects.map((p) => <ProjectChipRow key={p.id} p={p} />)}
            </div>
            <div className="surface" style={{ padding: '0.75rem 0.9rem', marginTop: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <LiveDot color="var(--neon-green)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {sessions.filter((s) => s.state === 'live').length} agents live
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {sessions.filter((s) => s.state === 'live').slice(0, 3).map((s) => (
                  <div key={s.id} style={{ marginTop: 6 }}>
                    <span style={{ color: s.tool === 'codex' ? 'var(--neon-purple)' : 'var(--neon-cyan)' }}>
                      {s.tool === 'codex' ? '$' : '>'}
                    </span>{' '}
                    {projects.find((p) => p.id === s.project)?.name ?? s.project} · {s.model}
                    <div style={{ paddingLeft: 14 }}>{s.preview.slice(0, 60)}…</div>
                  </div>
                ))}
                {sessions.filter((s) => s.state === 'live').length === 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>(no live agents)</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{conceptEStyles}</style>
    </div>
  );
}

function BoardCol({ icon, name, tone, hint, items, count, live, projects }: { icon: string; name: string; tone: 'orange' | 'cyan' | 'green' | 'purple'; hint: string; items: WBTodo[]; count?: number; live?: boolean; projects: WBProject[] }) {
  const c = count ?? items.length;
  return (
    <div className={`board-col tone-${tone}`} data-testid={`board-col-${name}`}>
      <div className="board-col-head">
        <span style={{ fontSize: '1rem' }}>{icon}</span>
        <span className="board-col-name">{name}</span>
        {live && <LiveDot color="var(--neon-green)" />}
        <span className="board-col-count">{c}</span>
      </div>
      <div className="board-col-hint">{hint}</div>
      <div className="board-col-body">
        {items.length === 0 ? (
          <div className="board-col-empty">— empty —</div>
        ) : (
          items.map((t) => <TodoItem key={t.id} t={t} projects={projects} />)
        )}
        <button className="todo-add">+ add</button>
      </div>
    </div>
  );
}

function ProjectChipRow({ p }: { p: WBProject }) {
  return (
    <div className="proj-chip">
      <span style={{ fontSize: '1rem' }}>{p.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-cyan)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.name}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)' }}>{p.progress}%</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
          <ProgressBar value={p.progress} thin />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
          <span>{p.todoCount} todo · {p.sessions} sess</span>
          {p.status === 'active' && p.tokens24h > 0 && <LiveDot color="var(--neon-green)" />}
        </div>
      </div>
    </div>
  );
}

const conceptEStyles = `
.capture-hero {
  position: relative;
  background: linear-gradient(135deg, rgba(191,90,242,0.08), rgba(0,255,242,0.05));
  border: 1px solid rgba(191,90,242,0.25);
  border-radius: var(--radius-xl, 16px);
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(191,90,242,0.06);
}
.capture-hero::before {
  content: '';
  position: absolute; inset: -2px;
  background: linear-gradient(90deg, var(--neon-purple), var(--neon-cyan), var(--neon-magenta), var(--neon-purple));
  background-size: 300% 100%;
  border-radius: var(--radius-xl, 16px);
  z-index: -1;
  opacity: 0.5;
  animation: borderFlow 5s linear infinite;
  filter: blur(6px);
}
@keyframes borderFlow {
  0% { background-position: 0% 0; }
  100% { background-position: 300% 0; }
}
.capture-hero-inner { position: relative; z-index: 1; }
.capture-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 30px rgba(0,255,242,0.04);
}
.capture-prompt {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  font-weight: 700;
  font-size: 1.1rem;
  text-shadow: 0 0 10px rgba(0,255,242,0.6);
}
.capture-input { flex: 1; min-width: 0; position: relative; }
.capture-real-input {
  width: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--text-primary);
  caret-color: var(--neon-cyan);
}
.capture-typewriter {
  position: absolute; inset: 0;
  pointer-events: none;
  display: flex; align-items: center;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--text-muted);
}
.capture-kbd-btn {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-primary);
  padding: 4px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-glow);
  border-radius: 4px;
  cursor: pointer;
  transition: all .15s;
}
.capture-kbd-btn:hover:not(:disabled) {
  background: var(--neon-cyan);
  color: var(--bg-void);
  box-shadow: 0 0 16px rgba(0,255,242,0.4);
}
.capture-kbd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.capture-hints {
  display: flex; gap: 1rem; align-items: center;
  margin-top: 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.capture-hints kbd {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.08);
  border: 1px solid rgba(191,90,242,0.2);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.7rem;
  margin-right: 4px;
}

.board-col {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0.85rem;
  display: flex; flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.board-col::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
.board-col.tone-orange::before { background: linear-gradient(90deg, var(--neon-orange), var(--neon-pink)); }
.board-col.tone-cyan::before   { background: linear-gradient(90deg, var(--neon-cyan), var(--neon-blue)); }
.board-col.tone-green::before  { background: var(--gradient-success); }
.board-col.tone-purple::before { background: linear-gradient(90deg, var(--neon-purple), var(--neon-magenta)); }
.board-col-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px; }
.board-col-name {
  font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;
  color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em;
}
.board-col.tone-orange .board-col-name { color: var(--neon-orange); }
.board-col.tone-cyan   .board-col-name { color: var(--neon-cyan); }
.board-col.tone-green  .board-col-name { color: var(--neon-green); }
.board-col.tone-purple .board-col-name { color: var(--neon-purple); }
.board-col-count {
  margin-left: auto;
  font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);
  background: var(--bg-elevated); padding: 1px 7px; border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}
.board-col-hint {
  font-family: var(--font-body); font-size: 0.72rem; color: var(--text-muted);
  margin-bottom: 0.7rem;
}
.board-col-body { display: flex; flex-direction: column; gap: 0.4rem; overflow-y: auto; flex: 1; padding-right: 2px; }
.board-col-empty {
  text-align: center;
  font-family: var(--font-mono); font-size: 0.72rem;
  color: var(--text-muted); padding: 1rem 0; opacity: 0.5;
}
.todo-add {
  background: transparent; border: 1px dashed var(--border-subtle);
  color: var(--text-muted); padding: 0.45rem 0.6rem; border-radius: var(--radius-md);
  font-family: var(--font-mono); font-size: 0.72rem; cursor: pointer;
  transition: all 0.2s; text-align: left;
}
.todo-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); background: rgba(0,255,242,0.04); }

.new-proj-btn {
  background: var(--gradient-primary);
  color: var(--bg-void); border: none;
  padding: 0.4rem 0.9rem; border-radius: var(--radius-pill);
  font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 0 15px rgba(0,255,242,0.3);
}
.new-proj-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,255,242,0.4); }

.proj-chip {
  display: flex; align-items: flex-start; gap: 0.6rem;
  padding: 0.55rem 0.7rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  cursor: pointer; transition: all 0.2s;
}
.proj-chip:hover { border-color: var(--border-glow); transform: translateX(2px); }
`;
