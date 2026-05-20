import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { AgentSessionEvent } from '@stash/shared';
import { getAgentSessionEvents } from '../../api/agent-sessions';
import { LiveDot } from '../../components/effects';
import { fmt, type WBData, type WBSession } from '../data';
import { ModelBadge, Tile, TodoItem, ToolBadge, Topbar } from '../shared';

/**
 * Concept G — Session Detail.
 * Header: project crumb + actions.
 * Left:   transcript (turns + tool calls + diffs).
 * Right:  tokens/cost composition · tool-call summary · files touched · related todos · actions.
 *
 * Backend coverage:
 *   - session metadata: real (WBSession from workbench data adapter)
 *   - related todos:    real (filter by project)
 *   - transcript turns + tool calls + diffs: STUB — Phase 4 will fetch from
 *     /api/agent-sessions/:provider/:id/events. The stub shape mirrors the
 *     workbench design template so the layout doesn't reflow on wire-up.
 */
export function ConceptG({ data }: { data: WBData; reload: () => void }) {
  const { projects, sessions, todos } = data;
  const { detailId: sessionId } = useParams<{ detailId?: string }>();

  const session = sessionId
    ? sessions.find((s) => s.id === sessionId)
    : sessions.find((s) => s.state === 'live') ?? sessions[0];

  // SPEC v0.3 §9d — real session events from /api/agent-sessions/:provider/:id/events.
  const [events, setEvents] = useState<AgentSessionEvent[] | null>(null);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getAgentSessionEvents(session.provider, session.id)
      .then((res) => { if (!cancelled) setEvents(res); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [session?.id, session?.provider]);

  if (!session) {
    const message = sessionId
      ? `session ${sessionId} not found — open /c/g to inspect available sessions`
      : 'no sessions available — start one via Concept O';
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {message}
          </div>
        </div>
      </div>
    );
  }

  const project = projects.find((p) => p.id === session.project);
  const relatedTodos = todos.filter((t) => t.project === session.project).slice(0, 3);

  // Estimated split: 50% input, 11% output, 39% cached.
  const totalTokens = session.tokens || 1;
  const tokensIn = Math.round(totalTokens * 0.5);
  const tokensOut = Math.round(totalTokens * 0.11);
  const tokensCached = totalTokens - tokensIn - tokensOut;

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        {/* Session header */}
        <div className="sd-head">
          <div className="sd-crumb">
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>workbench &nbsp;/&nbsp;</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-cyan)' }}>{project?.emoji} {project?.name ?? session.project}</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>&nbsp;/&nbsp; sessions &nbsp;/&nbsp;</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>{session.id.slice(0, 8)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginTop: '0.4rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.45rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 18px rgba(0,255,242,0.4)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                {session.title || '(untitled session)'}
              </h2>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <span className={`sess-state ${session.state}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4, color: session.state === 'live' ? 'var(--neon-green)' : 'var(--text-muted)', background: session.state === 'live' ? 'rgba(48,209,88,0.12)' : 'var(--bg-elevated)' }}>
                  {session.state === 'live' && <LiveDot color="var(--neon-green)" />} {session.state}
                </span>
                <ToolBadge tool={session.tool} />
                <ModelBadge model={session.model} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {fmt.ago(session.at)} · {fmt.dur(session.duration)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button className="sd-action" type="button">📋 copy</button>
              <button className="sd-action" type="button">⏸ pause</button>
              <button className="sd-action" type="button">⑂ fork</button>
              <button className="sd-action danger" type="button">⏹ kill</button>
            </div>
          </div>
        </div>

        {/* Body: transcript + side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          {/* TRANSCRIPT */}
          <div className="transcript" style={{ minWidth: 0, overflowY: 'auto' }}>
            {events === null ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)', padding: '1rem' }}>loading events…</div>
            ) : events.length === 0 ? (
              <TranscriptSkeleton session={session} />
            ) : (
              <RealTranscript events={events} session={session} />
            )}
          </div>

          {/* SIDE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0, overflowY: 'auto' }}>
            <div className="surface" style={{ padding: '1rem' }}>
              <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
                <span className="prompt">&gt;</span> tokens · cost
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Tile k="in" v={fmt.k(tokensIn)} c="var(--neon-cyan)" />
                <Tile k="out" v={fmt.k(tokensOut)} c="var(--neon-purple)" />
                <Tile k="cached" v={fmt.k(tokensCached)} c="var(--neon-green)" />
                <Tile k="cost" v={'$' + session.cost.toFixed(2)} c="var(--neon-orange)" />
              </div>
              <div style={{ marginTop: '0.7rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>composition</div>
                <div style={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                  <div style={{ width: '50%', background: 'var(--neon-cyan)', boxShadow: '0 0 10px var(--neon-cyan)' }} />
                  <div style={{ width: '11%', background: 'var(--neon-purple)', boxShadow: '0 0 10px var(--neon-purple)' }} />
                  <div style={{ width: '39%', background: 'var(--neon-green)', boxShadow: '0 0 10px var(--neon-green)' }} />
                </div>
              </div>
            </div>

            <ToolCallSummary events={events} />
            <FilesTouched events={events} />

            <div className="surface" style={{ padding: '1rem' }}>
              <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
                <span className="prompt">&gt;</span> related todos
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {relatedTodos.length === 0
                  ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(none)</div>
                  : relatedTodos.map((t) => <TodoItem key={t.id} t={t} projects={projects} />)}
              </div>
            </div>

            <div className="surface" style={{ padding: '1rem' }}>
              <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
                <span className="prompt">&gt;</span> actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="sd-side-btn" type="button">↗ open in {session.tool}</button>
                <button className="sd-side-btn" type="button">⤴ share transcript</button>
                <button className="sd-side-btn" type="button">⤓ export jsonl</button>
                <button className="sd-side-btn" type="button">🔖 save as snippet</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{conceptGStyles}</style>
    </div>
  );
}

/**
 * Stub transcript. Renders the real session.preview as the first user turn,
 * then a deterministic demo trace that matches the design template shape so
 * Phase 4 (real events from /events) drops in without layout reflow.
 */
function TranscriptSkeleton({ session }: { session: WBSession }) {
  return (
    <>
      <Turn kind="user" who="you" at={fmt.ago(session.at)}>
        {session.preview || '(no preview text captured)'}
      </Turn>
      <Turn kind="thinking" at="just now">
        Reading the call sites involved before proposing a change. Phase 4 will stream the live trace from <code>/agent-sessions/{session.tool}/{session.id}/events</code>.
      </Turn>
      <Turn kind="assistant" at="just now">
        <p>Inspecting the surrounding interface and identifying the smallest safe wiring.</p>
      </Turn>
      <ToolCall name="read_file" args="src/auth/oauth.ts" status="ok" lines={84} collapsed />
      <ToolCall name="read_file" args="src/auth/jwt.ts" status="ok" lines={62} collapsed />
      <ToolCall name="edit_file" args="src/auth/session.ts" status="ok" plus={24} minus={3}>
        <Diff lines={[
          { t: 'rem', n: 22, txt: '  const id = crypto.randomUUID();' },
          { t: 'add', n: 22, txt: '  const id = await this.generateId(tenant);' },
          { t: 'add', n: 23, txt: '  const session = new Session(id, jwt, tenant, ttl);' },
          { t: 'ctx', n: 24, txt: '  this.store.set(id, session);' },
          { t: 'add', n: 25, txt: "  this.metrics.inc('session.created', { tenant });" },
          { t: 'ctx', n: 26, txt: '  return session;' },
        ]} />
      </ToolCall>
      <ToolCall name="run_tests" args="--testPathPattern auth" status="warn">
        <pre className="td-code">{`PASS  src/auth/jwt.test.ts (14 tests)
PASS  src/auth/oauth.test.ts (8 tests)
FAIL  src/auth/session.test.ts
  ● rejects expired sessions — Expected 401, got 200`}</pre>
      </ToolCall>
      {session.state === 'live' && (
        <Turn kind="assistant" at="now" pending>
          <p>Investigating the failing assertion…<span className="td-cursor">▎</span></p>
        </Turn>
      )}
    </>
  );
}

function Turn({ kind, who, at, children, pending }: { kind: 'user' | 'assistant' | 'thinking' | 'tool'; who?: string; at: string; children?: ReactNode; pending?: boolean }) {
  const ico = kind === 'user' ? '$' : kind === 'assistant' ? '>' : kind === 'thinking' ? '∿' : '·';
  const color = kind === 'user' ? 'var(--neon-green)' : kind === 'assistant' ? 'var(--neon-cyan)' : kind === 'thinking' ? 'var(--neon-purple)' : 'var(--text-muted)';
  return (
    <div className={`td-turn ${kind} ${pending ? 'pending' : ''}`}>
      <div className="td-turn-icon" style={{ color }}>{ico}</div>
      <div className="td-turn-body">
        <div className="td-turn-meta">
          <span style={{ color, fontWeight: 600 }}>{kind === 'thinking' ? 'thinking' : (who || (kind === 'assistant' ? 'agent' : 'agent'))}</span>
          <span style={{ color: 'var(--text-muted)' }}>· {at}</span>
        </div>
        <div className="td-turn-content">{children}</div>
      </div>
    </div>
  );
}

type DiffLine = { t: 'add' | 'rem' | 'ctx'; n: number; txt: string };

function ToolCall({ name, args, status, lines, plus, minus, collapsed, children }: {
  name: string; args: string; status: 'ok' | 'warn' | 'error';
  lines?: number; plus?: number; minus?: number; collapsed?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsed);
  const statusColor = status === 'ok' ? 'var(--neon-green)' : status === 'warn' ? 'var(--neon-orange)' : 'var(--neon-pink)';
  const statusGlyph = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✕';
  return (
    <div className={`td-tool ${open ? 'open' : ''}`}>
      <button className="td-tool-head" onClick={() => setOpen(!open)} type="button">
        <span className="td-tool-chevron">{open ? '▾' : '▸'}</span>
        <span className="td-tool-name">tool_call</span>
        <span className="td-tool-fn">{name}</span>
        <span className="td-tool-arg">{args}</span>
        <span className="td-tool-status" style={{ color: statusColor }}>{statusGlyph} {status}</span>
        {plus != null && <span style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>+{plus}</span>}
        {minus != null && <span style={{ color: 'var(--neon-pink)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>−{minus}</span>}
        {lines != null && <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{lines} lines</span>}
      </button>
      {open && children && <div className="td-tool-body">{children}</div>}
    </div>
  );
}

function Diff({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="td-diff">
      {lines.map((l, i) => (
        <div key={i} className={`td-diff-line ${l.t}`}>
          <span className="td-diff-gutter">{l.t === 'add' ? '+' : l.t === 'rem' ? '−' : ' '}</span>
          <span className="td-diff-n">{l.n}</span>
          <span className="td-diff-txt">{l.txt}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Real transcript renderer over /events. Maps AgentSessionEvent → existing
 * Turn / ToolCall layout so the design stays intact.
 */
function RealTranscript({ events, session }: { events: AgentSessionEvent[]; session: WBSession }) {
  return (
    <>
      {events.map((e, i) => {
        if (e.kind === 'tool_call') {
          const argPreview = e.meta ? truncateArgs(e.meta) : '';
          return <ToolCall key={i} name={e.tool ?? e.text} args={argPreview} status="ok" />;
        }
        const who = e.kind === 'user' ? 'you' : e.kind === 'assistant' ? 'agent' : e.kind;
        const kind: 'user' | 'assistant' | 'thinking' | 'tool' =
          e.kind === 'user' ? 'user' :
            e.kind === 'assistant' ? 'assistant' :
              e.kind === 'plan' ? 'thinking' : 'tool';
        return (
          <Turn key={i} kind={kind} who={who} at={fmt.ago(new Date(e.timestamp).getTime())}>
            {e.text}
          </Turn>
        );
      })}
      {session.state === 'live' && (
        <Turn kind="assistant" at="now" pending>
          <p>streaming…<span className="td-cursor">▎</span></p>
        </Turn>
      )}
    </>
  );
}

function truncateArgs(meta: Record<string, unknown> | undefined): string {
  if (!meta) return '';
  try {
    const s = JSON.stringify(meta);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  } catch { return ''; }
}

function ToolCallSummary({ events }: { events: AgentSessionEvent[] | null }) {
  const byTool = new Map<string, number>();
  for (const ev of events ?? []) {
    if (ev.kind === 'tool_call' && ev.tool) byTool.set(ev.tool, (byTool.get(ev.tool) ?? 0) + 1);
  }
  const rows = Array.from(byTool.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count], i) => ({ name, count, color: TOOL_COLOR[i % TOOL_COLOR.length]! }));
  const total = Array.from(byTool.values()).reduce((s, n) => s + n, 0);
  return (
    <div className="surface" style={{ padding: '1rem' }}>
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> tool calls <span className="count">— {total}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none recorded yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((t) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
              <span style={{ color: t.color }}>●</span>
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>{t.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>×{t.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TOOL_COLOR = [
  'var(--neon-cyan)', 'var(--neon-purple)', 'var(--neon-orange)',
  'var(--neon-green)', 'var(--neon-pink)', 'var(--text-secondary)',
];

function FilesTouched({ events }: { events: AgentSessionEvent[] | null }) {
  const seen = new Map<string, number>();
  for (const ev of events ?? []) {
    if (ev.kind !== 'tool_call' || !ev.meta) continue;
    const m = ev.meta as Record<string, unknown>;
    const p = pickPath(m);
    if (p) seen.set(p, (seen.get(p) ?? 0) + 1);
  }
  const rows = Array.from(seen.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return (
    <div className="surface" style={{ padding: '1rem' }}>
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> files touched <span className="count">— {rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(([p, count]) => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
              <span style={{ color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</span>
              <span style={{ color: 'var(--text-muted)' }}>×{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function pickPath(meta: Record<string, unknown>): string | undefined {
  for (const k of ['file_path', 'filePath', 'path', 'notebook_path']) {
    const v = meta[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

const conceptGStyles = `
.sd-head {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
}
.sd-crumb { display: flex; align-items: center; }
.sd-action {
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  white-space: nowrap;
}
.sd-action:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
.sd-action.danger:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.sd-side-btn {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  color: var(--text-secondary);
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  text-align: left;
}
.sd-side-btn:hover { border-color: var(--border-glow); color: var(--neon-cyan); background: rgba(0,255,242,0.04); }

.transcript {
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  box-shadow: inset 0 0 30px rgba(0,255,242,0.03);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.65;
  display: flex; flex-direction: column; gap: 0.85rem;
}

.td-turn {
  display: grid; grid-template-columns: 24px 1fr; gap: 0.6rem;
  padding: 0.55rem 0;
  border-left: 2px solid transparent;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
}
.td-turn.thinking { opacity: 0.7; }
.td-turn.thinking .td-turn-body { font-style: italic; color: var(--text-secondary); }
.td-turn.pending { border-left-color: var(--neon-cyan); background: rgba(0,255,242,0.03); }
.td-turn-icon {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.95rem;
  padding-top: 1px;
}
.td-turn-meta {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  margin-bottom: 4px;
  text-transform: lowercase;
}
.td-turn-content { color: var(--text-secondary); }
.td-turn-content p { margin: 0; margin-bottom: 0.4rem; font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; }
.td-turn-content p:last-child { margin-bottom: 0; }
.td-turn-content code {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.8rem;
}
.td-cursor {
  display: inline-block;
  color: var(--neon-cyan);
  animation: blink 1s steps(1) infinite;
}

.td-code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-cyan);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.85rem;
  margin: 0.4rem 0;
  color: var(--neon-green);
  overflow-x: auto;
  white-space: pre;
  line-height: 1.55;
}

.td-tool {
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(191,90,242,0.03);
  overflow: hidden;
}
.td-tool.open { border-color: rgba(191,90,242,0.25); }
.td-tool-head {
  width: 100%;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
}
.td-tool-head:hover { background: rgba(191,90,242,0.05); }
.td-tool-chevron { color: var(--text-muted); font-size: 0.7rem; }
.td-tool-name { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.62rem; }
.td-tool-fn { color: var(--neon-purple); font-weight: 600; }
.td-tool-arg {
  color: var(--text-primary);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.td-tool-status { margin-left: auto; font-weight: 600; white-space: nowrap; }
.td-tool-body { padding: 0 0.75rem 0.75rem; }

.td-diff {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.td-diff-line { display: grid; grid-template-columns: 18px 38px 1fr; padding: 1px 0; }
.td-diff-line.add { background: rgba(48,209,88,0.07); }
.td-diff-line.rem { background: rgba(255,55,95,0.07); }
.td-diff-gutter { text-align: center; font-weight: 700; }
.td-diff-line.add .td-diff-gutter { color: var(--neon-green); }
.td-diff-line.rem .td-diff-gutter { color: var(--neon-pink); }
.td-diff-line.ctx .td-diff-gutter { color: var(--text-muted); }
.td-diff-n { color: var(--text-muted); text-align: right; padding-right: 8px; }
.td-diff-txt { white-space: pre; color: var(--text-primary); }
.td-diff-line.ctx .td-diff-txt { color: var(--text-secondary); }
`;
