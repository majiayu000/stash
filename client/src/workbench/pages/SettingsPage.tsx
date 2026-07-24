import { useEffect, useRef, useState } from 'react';
import type { Budget } from '@stash/shared';
import { createBudget, deleteBudget, listBudgets, updateBudget } from '../../api/budgets';
import { getReminderPermission, requestReminderPermission } from '../ReminderTicker';
import { ShinyText } from '../../components/effects';
import { useWorkbenchDialog } from '../../components/ui/workbench-dialogs';
import { THEMES, getTheme, onThemeChange, setTheme, type ThemeId } from '../../lib/theme';
import type { WBData } from '../data';
import { reportAsyncError } from '../reportAsyncError';
import { Topbar } from '../shared';

interface ThemeDescriptor { id: ThemeId; name: string; desc: string; hex: [string, string, string, string] }

const THEME_INFO: ThemeDescriptor[] = [
  { id: 'cyber',     name: 'Cyber neon',         desc: 'The default. Cyan / purple / magenta on deep space black.',                                                hex: ['#00fff2', '#bf5af2', '#ff00ff', '#30d158'] },
  { id: 'matrix',    name: 'Matrix',             desc: 'Single-hue green CRT. Pure terminal — htop / Tron / The Matrix energy.',                                   hex: ['#00ff66', '#aaff00', '#00b347', '#00ff7f'] },
  { id: 'synthwave', name: 'Synthwave',          desc: "Hot pink + violet + orange on deep purple. Outrun '80s retrofuture.",                                       hex: ['#ff006f', '#a020f0', '#ff5500', '#ffd700'] },
  { id: 'amber',     name: 'Amber CRT',          desc: 'Vintage amber phosphor. Single-hue warm orange. Cosy + serious.',                                          hex: ['#ffaa00', '#ff7700', '#cc6600', '#ffcc44'] },
  { id: 'glacier',   name: 'Glacier',            desc: "Light mode that doesn't look like a different product. Cool blue + violet, soft surfaces.",                  hex: ['#0072ce', '#6633cc', '#c026d3', '#059669'] },
  { id: 'paper',     name: 'Paper · square',     desc: 'Clean white, high contrast, square corners. GitHub Primer vibes — flat, hairline borders, no glow.',        hex: ['#0969da', '#1a7f37', '#8250df', '#cf222e'] },
  { id: 'mono',      name: 'Mono · terminal',    desc: 'Pure black & white. Square frames, brutalist hard shadows, monospace everywhere. State by weight + fill, not color.', hex: ['#000000', '#404040', '#909090', '#cccccc'] },
];

/** Settings backed by real application state. */
export function SettingsPage({ data }: { data: WBData; reload: () => void }) {
  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        <div className="settings-layout">
          <nav className="surface settings-rail" aria-label="Settings sections">
            <div className="sec-head" style={{ marginBottom: '0.6rem', padding: '0 0.4rem' }}>
              <span className="prompt">&gt;</span> settings
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <SettingsRail item="🎨 appearance" target="settings-appearance" />
              <SettingsRail item="🔔 notifications" target="settings-notifications" />
              <SettingsRail item="💳 budgets" target="settings-budgets" />
            </div>
            <div style={{ marginTop: '1rem', padding: '0.7rem 0.6rem', background: 'rgba(0,255,242,0.04)', border: '1px dashed rgba(0,255,242,0.2)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--neon-cyan)' }}>$</span> runtime config<br />
              <code style={{ color: 'var(--neon-green)' }}>environment variables</code><br />
              server zone: {data.runtime.timeZone}
            </div>
          </nav>

          <div className="settings-content">
            <section id="settings-appearance">
              <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem', margin: 0 }}>
                <ShinyText>appearance</ShinyText>
              </h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Pick a theme. Each is a full token swap — backgrounds, neon spectrum, gradients, glows. The Mono and Paper themes also remap shadows, border-radius, and font families to match their structural aesthetic (see <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--neon-green)', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 3, fontSize: '0.78rem' }}>themes.css</code>).
              </p>
            </section>

            <div className="settings-theme-grid">
              {THEME_INFO.map((t) => <ThemePreview key={t.id} t={t} />)}
            </div>

            <section id="settings-notifications"><NotificationsPanel /></section>
            <section id="settings-budgets"><BudgetsPanel /></section>
          </div>
        </div>
      </div>

      <style>{settingsPageStyles}</style>
    </div>
  );
}

function BudgetsPanel() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const dialog = useWorkbenchDialog();

  async function refresh() {
    if (mounted.current) setLoading(true);
    try {
      const next = await listBudgets();
      if (mounted.current) setBudgets(next);
    } catch (error) {
      if (mounted.current) reportAsyncError('load settings budgets', error, refresh);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, []);

  async function add() {
    const scope = await dialog.prompt({
      title: 'budget scope',
      label: 'scope',
      placeholder: 'aurora or all',
      confirmLabel: 'next',
    });
    if (!scope?.trim()) return;
    const capStr = await dialog.prompt({
      title: 'budget cap',
      label: 'USD cap',
      defaultValue: '50',
      confirmLabel: 'next',
    });
    if (capStr === null) return;
    const capUsd = Number(capStr);
    if (!(capUsd > 0)) { await dialog.alert({ title: 'cap must be greater than 0', tone: 'danger' }); return; }
    const period = await dialog.prompt({
      title: 'budget period',
      description: 'Allowed: day, week, month, quarter.',
      label: 'period',
      defaultValue: 'month',
      confirmLabel: 'create budget',
    });
    if (period === null) return;
    if (!period || !['day', 'week', 'month', 'quarter'].includes(period)) { await dialog.alert({ title: 'invalid period', description: 'Use day, week, month, or quarter.', tone: 'danger' }); return; }
    try {
      await createBudget({ scope: scope.trim(), capUsd, period: period as Budget['period'] });
      await refresh();
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) { await dialog.alert({ title: 'could not create budget', description: e instanceof Error ? e.message : String(e), tone: 'danger' }); }
  }

  async function edit(b: Budget) {
    const capStr = await dialog.prompt({
      title: `cap for ${b.scope}`,
      description: `Period: ${b.period}`,
      label: 'USD cap',
      defaultValue: String(b.capUsd),
      confirmLabel: 'save cap',
    });
    if (capStr === null) return;
    const capUsd = Number(capStr);
    if (!(capUsd > 0)) { await dialog.alert({ title: 'cap must be greater than 0', tone: 'danger' }); return; }
    try {
      await updateBudget(b.id, { capUsd });
      await refresh();
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) { await dialog.alert({ title: 'could not update budget', description: e instanceof Error ? e.message : String(e), tone: 'danger' }); }
  }

  async function remove(b: Budget) {
    const ok = await dialog.confirm({
      title: 'delete budget?',
      description: `${b.scope} / ${b.period}`,
      confirmLabel: 'delete budget',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteBudget(b.id);
      await refresh();
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) { await dialog.alert({ title: 'could not delete budget', description: e instanceof Error ? e.message : String(e), tone: 'danger' }); }
  }

  return (
    <div className="surface" style={{ padding: '1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.85rem' }}>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, margin: 0 }}>💰 budgets</h3>
        <button
          type="button"
          onClick={add}
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,255,242,0.08)', border: '1px solid rgba(0,255,242,0.3)',
            color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
          }}
        >+ budget</button>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0 }}>
        Each (scope, period) is unique. Scope <code style={{ color: 'var(--neon-cyan)' }}>all</code> tracks total spend; project names track the matching area's burn.
      </p>
      {loading ? (
        <div style={budgetHint}>loading…</div>
      ) : budgets.length === 0 ? (
        <div style={budgetHint}>no budgets yet. press <code>+ budget</code> to set one.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {budgets.map((b) => (
            <div key={b.id} style={budgetRowStyle}>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-primary)' }}>{b.scope}</span>
                <span style={{ color: 'var(--text-muted)' }}> · {b.period}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-orange)' }}>${b.capUsd.toFixed(2)}</span>
              <button type="button" onClick={() => edit(b)} style={budgetButtonStyle}>edit</button>
              <button type="button" onClick={() => remove(b)} style={{ ...budgetButtonStyle, color: 'var(--neon-pink)' }}>delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const budgetRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 8px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-hair)',
  borderRadius: 4,
};

const budgetButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-hair)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.66rem',
  padding: '2px 8px',
  borderRadius: 3,
  cursor: 'pointer',
};

const budgetHint: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' };

function NotificationsPanel() {
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const mounted = useRef(false);
  const dialog = useWorkbenchDialog();
  useEffect(() => {
    mounted.current = true;
    setPerm(getReminderPermission());
    return () => { mounted.current = false; };
  }, []);

  async function enable() {
    try {
      const ok = await requestReminderPermission();
      if (!mounted.current) return;
      const nextPermission = getReminderPermission();
      setPerm(nextPermission);
      if (!ok && nextPermission === 'denied' && mounted.current) {
        await dialog.alert({
          title: 'notifications are blocked',
          description: 'Re-enable notifications in this browser site settings.',
          tone: 'danger',
        });
      }
    } catch (error) {
      if (!mounted.current) return;
      setPerm(getReminderPermission());
      reportAsyncError('request notification permission', error, () => {
        if (!mounted.current) return;
        return enable();
      });
    }
  }

  const badge = (() => {
    if (perm === 'granted') return { color: 'var(--neon-green)', label: '● on — reminders will fire' };
    if (perm === 'denied') return { color: 'var(--neon-pink)', label: '✕ blocked at browser level' };
    if (perm === 'unsupported') return { color: 'var(--text-muted)', label: '— browser does not support notifications' };
    return { color: 'var(--text-muted)', label: '○ off — click to enable' };
  })();

  return (
    <div className="surface" style={{ padding: '1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.85rem' }}>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, margin: 0 }}>🔔 reminders</h3>
        <span style={{ marginLeft: 'auto', color: badge.color, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{badge.label}</span>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0 }}>
        stash checks every minute for work items whose <code style={{ color: 'var(--neon-pink)' }}>reminderAt</code> just fell due. when one fires, you get a system notification; click it to jump straight to that todo.
      </p>
      <button
        type="button"
        onClick={enable}
        disabled={perm === 'granted' || perm === 'unsupported'}
        style={{
          background: perm === 'granted' ? 'rgba(48,209,88,0.1)' : 'rgba(0,255,242,0.08)',
          border: `1px solid ${perm === 'granted' ? 'rgba(48,209,88,0.4)' : 'rgba(0,255,242,0.3)'}`,
          color: perm === 'granted' ? 'var(--neon-green)' : 'var(--neon-cyan)',
          fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
          padding: '6px 14px', borderRadius: 5,
          cursor: perm === 'granted' || perm === 'unsupported' ? 'default' : 'pointer',
        }}
      >
        {perm === 'granted' ? 'notifications enabled' : perm === 'unsupported' ? 'unsupported' : 'enable browser notifications'}
      </button>
    </div>
  );
}

function SettingsRail({ item, target }: { item: string; target: string }) {
  return (
    <a className="set-rail" href={`#${target}`}>
      <span>{item}</span>
      <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>›</span>
    </a>
  );
}

function ThemePreview({ t }: { t: ThemeDescriptor }) {
  const [active, setActive] = useState<ThemeId>(() => getTheme());
  useEffect(() => onThemeChange(setActive), []);
  const isActive = active === t.id;
  const apply = () => setTheme(t.id);

  // Find live swatch for cyber default since THEMES export has a different shape.
  const fromLib = THEMES.find((x) => x.id === t.id);
  const swatchHex = (fromLib?.swatch ?? t.hex.slice(0, 3)) as readonly string[];

  return (
    <button
      type="button"
      className={`theme-card ${isActive ? 'active' : ''}`}
      onClick={apply}
      aria-label={`Apply ${t.name} theme`}
      aria-pressed={isActive}
      data-testid={`theme-preview-${t.id}`}
    >
      <div className={`theme-preview theme-${t.id}`}>
        <div className="tp-bg">
          <div className="tp-header">
            <span className="tp-logo">🎯</span>
            <span className="tp-title">stash</span>
            <span className="tp-tag">{t.id === 'cyber' ? '> 6 projects · 2 live' : `> theme: ${t.id}`}</span>
          </div>
          <div className="tp-stats">
            <div className="tp-stat-tile"><div className="tp-stat-num">184k</div><div className="tp-stat-lbl">tokens</div></div>
            <div className="tp-stat-tile"><div className="tp-stat-num">$4.16</div><div className="tp-stat-lbl">cost</div></div>
            <div className="tp-stat-tile"><div className="tp-stat-num">2</div><div className="tp-stat-lbl">live</div></div>
          </div>
          <div className="tp-pcard">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: '0.95rem' }}>🌌</span>
              <span className="tp-pname">aurora-api</span>
              <span className="tp-pdot" />
            </div>
            <div className="tp-pbar"><div className="tp-pbar-fill" style={{ width: '72%' }} /></div>
            <div className="tp-pfoot">72% · 7 todo · ⎇ feat/auth-flow</div>
          </div>
          <div className="tp-todo">
            <span className="tp-todo-check" />
            <span className="tp-todo-text">finish OAuth callback edge cases</span>
            <span className="tp-prio">!!</span>
          </div>
          <div className="tp-btn-row">
            <span className="tp-btn">▶ start session</span>
            <span className="tp-btn ghost">+ new</span>
          </div>
        </div>
      </div>
      <div className="theme-card-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 600 }}>{t.name}</span>
          {isActive && <span className="theme-active-badge">● active</span>}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{t.desc}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {swatchHex.map((h) => <span key={h} className="theme-swatch" style={{ background: h, boxShadow: `0 0 8px ${h}` }} />)}
          <span style={{ flex: 1 }} />
          {!isActive && <span className="np-btn ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.7rem' }}>apply</span>}
        </div>
      </div>
    </button>
  );
}

const settingsPageStyles = `
.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1.25rem;
  flex: 1;
  min-height: 0;
}
.settings-rail {
  padding: 0.75rem;
  overflow-y: auto;
  align-self: start;
  position: sticky;
  top: 0;
}
.settings-content {
  min-width: 0;
  padding-right: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.settings-theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
}
.set-rail {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0.65rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  transition: all var(--transition-fast, 0.2s);
  text-align: left;
  width: 100%;
  text-decoration: none;
}
.set-rail:hover { background: rgba(255,255,255,0.03); border-color: var(--border-hair); }
.set-rail.active {
  background: rgba(0,255,242,0.06);
  border-color: var(--border-glow);
  color: var(--neon-cyan);
  box-shadow: inset 2px 0 0 var(--neon-cyan);
}

.theme-card {
  appearance: none;
  width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition-base, 0.25s);
}
.theme-card:hover {
  transform: translateY(-3px);
  border-color: var(--border-glow);
  box-shadow: var(--shadow-card-hover, var(--shadow-neon));
}
.theme-card.active {
  border-color: var(--neon-cyan);
  box-shadow: 0 0 25px rgba(0,255,242,0.18);
}
.theme-card:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 3px;
}
.theme-card-meta { padding: 0.85rem 1rem 1rem; }
.theme-active-badge {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--neon-green);
  background: rgba(48,209,88,0.12);
  border: 1px solid rgba(48,209,88,0.3);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}
.theme-swatch { width: 14px; height: 14px; border-radius: 50%; }

.theme-preview {
  height: 200px;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-bottom: 1px solid var(--border-subtle);
}
.tp-bg {
  position: absolute; inset: 0;
  background: var(--bg-void);
  padding: 0.6rem 0.7rem;
  display: flex; flex-direction: column; gap: 0.45rem;
}
.tp-bg::before {
  content: ''; position: absolute; inset: 0;
  background:
    linear-gradient(90deg, var(--grid-color) 1px, transparent 1px),
    linear-gradient(var(--grid-color) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 60%, transparent 100%);
}
.tp-bg > * { position: relative; z-index: 1; }
.tp-header {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.tp-logo { font-size: 0.95rem; filter: drop-shadow(0 0 6px var(--neon-cyan)); }
.tp-title {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--gradient-logo);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.tp-tag { font-family: var(--font-mono); font-size: 0.58rem; color: var(--text-muted); margin-left: auto; }
.tp-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.3rem; }
.tp-stat-tile {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.45rem;
  position: relative;
}
.tp-stat-tile::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--gradient-primary); }
.tp-stat-num {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
}
.tp-stat-lbl {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}
.tp-pcard {
  padding: 0.45rem 0.55rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.tp-pname { font-family: var(--font-mono); font-size: 0.7rem; font-weight: 600; color: var(--neon-cyan); flex: 1; }
.tp-pdot { width: 6px; height: 6px; border-radius: 50%; background: var(--neon-green); box-shadow: 0 0 5px var(--neon-green); }
.tp-pbar { height: 4px; background: var(--bg-elevated); border-radius: 2px; overflow: hidden; }
.tp-pbar-fill { height: 100%; background: var(--gradient-primary); border-radius: 2px; }
.tp-pfoot { font-family: var(--font-mono); font-size: 0.58rem; color: var(--text-muted); margin-top: 4px; }
.tp-todo {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.tp-todo-check { width: 10px; height: 10px; border: 1.2px solid var(--text-muted); border-radius: 2px; }
.tp-todo-text {
  flex: 1;
  font-family: var(--font-body);
  font-size: 0.65rem;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tp-prio {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--neon-pink);
  background: rgba(255,55,95,0.12);
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 700;
}
.tp-btn-row { display: flex; gap: 0.3rem; margin-top: auto; }
.tp-btn {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  padding: 0.3rem 0.55rem;
  background: var(--gradient-primary);
  color: var(--bg-void);
  border: none;
  border-radius: var(--radius-pill);
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0 8px var(--neon-cyan);
}
.tp-btn.ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  box-shadow: none;
}

@media (max-width: 900px) {
  .settings-layout { grid-template-columns: minmax(0, 1fr); }
  .settings-rail {
    position: static;
    overflow: visible;
  }
  .settings-rail > div:last-of-type {
    flex-direction: row !important;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .set-rail { width: auto; min-width: max-content; }
}

@media (max-width: 720px) {
  .settings-theme-grid { grid-template-columns: minmax(0, 1fr); }
  .settings-content { padding-right: 0; }
  .theme-preview { height: 180px; }
}

`;
