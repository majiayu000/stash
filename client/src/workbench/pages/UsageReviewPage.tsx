import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  add_calendar_days,
  type Budget,
  type BudgetPeriodSpend,
  type BudgetSpendSnapshot,
  type BurnSnapshot,
} from '@stash/shared';
import { getBudgetSpendSnapshot, getBurnSnapshot } from '../../api/analytics';
import { listBudgets } from '../../api/budgets';
import { CountUp } from '../../components/effects';
import { fmt, type WBData } from '../data';
import { LoadErrorPanel, StatTile, Topbar, toError } from '../shared';

/**
 * Usage and cost review.
 * 4 KPI tiles + grid:
 *   left:  daily spend chart · per-project leaderboard · hourly heatmap
 *   right: model donut · budgets · alerts
 *
 * Daily spend / heatmap / model mix / leaderboard pull from /api/analytics/burn.
 * Budgets are loaded from the persisted budget API.
 */
const MODEL_PALETTE = [
  'var(--neon-cyan)',
  'var(--neon-purple)',
  'var(--neon-green)',
  'var(--neon-orange)',
  'var(--neon-pink)',
];

export function UsageReviewPage({ data }: { data: WBData; reload: () => void }) {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<BurnSnapshot | null>(null);
  const [budgetSpend, setBudgetSpend] = useState<BudgetSpendSnapshot | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<Error | null>(null);
  const [budgetsError, setBudgetsError] = useState<Error | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function refreshBudgets() {
      listBudgets()
        .then((rows) => {
          if (!cancelled) {
            setBudgets(rows);
            setBudgetsError(null);
          }
        })
        .catch((e: unknown) => { if (!cancelled) setBudgetsError(toError(e)); });
    }
    refreshBudgets();
    function onChange() { refreshBudgets(); }
    window.addEventListener('stash:captured', onChange);
    return () => { cancelled = true; window.removeEventListener('stash:captured', onChange); };
  }, [retryTick]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAnalyticsError(null);
    Promise.all([getBurnSnapshot(30), getBudgetSpendSnapshot()])
      .then(([burn, spend]) => {
        if (!cancelled) {
          setSnap(burn);
          setBudgetSpend(spend);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAnalyticsError(toError(e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [retryTick]);

  if (loading) {
    return (
      <div className="dashboard-canvas">
        <div className="inner"><Topbar data={data} /><div style={{ padding: '4rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>loading analytics…</div></div>
      </div>
    );
  }
  if (analyticsError) {
    return (
      <div className="dashboard-canvas">
        <div className="inner">
          <Topbar data={data} />
          <LoadErrorPanel
            title="analytics failed to load"
            endpoint="/api/analytics/burn?days=30 + /api/analytics/budget-spend"
            error={analyticsError}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        </div>
      </div>
    );
  }
  if (!snap || !budgetSpend) {
    return (
      <div className="dashboard-canvas">
        <div className="inner">
          <Topbar data={data} />
          <LoadErrorPanel
            title="analytics returned no data"
            endpoint="/api/analytics/burn?days=30 + /api/analytics/budget-spend"
            error={new Error('analytics response was empty')}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        </div>
      </div>
    );
  }

  const bucketRangeLabel = calendarRangeLabel(snap);
  const evaluationRangeLabel = evaluationLabel(snap);
  if (snap.dailySpend.every((d) => d.cost === 0)) {
    return (
      <div className="dashboard-canvas">
        <div className="inner">
          <Topbar data={data} />
          <div style={{ padding: '4rem 2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.7rem', opacity: 0.5 }}>📊</div>
            <div>no usage data yet — analytics will appear once Claude/Codex sessions log token usage.</div>
            <div style={{ marginTop: '0.55rem', fontSize: '0.7rem' }}>{bucketRangeLabel}</div>
            <button
              type="button"
              className="burn-settings-link"
              data-testid="burn-settings"
              onClick={() => navigate('/settings')}
              style={{ marginTop: '1rem' }}
            >
              edit budgets
            </button>
          </div>
        </div>
        <style>{usageReviewStyles}</style>
      </div>
    );
  }

  const dailyCosts = snap.dailySpend.map((d) => d.cost);
  const evaluationTotal = snap.totals.cost;
  const lastWeek = dailyCosts.slice(-7).reduce((a, b) => a + b, 0);
  const prevWeek = dailyCosts.slice(-14, -7).reduce((a, b) => a + b, 0);
  const wow = prevWeek === 0 ? 0 : ((lastWeek - prevWeek) / prevWeek) * 100;
  const heatFlat = flattenHeatmap(snap.hourlyHeatmap);
  const modelMix = snap.modelMix.map((m, i) => ({ ...m, color: MODEL_PALETTE[i % MODEL_PALETTE.length]! }));
  const totalTokens7d = sumTail(snap.dailySpend.map((d) => d.tokens), 7);
  const cost24h = dailyCosts[dailyCosts.length - 1] ?? 0;
  const avgSessionTokens = snap.totals.sessions > 0 ? Math.round(snap.totals.tokens / snap.totals.sessions) : 0;
  const monthlyBudget = budgets.find(
    (budget) => budget.scope.toLowerCase() === 'all' && budget.period === 'month',
  );
  const monthlySpend = budgetSpend.periods.month.totals.cost;
  const budgetPercent = monthlyBudget
    ? Math.min(100, (monthlySpend / monthlyBudget.capUsd) * 100)
    : 0;

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        {/* Top KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="surface" style={{ padding: '1.2rem 1.4rem' }}>
            <div className="stat-tile-label" data-testid="usage-evaluation-range">indexed spend · {evaluationRangeLabel}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginTop: '0.4rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.6rem', fontWeight: 700, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                <CountUp to={evaluationTotal} duration={1400} format={(n: number) => '$' + n.toFixed(2)} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: wow > 0 ? 'var(--neon-pink)' : 'var(--neon-green)' }}>
                {wow > 0 ? '↑' : '↓'} {Math.abs(wow).toFixed(0)}% w/w
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              {monthlyBudget
                ? <>global monthly budget: <span style={{ color: 'var(--text-secondary)' }}>${monthlySpend.toFixed(2)} / ${monthlyBudget.capUsd.toFixed(2)}</span> · {budgetPeriodLabel(budgetSpend.periods.month, budgetSpend.calendar.timeZone)}</>
                : <>No global monthly budget. Add one in Settings.</>}
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', marginTop: '0.5rem', position: 'relative' }}>
              <div style={{ width: budgetPercent + '%', height: '100%', background: 'var(--gradient-primary)', boxShadow: '0 0 12px var(--neon-cyan)' }} />
            </div>
          </div>

          <StatTile label="tokens · last 7 calendar days" tone="purple" value={totalTokens7d} format={(n: number) => fmt.k(Math.round(n))} foot={<span>{snap.calendar.timeZone}</span>} />
          <StatTile label="cost · current calendar day"  tone="green"  value={cost24h}       format={(n: number) => '$' + n.toFixed(2)} foot={<span>7 calendar days <span className="up">${lastWeek.toFixed(2)}</span></span>} />
          <StatTile label="avg session" tone="orange" value={avgSessionTokens} format={(n: number) => fmt.k(Math.round(n)) + ' tok'} foot={<span>over all sessions</span>} />
        </div>

        {/* Charts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> daily spend <span className="count" data-testid="usage-bucket-range">— {bucketRangeLabel}</span>
                <span className="right">$ usd</span>
              </div>
              <DailySpendChart data={dailyCosts} />
            </div>

            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> per-project · {evaluationRangeLabel}
              </div>
              {snap.perProjectLeaderboard.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no per-project usage yet</div>
              ) : (
                <Leaderboard rows={snap.perProjectLeaderboard} onOpenProject={(projectId) => navigate(`/projects/${encodeURIComponent(projectId)}`)} />
              )}
            </div>

            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> activity heatmap <span className="count">— {bucketRangeLabel}, hourly</span>
              </div>
              <Heatmap data={heatFlat} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.8rem' }}>
                <span className="prompt">&gt;</span> by model · {evaluationRangeLabel}
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
                <button
                  type="button"
                  className="burn-settings-link"
                  data-testid="burn-settings"
                  onClick={() => navigate('/settings')}
                >
                  edit budgets
                </button>
              </div>
              {budgetsError ? (
                <LoadErrorPanel
                  title="budgets failed to load"
                  endpoint="/api/budgets"
                  error={budgetsError}
                  onRetry={() => setRetryTick((t) => t + 1)}
                  compact
                />
              ) : budgets.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  no budgets yet. set one in <code>settings → 💰 budgets</code>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {budgets.map((b) => (
                    <BudgetRow
                      key={b.id}
                      b={b}
                      period={budgetSpend.periods[b.period]}
                      timeZone={budgetSpend.calendar.timeZone}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <style>{usageReviewStyles}</style>
    </div>
  );
}

function calendarRangeLabel(snap: BurnSnapshot): string {
  const { bucketRange, timeZone } = snap.calendar;
  return `${bucketRange.startDate}–${add_calendar_days(bucketRange.endDateExclusive, -1)} · ${timeZone}`;
}

function evaluationLabel(snap: BurnSnapshot): string {
  if (snap.calendar.evaluationRange.end === null) {
    return `from ${snap.calendar.bucketRange.startDate} onward · ${snap.calendar.timeZone}`;
  }
  return calendarRangeLabel(snap);
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
function Leaderboard({ rows, onOpenProject }: { rows: LeaderRow[]; onOpenProject: (projectId: string) => void }) {
  const maxT = Math.max(...rows.map((r) => r.tokens), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {rows.map((p, i) => (
        <button key={p.projectId} type="button" onClick={() => onOpenProject(p.projectId)} className="leader-row">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: i === 0 ? 'var(--neon-orange)' : i === 1 ? 'var(--text-secondary)' : i === 2 ? '#cd7f32' : 'var(--text-muted)', fontWeight: 700, textAlign: 'center' }}>
            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--neon-cyan)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.projectName}
          </span>
          <div className="pbar"><div className="pbar-fill" style={{ width: ((p.tokens / maxT) * 100) + '%' }} /></div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt.k(p.tokens)}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--neon-green)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${p.cost.toFixed(2)}</span>
        </button>
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

function spendForScope(b: Budget, period: BudgetPeriodSpend): number {
  if (b.scope.toLowerCase() === 'all') {
    return period.totals.cost;
  }
  const match = period.perProject.find(
    (row) => row.projectName.toLowerCase() === b.scope.toLowerCase(),
  );
  return match?.cost ?? 0;
}

function budgetPeriodLabel(period: BudgetPeriodSpend, timeZone: string): string {
  return `${period.range.startDate}–${add_calendar_days(period.range.endDateExclusive, -1)} · ${timeZone}`;
}

function BudgetRow({
  b,
  period,
  timeZone,
}: {
  b: Budget;
  period: BudgetPeriodSpend;
  timeZone: string;
}) {
  const used = spendForScope(b, period);
  const pct = b.capUsd > 0 ? (used / b.capUsd) * 100 : 0;
  const over = pct > 100;
  const warn = pct > 75;
  const color = over ? 'var(--neon-pink)' : warn ? 'var(--neon-orange)' : 'var(--neon-cyan)';
  return (
    <div data-testid={`budget-row-${b.id}`} data-over-limit={over ? 'true' : 'false'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{b.scope} <span style={{ color: 'var(--text-muted)' }}>· {b.period}</span></span>
        <span style={{ color: over ? 'var(--neon-pink)' : warn ? 'var(--neon-orange)' : 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${used.toFixed(2)}</span> / ${b.capUsd.toFixed(2)} <span>· {pct.toFixed(0)}%</span>
        </span>
      </div>
      <div style={{ marginBottom: 5, fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
        {budgetPeriodLabel(period, timeZone)}
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

const usageReviewStyles = `
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
.leader-row {
  display: grid;
  grid-template-columns: 24px 130px 1fr 80px 60px;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  cursor: pointer;
  text-align: left;
}
.leader-row:hover {
  border-color: var(--border-glow);
  background: rgba(0,255,242,0.035);
}
.burn-settings-link {
  margin-left: auto;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 2px 8px;
}
.burn-settings-link:hover,
.burn-settings-link:focus-visible {
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
  outline: none;
}
`;
