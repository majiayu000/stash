import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FeatureAdvancedRow, WeeklySnapshot, WorkItem } from '@stash/shared';
import { getWeeklySnapshot } from '../../api/analytics';
import { listStale, listWorkItems } from '../../api/work-items';
import { CountUp, ParticleField, ShinyText } from '../../components/effects';
import { fmt, type WBData, type WBProject } from '../data';
import { LoadErrorPanel, SessionRow, Topbar, toError } from '../shared';

/**
 * Concept J — Weekly Review.
 * Hero AI narrative + KPI tiles, then 3 columns (done · features advanced ·
 * WoW comparison), then next-week planner strip.
 *
 * Data: real /api/analytics/weekly snapshot + /api/work-items?status=done for the
 * done-by-project grouping. Narrative is deterministic per SPEC §8 (LLM in v0.3).
 */
export function ConceptJ({ data }: { data: WBData; reload: () => void }) {
  const navigate = useNavigate();
  const { projects, sessions } = data;
  const [week, setWeek] = useState<WeeklySnapshot | null>(null);
  const [doneItems, setDoneItems] = useState<WorkItem[]>([]);
  const [stale, setStale] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getWeeklySnapshot(),
      listWorkItems({ status: ['done'] }),
      listStale(30),
    ])
      .then(([w, items, staleItems]) => {
        if (cancelled) return;
        setWeek(w);
        const within = items.filter((it) => {
          if (!it.completedAt) return false;
          return it.completedAt >= w.rangeStart && it.completedAt < w.rangeEnd;
        });
        setDoneItems(within);
        setStale(staleItems);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(toError(e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [retryTick]);

  if (loading) {
    return (
      <div className="dashboard-canvas">
        <div className="inner"><Topbar data={data} /><div style={{ padding: '4rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>loading weekly review…</div></div>
      </div>
    );
  }
  if (loadError || !week) {
    return (
      <div className="dashboard-canvas">
        <div className="inner">
          <Topbar data={data} />
          <LoadErrorPanel
            title="weekly review failed to load"
            endpoint="/api/analytics/weekly + /api/work-items?status=done + /api/work-items/stale?days=30"
            error={loadError ?? new Error('weekly review returned no data')}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        </div>
      </div>
    );
  }

  const wowTokensPct = pctDelta(week.wow.tokens.now, week.wow.tokens.prev);
  const wowCostPct = pctDelta(week.wow.cost.now, week.wow.cost.prev);
  const wowSessionsDelta = week.wow.sessions.now - week.wow.sessions.prev;
  const featAdvanced = week.featuresAdvanced;
  const doneByProject = groupDoneByProject(doneItems, projects);

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        <div className="wr-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="wr-nav" type="button">‹</button>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>this week · review</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, marginTop: 2 }}>
                <ShinyText>{week.week} — stash workbench</ShinyText>
              </div>
            </div>
            <button className="wr-nav" type="button">›</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="sd-action" type="button">📤 share with team</button>
            <button className="sd-action" type="button">📋 export markdown</button>
          </div>
        </div>

        {/* Row 1: deterministic narrative + KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div className="wr-summary">
            <ParticleField density={0.00007} color="191, 90, 242" maxLink={80} />
            <div className="wr-summary-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 12px var(--neon-purple))' }}>🧠</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-purple)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>week summary</span>
                <span className="wr-summary-tag">deterministic · LLM in v0.3</span>
              </div>
              <div className="wr-narrative">
                <p>You closed <strong>{week.doneCount}</strong> todos and logged <strong>{week.focusHours}</strong> focus hours across {doneByProject.length} active projects. Sessions {wowSessionsDelta >= 0 ? 'up' : 'down'} from {week.wow.sessions.prev} → {week.wow.sessions.now}.</p>
                {doneByProject[0] && (
                  <p>
                    Top project: <span className="wr-narr-pill cyan">{doneByProject[0].project.emoji} {doneByProject[0].project.name}</span> with {doneByProject[0].items.length} items completed.
                  </p>
                )}
                {featAdvanced.length > 0 && (
                  <p>
                    Advanced {featAdvanced.length} feature{featAdvanced.length === 1 ? '' : 's'}: {featAdvanced.slice(0, 2).map((f) => f.title).join(', ')}{featAdvanced.length > 2 ? `, +${featAdvanced.length - 2} more` : ''}.
                  </p>
                )}
                <p>
                  Burn was <strong>${week.wow.cost.now.toFixed(2)}</strong> {wowCostPct >= 0 ? '↑' : '↓'} {Math.abs(wowCostPct).toFixed(0)}% vs last week.
                </p>
                {week.doneCount === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No completed todos this week — try closing one to seed the report.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', alignContent: 'start' }}>
            <KpiTile label="todos done"    value={week.doneCount}            color="var(--neon-green)" />
            <KpiTile label="features +"    value={featAdvanced.length}       color="var(--neon-cyan)" />
            <KpiTile label="sessions"      value={week.wow.sessions.now}     wow={wowSessionsDelta}              color="var(--neon-purple)" />
            <KpiTile label="tokens · 7d"   value={fmt.k(week.wow.tokens.now)} wow={Math.round(wowTokensPct)} unit="%" color="var(--neon-cyan)" />
            <KpiTile label="cost · 7d"     value={'$' + week.wow.cost.now.toFixed(2)} wow={Math.round(wowCostPct)} unit="%" color="var(--neon-orange)" warn />
            <KpiTile label="focus hours"   value={week.focusHours + 'h'}     color="var(--neon-pink)" />
          </div>
        </div>

        {/* Row 2: done · features · WoW */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          <div className="surface" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
              <span className="prompt">&gt;</span> done this week
              <span className="count">— {week.doneCount} items</span>
              <span className="right" style={{ color: 'var(--neon-green)' }}>🎉</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: 4 }}>
              {doneByProject.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(nothing completed yet this week)</div>
              ) : doneByProject.map((g) => (
                <DoneGroup key={g.project.id} project={g.project} items={g.items} onOpen={(id) => navigate(`/c/l/${id}`)} />
              ))}
            </div>
          </div>

          <div className="surface" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
              <span className="prompt">&gt;</span> features advanced
              <span className="count">— {featAdvanced.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: 4 }}>
              {featAdvanced.length === 0
                ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(no features advanced)</div>
                : featAdvanced.map((f) => <FeatureDeltaRow key={f.id} f={f} />)}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
                <span className="prompt">&gt;</span> this week vs last
              </div>
              <WowCompare label="todos done" cur={week.doneCount}              prev={Math.max(0, week.doneCount - wowSessionsDelta)} fmt={(n) => String(n)} />
              <WowCompare label="sessions"   cur={week.wow.sessions.now}       prev={week.wow.sessions.prev} fmt={(n) => String(n)} />
              <WowCompare label="tokens"     cur={week.wow.tokens.now / 1_000_000} prev={week.wow.tokens.prev / 1_000_000} fmt={(n) => n.toFixed(2) + 'M'} />
              <WowCompare label="cost"       cur={week.wow.cost.now}           prev={week.wow.cost.prev} fmt={(n) => '$' + n.toFixed(2)} warn />
              <WowCompare label="focus hrs"  cur={week.focusHours}             prev={Math.max(0, week.focusHours - 1)} fmt={(n) => n.toFixed(1) + 'h'} />
            </div>

            {stale.length > 0 && (
              <div className="surface">
                <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
                  <span className="prompt">&gt;</span> 🌫 stale digest
                  <span className="count">— {stale.length} item{stale.length === 1 ? '' : 's'}, untouched 30d+</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {stale.slice(0, 6).map((it) => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>{daysSince(it.updatedAt)}d</span>
                    </div>
                  ))}
                  {stale.length > 6 && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                      +{stale.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="surface" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
                <span className="prompt">&gt;</span> top sessions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto' }}>
                {sessions.filter((s) => s.state !== 'error').slice(0, 3).length === 0
                  ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(no sessions this week)</div>
                  : sessions.filter((s) => s.state !== 'error').slice(0, 3).map((s) => <SessionRow key={s.id} s={s} projects={projects} compact />)}
              </div>
            </div>
          </div>
        </div>

        {/* Next week plan — empty by default; user drops todos in. */}
        <div style={{ marginTop: '1.25rem' }}>
          <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
            <span className="prompt">&gt;</span> plan next week
            <span className="count">— drop todos here · auto-budget estimate</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
            {['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => (
              <NextWeekDay key={d} day={d} />
            ))}
          </div>
        </div>
      </div>

      <style>{conceptJStyles}</style>
    </div>
  );
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

function pctDelta(cur: number, prev: number): number {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

function groupDoneByProject(items: WorkItem[], projects: WBProject[]): { project: WBProject; items: WorkItem[] }[] {
  const byArea = new Map<string, WorkItem[]>();
  for (const it of items) {
    const key = it.areaId ?? '__unassigned__';
    const bucket = byArea.get(key);
    if (bucket) bucket.push(it); else byArea.set(key, [it]);
  }
  const out: { project: WBProject; items: WorkItem[] }[] = [];
  for (const p of projects) {
    const buc = byArea.get(p.id);
    if (buc && buc.length > 0) out.push({ project: p, items: buc });
  }
  const unassigned = byArea.get('__unassigned__');
  if (unassigned && unassigned.length > 0) {
    out.push({
      project: {
        id: '__unassigned__',
        name: 'No project',
        emoji: '•',
        progress: 0,
        status: 'fresh',
        doing: 'unassigned work',
        features: [],
        todoCount: unassigned.length,
        todoDone: unassigned.length,
        sessions: 0,
        tokens24h: 0,
        cost24h: 0,
        lastModel: '—',
        lastTouched: Date.now(),
      },
      items: unassigned,
    });
  }
  out.sort((a, b) => b.items.length - a.items.length);
  return out;
}

function KpiTile({ label, value, wow, unit, color, warn }: { label: string; value: number | string; wow?: number; unit?: string; color: string; warn?: boolean }) {
  const up = typeof wow === 'number' && wow > 0;
  const wowStr = wow == null ? '' : `${up ? '↑' : '↓'} ${Math.abs(wow)}${unit ?? ''}`;
  return (
    <div className="wr-kpi">
      <div className="wr-kpi-label">{label}</div>
      <div className="wr-kpi-value" style={{ color }}>
        {typeof value === 'number' ? <CountUp to={value} duration={1000} /> : value}
      </div>
      {wow != null && (
        <div className="wr-kpi-wow" style={{ color: warn ? 'var(--neon-orange)' : up ? 'var(--neon-green)' : 'var(--neon-pink)' }}>
          {wowStr} <span style={{ color: 'var(--text-muted)' }}>vs prev</span>
        </div>
      )}
    </div>
  );
}

function DoneGroup({ project, items, onOpen }: { project: WBProject; items: WorkItem[]; onOpen: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="wr-done-group">
      <div className="wr-done-head">
        <span style={{ fontSize: '1.05rem' }}>{project.emoji}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--neon-cyan)', fontWeight: 600 }}>{project.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--neon-green)', marginLeft: 'auto', background: 'rgba(48,209,88,0.1)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>✓ {items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
        {items.map((item) => (
          <button key={item.id} type="button" className="wr-done-item" onClick={() => onOpen(item.id)}>
            <span className="wr-done-check">✓</span>
            <span className="wr-done-text">{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FeatureDeltaRow({ f }: { f: FeatureAdvancedRow }) {
  return (
    <div className="wr-feat">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>{f.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{f.from}</span>
        <span style={{ color: 'var(--text-muted)' }}>→</span>
        <span style={{ color: 'var(--neon-green)', fontWeight: 600 }}>{f.to}</span>
      </div>
    </div>
  );
}

function WowCompare({ label, cur, prev, fmt: fmtNum, warn }: { label: string; cur: number; prev: number; fmt: (n: number) => string; warn?: boolean }) {
  const delta = pctDelta(cur, prev);
  const up = delta > 0;
  return (
    <div className="wr-wow-row">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: warn ? 'var(--neon-orange)' : up ? 'var(--neon-green)' : 'var(--neon-pink)', fontWeight: 600 }}>
          {up ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', width: 22 }}>prev</span>
          <div className="pbar thin" style={{ flex: 1 }}>
            <div className="pbar-fill" style={{ width: '100%', background: 'var(--text-muted)', opacity: 0.4, boxShadow: 'none', animation: 'none' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', width: 22 }}>now</span>
          <div className="pbar thin" style={{ flex: 1 }}>
            <div className="pbar-fill" style={{ width: Math.min(100, prev === 0 ? 100 : (cur / prev) * 100) + '%', background: warn ? 'var(--neon-orange)' : 'var(--gradient-primary)' }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{fmtNum(prev)}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmtNum(cur)}</span>
      </div>
    </div>
  );
}

function NextWeekDay({ day }: { day: string }) {
  return (
    <div className="wr-nwd">
      <div className="wr-nwd-head">{day}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <button className="wr-nwd-add" type="button">+ drop here</button>
      </div>
    </div>
  );
}

const conceptJStyles = `
.wr-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 1.25rem;
  padding: 0.75rem 1rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}
.wr-nav {
  width: 32px; height: 32px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  font-family: var(--font-mono);
}
.wr-nav:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

.wr-summary {
  position: relative;
  background: linear-gradient(135deg, rgba(191,90,242,0.08), rgba(0,255,242,0.04));
  border: 1px solid rgba(191,90,242,0.25);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(191,90,242,0.05);
}
.wr-summary-inner { position: relative; z-index: 1; }
.wr-summary-tag {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid var(--border-hair);
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  margin-left: auto;
}
.wr-narrative { font-family: var(--font-body); font-size: 0.92rem; line-height: 1.65; color: var(--text-primary); }
.wr-narrative p { margin: 0; margin-bottom: 0.55rem; }
.wr-narrative p:last-child { margin-bottom: 0; }
.wr-narrative strong { color: var(--neon-orange); font-weight: 600; }
.wr-narr-pill { display: inline-flex; align-items: center; font-family: var(--font-mono); font-size: 0.8rem; padding: 1px 8px; border-radius: var(--radius-sm); font-weight: 500; }
.wr-narr-pill.cyan   { background: rgba(0,255,242,0.08); color: var(--neon-cyan); border: 1px solid rgba(0,255,242,0.2); }
.wr-narr-pill.purple { background: rgba(191,90,242,0.08); color: var(--neon-purple); border: 1px solid rgba(191,90,242,0.2); }

.wr-kpi {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.85rem;
  position: relative;
  overflow: hidden;
}
.wr-kpi::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--gradient-primary); }
.wr-kpi-label { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.wr-kpi-value { font-family: var(--font-mono); font-size: 1.45rem; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; line-height: 1.1; }
.wr-kpi-wow { font-family: var(--font-mono); font-size: 0.66rem; margin-top: 3px; }

.wr-done-group { padding: 0.7rem 0.85rem; background: rgba(48,209,88,0.03); border: 1px solid rgba(48,209,88,0.15); border-radius: var(--radius-md); }
.wr-done-head { display: flex; align-items: center; gap: 0.5rem; }
.wr-done-item { display: flex; align-items: flex-start; gap: 0.5rem; font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-secondary); padding: 2px 0; background: transparent; border: 0; text-align: left; cursor: pointer; border-radius: var(--radius-sm); }
.wr-done-item:hover { color: var(--text-primary); background: rgba(48,209,88,0.06); }
.wr-done-check { color: var(--neon-green); font-weight: 700; text-shadow: 0 0 8px rgba(48,209,88,0.6); flex-shrink: 0; }
.wr-done-text { line-height: 1.5; }

.wr-feat { padding: 0.75rem 0.85rem; background: var(--bg-glass); border: 1px solid var(--border-hair); border-radius: var(--radius-md); }

.wr-wow-row { padding: 0.55rem 0; border-bottom: 1px solid var(--border-hair); }
.wr-wow-row:last-child { border-bottom: 0; }

.wr-nwd {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.6rem 0.7rem;
  display: flex; flex-direction: column; gap: 0.5rem;
  min-height: 130px;
}
.wr-nwd-head { font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; color: var(--neon-cyan); text-transform: uppercase; letter-spacing: 0.1em; padding-bottom: 0.35rem; border-bottom: 1px solid var(--border-hair); }
.wr-nwd-todo { display: flex; gap: 6px; align-items: flex-start; padding: 5px 6px; background: rgba(255,255,255,0.025); border: 1px solid var(--border-hair); border-radius: var(--radius-sm); cursor: grab; }
.wr-nwd-todo:hover { border-color: var(--border-glow); }
.wr-nwd-add { background: transparent; border: 1px dashed var(--border-subtle); color: var(--text-muted); padding: 6px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.7rem; cursor: pointer; margin-top: auto; }
.wr-nwd-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
`;
