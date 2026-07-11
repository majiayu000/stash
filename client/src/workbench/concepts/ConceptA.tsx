import { useEffect, useState } from 'react';
import type { BurnSnapshot } from '@stash/shared';
import { CursorGlow, LiveDot, ParticleField } from '../../components/effects';
import { getBurnSnapshot } from '../../api/analytics';
import { createWorkItem } from '../../api/work-items';
import { fmt, type WBData } from '../data';
import { reportAsyncError } from '../reportAsyncError';
import { ProjectCardFull, SessionRow, Sparkline, StatTile, Topbar, TodoItem } from '../shared';

const MODEL_COLORS = ['var(--neon-cyan)', 'var(--neon-purple)', 'var(--neon-green)', 'var(--neon-orange)', 'var(--neon-pink)'];

/**
 * Concept A — Card Wall. Pinterest-style grid of project cards on the left,
 * right rail with live sessions / quick capture / inbox / open todos.
 * Top strip: 4 KPI stat-tiles + a model-mix tile with sparkline.
 *
 * Data: model mix + token sparkline derived from /api/analytics/burn.
 */
export function ConceptA({ data, reload }: { data: WBData; reload: () => void }) {
  const { projects, sessions, todos, stats } = data;
  const liveSessions = sessions.filter((s) => s.state === 'live');
  const inboxTodos = todos.filter((t) => !t.project && !t.done);
  const openTodos = todos.filter((t) => !t.done);

  const [burn, setBurn] = useState<BurnSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function loadBurn() {
      try {
        const snapshot = await getBurnSnapshot(12);
        if (!cancelled) setBurn(snapshot);
      } catch (error) {
        if (!cancelled) reportAsyncError('load card wall analytics', error, loadBurn);
      }
    }
    void loadBurn();
    return () => { cancelled = true; };
  }, []);

  const totalTokens = burn?.totals.tokens ?? 0;
  const modelMix = (burn?.modelMix ?? []).slice(0, 4).map((m, i) => ({
    model: m.model,
    pct: Math.round(m.share * 100),
    color: MODEL_COLORS[i % MODEL_COLORS.length]!,
  }));
  const tokenSpark = (burn?.dailySpend ?? []).map((d) => d.tokens);

  const [captureText, setCaptureText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function capture(title: string) {
    setSubmitting(true);
    try {
      await createWorkItem({ title, kind: 'idea', status: 'inbox' });
      setCaptureText('');
      reload();
    } catch (error) {
      reportAsyncError('capture work item', error, () => capture(title));
    } finally {
      setSubmitting(false);
    }
  }

  function submitCapture(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = captureText.trim();
    if (!trimmed || submitting) return;
    void capture(trimmed);
  }

  return (
    <div className="dashboard-canvas">
      <ParticleField density={0.00005} color="0, 255, 242" />
      <CursorGlow color="rgba(0,255,242,0.10)" size={320}>
        <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
          <Topbar data={data} />

          {/* Top strip: stats + sparkline */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1.6fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <StatTile label="active sessions" value={stats.activeSessions} foot={<span><span className="up">●</span> {liveSessions.length} streaming</span>} />
            <StatTile label="estimated tokens" tone="purple" value={stats.totalEstimatedTokens} format={(n: number) => fmt.k(Math.round(n))} foot={<span>derived from activity counts</span>} />
            <StatTile label="estimated cost" tone="green" value={stats.totalEstimatedCost} format={(n: number) => '$' + n.toFixed(2)} foot={<span>derived from activity counts</span>} />
            <StatTile label="projects" tone="orange" value={stats.projects} foot={<span>{projects.filter((p) => p.status === 'active').length} active · {projects.filter((p) => p.status === 'paused').length} paused</span>} />
            <div className="stat-tile" style={{ paddingBottom: '0.8rem' }}>
              <div className="stat-tile-label">model mix · 24h</div>
              <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-end', marginTop: '0.55rem' }}>
                {modelMix.map((m) => (
                  <div key={m.model} style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>
                      <span>{m.model}</span><span style={{ color: m.color }}>{m.pct}%</span>
                    </div>
                    <div className="pbar thin">
                      <div className="pbar-fill" style={{ width: m.pct + '%', background: m.color, boxShadow: `0 0 10px ${m.color}` }} />
                    </div>
                  </div>
                ))}
              </div>
              <Sparkline data={tokenSpark} />
            </div>
          </div>

          {/* Main two-col */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem', flex: 1, minHeight: 0 }}>
            {/* Project wall */}
            <div style={{ minWidth: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
              <div className="sec-head">
                <span className="prompt">&gt;</span> projects <span className="count">— {projects.length}</span>
                <span className="right" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <span>sort: last touched · filter: all</span>
                  <button className="new-proj-btn" type="button">+ new project</button>
                </span>
              </div>
              {projects.length === 0 ? (
                <div className="surface" style={{ padding: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  no projects yet. set <code>projectId</code> on a work item to create one.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  {projects.map((p, i) => (
                    <div key={p.id} style={{ animation: `cardFadeIn 0.5s var(--ease-smooth, ease) ${i * 60}ms both` }}>
                      <ProjectCardFull p={p} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right rail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
              <div style={{ flex: '0 0 auto' }}>
                <div className="sec-head">
                  <span className="prompt">&gt;</span> live now <LiveDot color="var(--neon-green)" /> <span className="count">— {liveSessions.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {liveSessions.length === 0
                    ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(no live agents)</div>
                    : liveSessions.map((s) => <SessionRow key={s.id} s={s} projects={projects} compact />)}
                </div>
              </div>

              <div style={{ flex: '0 0 auto' }}>
                <div className="sec-head"><span className="prompt">&gt;</span> quick capture</div>
                <form
                  onSubmit={submitCapture}
                  data-testid="ca-capture-form"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.75rem', background: 'var(--bg-void)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-md)', boxShadow: 'inset 0 0 20px rgba(0,255,242,0.04)' }}
                >
                  <span style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>$</span>
                  <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                    <input
                      type="text"
                      value={captureText}
                      onChange={(e) => setCaptureText(e.target.value)}
                      disabled={submitting}
                      data-testid="ca-capture-input"
                      style={{ width: '100%', background: 'transparent', border: 0, outline: 0, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
                    />
                    {!captureText && (
                      <span aria-hidden style={{ position: 'absolute', inset: 0, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                        fix rate limit edge case #aurora
                      </span>
                    )}
                  </div>
                  <button type="submit" disabled={!captureText.trim() || submitting} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 3, border: '1px solid var(--border-hair)', cursor: 'pointer' }}>⏎</button>
                </form>
              </div>

              <div style={{ flex: '0 0 auto' }}>
                <div className="sec-head"><span className="prompt">&gt;</span> 📥 inbox <span className="count">— {inboxTodos.length} ideas</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {inboxTodos.length === 0
                    ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(empty)</div>
                    : inboxTodos.slice(0, 4).map((t) => <TodoItem key={t.id} t={t} projects={projects} />)}
                </div>
              </div>

              <div style={{ flex: '0 0 auto' }}>
                <div className="sec-head">
                  <span className="prompt">&gt;</span> open todos <span className="count">— {openTodos.length}</span>
                  <span className="right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--neon-cyan)', cursor: 'pointer' }}>+ new</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {openTodos.length === 0
                    ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(no open todos)</div>
                    : openTodos.slice(0, 4).map((t) => <TodoItem key={t.id} t={t} projects={projects} />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CursorGlow>
    </div>
  );
}
