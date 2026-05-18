import { useEffect, useState } from 'react';
import type { Budget, BurnSnapshot, ProjectBurnRow } from '@stash/shared';
import { getBurnSnapshot } from '../../api/analytics';
import { listBudgets } from '../../api/budgets';
import { CountUp } from '../../components/effects';
import { fmt, type WBData } from '../data';
import { StatTile, Topbar } from '../shared';

/**
 * Concept H — Cost & Burn Analytics.
 * 4 KPI tiles + grid:
 *   left:  daily spend chart · per-project leaderboard · hourly heatmap
 *   right: model donut · budgets · alerts
 *
 * Daily spend / heatmap / model mix / leaderboard pull from /api/analytics/burn.
 * Budgets + alerts are still mock — no settings/alerting backend yet.
 */
const MODEL_PALETTE = [
  'var(--neon-cyan)',
  'var(--neon-purple)',
  'var(--neon-green)',
  'var(--neon-orange)',
  'var(--neon-pink)',
];

export function ConceptH({ data }: { data: WBData; reload: () => void }) {
  const [snap, setSnap] = useState<BurnSnapshot | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listBudgets().then((rows) => { if (!cancelled) setBudgets(rows); }).catch(() => {});
    function onChange() { listBudgets().then((rows) => { if (!cancelled) setBudgets(rows); }).catch(() => {}); }
    window.addEventListener('stash:captured', onChange);
    return () => { cancelled = true; window.removeEventListener('stash:captured', onChange); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getBurnSnapshot(30)
      .then((s) => { if (!cancelled) { setSnap(s); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="dashboard-canvas">
        <div className="inner"><Topbar data={data} /><div style={{ padding: '4rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>loading analytics…</div></div>
      </div>
    );
  }
  if (!snap || snap.dailySpend.every((d) => d.cost === 0)) {
    return (
      <div className="dashboard-canvas">
        <div className="inner">
          <Topbar data={data} />
          <div style={{ padding: '4rem 2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.7rem', opacity: 0.5 }}>📊</div>
            no usage data yet — analytics will appear once Claude/Codex sessions log token usage.
          </div>
        </div>
      </div>
    );
  }

  const dailyCosts = snap.dailySpend.map((d) => d.cost);
  const monthTotal = snap.totals.cost;
  const lastWeek = dailyCosts.slice(-7).reduce((a, b) => a + b, 0);
  const prevWeek = dailyCosts.slice(-14, -7).reduce((a, b) => a + b, 0);
  const wow = prevWeek === 0 ? 0 : ((lastWeek - prevWeek) / prevWeek) * 100;
  const heatFlat = flattenHeatmap(snap.hourlyHeatmap);
  const modelMix = snap.modelMix.map((m, i) => ({ ...m, color: MODEL_PALETTE[i % MODEL_PALETTE.length]! }));
  const totalTokens7d = sumTail(snap.dailySpend.map((d) => d.tokens), 7);
  const cost24h = dailyCosts[dailyCosts.length - 1] ?? 0;
  const avgSessionTokens = snap.totals.sessions > 0 ? Math.round(snap.totals.tokens / snap.totals.sessions) : 0;

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        {/* Top KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="surface" style={{ padding: '1.2rem 1.4rem' }}>
            <div className="stat-tile-label">this month · spend</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginTop: '0.4rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.6rem', fontWeight: 700, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                <CountUp to={monthTotal} duration={1400} format={(n: number) => '$' + n.toFixed(2)} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: wow > 0 ? 'var(--neon-pink)' : 'var(--neon-green)' }}>
                {wow > 0 ? '↑' : '↓'} {Math.abs(wow).toFixed(0)}% w/w
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              projected month: <span style={{ color: 'var(--neon-orange)' }}>${(monthTotal * 1.3).toFixed(2)}</span> · budget <span style={{ color: 'var(--text-secondary)' }}>$100.00</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', marginTop: '0.5rem', position: 'relative' }}>
              <div style={{ width: Math.min(100, (monthTotal / 100) * 100) + '%', height: '100%', background: 'var(--gradient-primary)', boxShadow: '0 0 12px var(--neon-cyan)' }} />
              <div style={{ position: 'absolute', top: -4, left: '84%', width: 1, height: 14, background: 'var(--neon-orange)' }} />
            </div>
          </div>

          <StatTile label="tokens · 7d" tone="purple" value={totalTokens7d} format={(n: number) => fmt.k(Math.round(n))} foot={<span>across {snap.totals.sessions} sessions</span>} />
          <StatTile label="cost · 24h"  tone="green"  value={cost24h}       format={(n: number) => '$' + n.toFixed(2)} foot={<span>this week <span className="up">${lastWeek.toFixed(2)}</span></span>} />
          <StatTile label="avg session" tone="orange" value={avgSessionTokens} format={(n: number) => fmt.k(Math.round(n)) + ' tok'} foot={<span>over all sessions</span>} />
        </div>

        {/* Charts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> daily spend <span className="count">— last 30 days</span>
                <span className="right">$ usd</span>
              </div>
              <DailySpendChart data={dailyCosts} />
            </div>

            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> per-project · last 30d
              </div>
              {snap.perProjectLeaderboard.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no per-project usage yet</div>
              ) : (
                <Leaderboard rows={snap.perProjectLeaderboard} />
              )}
            </div>

            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> activity heatmap <span className="count">— last 7 days, hourly</span>
              </div>
              <Heatmap data={heatFlat} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> by model · last 30d
              </div>
              <ModelDonut mix={modelMix} totalTokens={snap.totals.tokens} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: '1rem' }}>
                {modelMix.map((m) => (
                  <div key={m.model} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
                    <span style={{ color: m.color }}>●</span>
                    <span style={{ color: 'var(--text-primary)' }}>{m.model}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmt.k(Math.round(m.tokens))}</span>
                    <span style={{ color: m.color, fontWeight: 600 }}>${m.cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> budgets <span className="count">— {budgets.length}</span>
                <span className="right" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>edit in settings</span>
              </div>
              {budgets.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  no budgets yet. set one in <code>settings → 💰 budgets</code>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {budgets.map((b) => (
                    <BudgetRow
                      key={b.id}
                      b={b}
                      used={spendForScope(b, snap?.perProjectLeaderboard ?? [], data.projects)}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <style>{conceptHStyles}</style>
    </div>
  );
}

function flattenHeatmap(grid: number[][]): number[] {
  let peak = 1;
  for (const row of grid) for (const v of row) if (v > peak) peak = v;
  const out: number[] = [];
  for (const row of grid) for (const v of row) out.push(v / peak);
  return out;
}

function sumTail(arr: number[], n: number): number {
  return arr.slice(-n).reduce((a, b) => a + b, 0);
}

function DailySpendChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 0.001);
  return (
    <div className="dsc">
      <div className="dsc-bars">
        {data.map((v, i) => {
          const isToday = i === data.length - 1;
          return (
            <div key={i} className={`dsc-bar ${isToday ? 'today' : ''}`} style={{ height: ((v / max) * 100) + '%' }} title={'$' + v.toFixed(2)}>
              <span className="dsc-bar-label">${v.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <div className="dsc-axis">
        <span>−30d</span><span>−20d</span><span>−10d</span><span style={{ color: 'var(--neon-cyan)' }}>today</span>
      </div>
    </div>
  );
}

interface LeaderRow { projectId: string; projectName: string; tokens: number; cost: number; sessions: number; share: number }
function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const maxT = Math.max(...rows.map((r) => r.tokens), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {rows.map((p, i) => (
        <div key={p.projectId} style={{ display: 'grid', gridTemplateColumns: '24px 130px 1fr 80px 60px', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: i === 0 ? 'var(--neon-orange)' : i === 1 ? 'var(--text-secondary)' : i === 2 ? '#cd7f32' : 'var(--text-muted)', fontWeight: 700, textAlign: 'center' }}>
            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--neon-cyan)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.projectName}
          </span>
          <div className="pbar"><div className="pbar-fill" style={{ width: ((p.tokens / maxT) * 100) + '%' }} /></div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt.k(p.tokens)}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--neon-green)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${p.cost.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ data }: { data: number[] }) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return (
    <div className="hm">
      <div className="hm-rows">
        {days.map((d, di) => (
          <div key={d} className="hm-row">
            <span className="hm-day">{d}</span>
            <div className="hm-cells">
              {Array.from({ length: 24 }).map((_, hi) => {
                const v = data[di * 24 + hi] ?? 0;
                return <div key={hi} className="hm-cell" style={{ background: `rgba(0,255,242,${v})`, boxShadow: v > 0.6 ? '0 0 8px rgba(0,255,242,0.4)' : 'none' }} title={`${d} ${hi}:00 — ${(v * 100).toFixed(0)}%`} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="hm-axis">
        <span></span>
        <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
      </div>
    </div>
  );
}

function ModelDonut({ mix, totalTokens }: { mix: { model: string; share: number; color: string }[]; totalTokens: number }) {
  const R = 56, C = 70;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <svg width={C * 2} height={C * 2}>
        {mix.map((s, i) => {
          const len = circ * s.share;
          const seg = (
            <circle key={i} cx={C} cy={C} r={R} fill="none"
              stroke={s.color} strokeWidth="16"
              strokeDasharray={`${len} ${circ}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${C} ${C})`}
              style={{ filter: `drop-shadow(0 0 8px ${s.color})` }}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{fmt.k(totalTokens)}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>tokens · 30d</div>
      </div>
    </div>
  );
}

/**
 * v0.9 — given a budget scope and the burn snapshot's per-project leaderboard,
 * compute how much has been spent against that scope. Scope === 'all' aggregates
 * the entire snapshot; otherwise it matches against the project name in the
 * leaderboard (which the BurnService resolves via AreaService.get).
 */
function spendForScope(b: Budget, leaderboard: ProjectBurnRow[], _projects: WBData['projects']): number {
  if (b.scope.toLowerCase() === 'all') {
    return leaderboard.reduce((sum, r) => sum + r.cost, 0);
  }
  const match = leaderboard.find((r) => r.projectName.toLowerCase() === b.scope.toLowerCase());
  return match?.cost ?? 0;
}

function BudgetRow({ b, used }: { b: Budget; used: number }) {
  const pct = b.capUsd > 0 ? (used / b.capUsd) * 100 : 0;
  const over = pct > 100;
  const warn = pct > 75;
  const color = over ? 'var(--neon-pink)' : warn ? 'var(--neon-orange)' : 'var(--neon-cyan)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{b.scope} <span style={{ color: 'var(--text-muted)' }}>· {b.period}</span></span>
        <span style={{ color: over ? 'var(--neon-pink)' : warn ? 'var(--neon-orange)' : 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${used.toFixed(2)}</span> / ${b.capUsd.toFixed(2)} <span>· {pct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="pbar thin">
        <div className="pbar-fill" style={{
          width: Math.min(100, pct) + '%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }} />
      </div>
    </div>
  );
}

const conceptHStyles = `
.dsc { display: flex; flex-direction: column; gap: 0.4rem; }
.dsc-bars {
  display: flex; align-items: flex-end; gap: 3px;
  height: 140px;
  padding-top: 1.2rem;
}
.dsc-bar {
  flex: 1; min-width: 3px;
  background: linear-gradient(to top, var(--neon-cyan), var(--neon-purple));
  border-radius: 2px 2px 0 0;
  opacity: 0.55;
  transition: opacity 0.2s var(--ease-smooth, ease);
  position: relative;
  cursor: pointer;
}
.dsc-bar:hover { opacity: 1; }
.dsc-bar:hover .dsc-bar-label { opacity: 1; }
.dsc-bar.today {
  opacity: 1;
  background: linear-gradient(to top, var(--neon-orange), var(--neon-pink));
  box-shadow: 0 0 12px var(--neon-orange);
}
.dsc-bar-label {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-primary);
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s var(--ease-smooth, ease);
  padding: 2px 5px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: 3px;
  margin-bottom: 4px;
}
.dsc-axis {
  display: flex; justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-muted);
  padding-top: 6px;
  border-top: 1px solid var(--border-hair);
}

.hm { display: flex; flex-direction: column; gap: 0.3rem; }
.hm-rows { display: flex; flex-direction: column; gap: 3px; }
.hm-row { display: grid; grid-template-columns: 36px 1fr; align-items: center; gap: 0.5rem; }
.hm-day { font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-muted); text-transform: uppercase; }
.hm-cells { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; }
.hm-cell {
  height: 16px;
  border-radius: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-hair);
  transition: transform 0.15s var(--ease-smooth, ease);
  cursor: pointer;
}
.hm-cell:hover { transform: scale(1.3); z-index: 2; }
.hm-axis { display: grid; grid-template-columns: 36px 1fr 1fr 1fr 1fr 1fr; font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-muted); padding-top: 4px; }
.hm-axis span:not(:first-child) { text-align: left; padding-left: 4px; }
`;
