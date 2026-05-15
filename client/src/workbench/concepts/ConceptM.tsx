import { useEffect, useState } from 'react';
import type { Skill } from '@stash/shared';
import {
  listProjectSkills,
  listSkills,
  toggleProjectSkill,
  updateSkill,
} from '../../api/skills';
import { fmt, type WBData, type WBProject } from '../data';
import { StatTile, Topbar } from '../shared';

/**
 * Concept M — Skills library. Search + tabs + 2-col grid of skill cards on
 * the left, detail panel (header, project bindings, recent uses) on the right.
 *
 * Data: real /api/skills + per-project bindings via /api/projects/:id/skills.
 */
export function ConceptM({ data }: { data: WBData; reload: () => void }) {
  const { projects } = data;
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projectSkills, setProjectSkills] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const fetched = await listSkills();
      if (cancelled) return;
      setSkills(fetched);
      if (!selectedId && fetched[0]) setSelectedId(fetched[0].id);

      const entries = await Promise.all(
        projects.map(async (p) => {
          const bindings = await listProjectSkills(p.id);
          return [p.id, bindings.filter((b) => b.enabled).map((b) => b.skillId)] as const;
        }),
      );
      if (cancelled) return;
      setProjectSkills(Object.fromEntries(entries));
      setLoading(false);
    }
    load().catch(() => setLoading(false));
    return () => { cancelled = true; };
    // projects is loaded once with WBData; selectedId start only on first paint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);

  async function handleToggleBinding(projectId: string, skillId: string, enabled: boolean) {
    await toggleProjectSkill(projectId, skillId, enabled);
    setProjectSkills((cur) => {
      const set = new Set(cur[projectId] ?? []);
      if (enabled) set.add(skillId); else set.delete(skillId);
      return { ...cur, [projectId]: Array.from(set) };
    });
  }

  async function handleInstallToggle(skill: Skill) {
    const next = await updateSkill(skill.id, { installed: !skill.installed });
    setSkills((cur) => cur.map((s) => (s.id === next.id ? next : s)));
  }

  const selected = skills.find((s) => s.id === selectedId) ?? skills[0];
  const bindingsFor = (skillId: string): WBProject[] =>
    projects.filter((p) => projectSkills[p.id]?.includes(skillId));

  const installedCount = skills.filter((s) => s.installed).length;
  const activeBindings = Object.values(projectSkills).reduce((sum, ids) => sum + ids.length, 0);

  if (!loading && skills.length === 0) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
          <Topbar data={data} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '4rem 2rem', textAlign: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '2rem', opacity: 0.5 }}>🧩</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)' }}>no skills registered</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 420 }}>
              add an entry via <code style={{ color: 'var(--neon-cyan)' }}>POST /api/skills</code> or run the seed to populate the registry.
            </div>
          </div>
        </div>
        <style>{conceptMStyles}</style>
      </div>
    );
  }
  if (!selected) return null;

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        {/* Search + tabs */}
        <div className="sk-bar">
          <div className="sk-search">
            <span style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>🔍</span>
            <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              browse skills<span style={{ color: 'var(--neon-cyan)', animation: 'blink 1s steps(1) infinite' }}>▎</span>
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 3 }}>/</span>
          </div>
          <div className="sk-tabs">
            <button className="sk-tab active" type="button">all <span>{skills.length}</span></button>
            <button className="sk-tab" type="button">installed <span>{installedCount}</span></button>
            <button className="sk-tab" type="button">bound <span>{activeBindings}</span></button>
            <button className="sk-tab" type="button">official ✓</button>
            <button className="sk-tab" type="button">community</button>
          </div>
          <button className="np-btn primary" type="button" style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem' }}>+ browse registry</button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
          <StatTile label="installed"        value={installedCount} foot={<span>of {skills.length} known</span>} />
          <StatTile label="project bindings" tone="purple" value={activeBindings} foot={<span>across {Object.keys(projectSkills).length} projects</span>} />
          <StatTile label="used · 7d"        tone="green"  value={184}            foot={<span><span className="up">↑ 23%</span> vs prior 7d</span>} />
          <StatTile label="favorites"        tone="orange" value={3}              foot={<span>auto-load on new project</span>} />
        </div>

        {/* Main */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          {/* Grid */}
          <div style={{ minWidth: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
            <div className="sec-head">
              <span className="prompt">&gt;</span> skills <span className="count">— sort: stars · ↓</span>
            </div>
            <div className="sk-grid">
              {skills.map((s) => (
                <SkillCard
                  key={s.id}
                  s={s}
                  selected={s.id === selected.id}
                  onClick={() => setSelectedId(s.id)}
                  bindings={bindingsFor(s.id)}
                />
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0, overflowY: 'auto' }}>
            <SkillDetail
              s={selected}
              bindings={bindingsFor(selected.id)}
              allProjects={projects}
              projectSkills={projectSkills}
              onToggleBinding={handleToggleBinding}
              onInstallToggle={handleInstallToggle}
            />
          </div>
        </div>
      </div>

      <style>{conceptMStyles}</style>
    </div>
  );
}

function sourceColorFor(source: Skill['source']): string {
  return source === 'official' ? 'var(--neon-green)' : 'var(--neon-purple)';
}

function SkillCard({ s, selected, onClick, bindings }: { s: Skill; selected: boolean; onClick: () => void; bindings: WBProject[] }) {
  const color = sourceColorFor(s.source);
  return (
    <button className={`sk-card ${selected ? 'sel' : ''} ${!s.installed ? 'uninstalled' : ''}`} onClick={onClick} type="button">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.5rem', filter: s.installed ? `drop-shadow(0 0 10px ${color})` : 'grayscale(1) brightness(0.6)', flexShrink: 0, lineHeight: 1 }}>{s.emoji}</span>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="sk-card-name">{s.name}</span>
            {s.source === 'official' && <span className="sk-official">✓</span>}
          </div>
          <div className="sk-card-source" style={{ color }}>{s.source}</div>
        </div>
        <span className="sk-card-stars">⭐ {s.stars >= 1000 ? (s.stars / 1000).toFixed(1) + 'k' : s.stars}</span>
      </div>
      <div className="sk-card-desc">{s.description ?? ''}</div>
      <div className="sk-card-foot">
        {s.installed
          ? <span className="sk-installed">● installed</span>
          : <span className="sk-uninstalled">○ not installed</span>}
        {bindings.length > 0 && (
          <span className="sk-bindings">
            {bindings.slice(0, 4).map((p) => <span key={p.id} className="sk-binding-emoji" title={p.name}>{p.emoji}</span>)}
            {bindings.length > 4 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)', marginLeft: 3 }}>+{bindings.length - 4}</span>}
          </span>
        )}
      </div>
    </button>
  );
}

function SkillDetail({ s, bindings, allProjects, projectSkills, onToggleBinding, onInstallToggle }: {
  s: Skill;
  bindings: WBProject[];
  allProjects: WBProject[];
  projectSkills: Record<string, string[]>;
  onToggleBinding: (projectId: string, skillId: string, enabled: boolean) => Promise<void>;
  onInstallToggle: (skill: Skill) => Promise<void>;
}) {
  const color = sourceColorFor(s.source);
  return (
    <>
      <div className="sk-detail-head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <span style={{ fontSize: '2.6rem', filter: `drop-shadow(0 0 18px ${color})`, lineHeight: 1, flexShrink: 0 }}>{s.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 16px rgba(0,255,242,0.4)', lineHeight: 1.2, margin: 0 }}>{s.name}</h3>
              {s.source === 'official' && <span className="sk-official">✓</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
              <span style={{ color, fontWeight: 600 }}>{s.source}</span> · ⭐ {s.stars.toLocaleString()} · {bindings.length} bindings
            </div>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.85rem' }}>{s.description ?? ''}</div>
        <div className="install-cmd">
          <span className="install-prefix">$</span>
          <span className="install-text">sk install {s.source === 'official' ? '' : s.source + '/'}{s.id}</span>
          <button className="copy-btn" type="button">📋</button>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
          {s.installed
            ? <button className="np-btn ghost"   type="button" onClick={() => { onInstallToggle(s); }} style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}>uninstall</button>
            : <button className="np-btn primary" type="button" onClick={() => { onInstallToggle(s); }} style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}>install</button>}
          <button className="sd-action" type="button">📖 readme</button>
          <button className="sd-action" type="button">⚙ config</button>
        </div>
      </div>

      <div className="surface" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.7rem' }}>
          <span className="prompt">&gt;</span> project bindings <span className="count">— {bindings.length}/{allProjects.length}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.7rem' }}>
          toggle to auto-load this skill when starting a session on that project.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {allProjects.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no projects yet</div>
          ) : allProjects.map((p) => {
            const bound = projectSkills[p.id]?.includes(s.id) ?? false;
            return (
              <button
                key={p.id}
                className="sk-binding-row"
                type="button"
                onClick={() => { onToggleBinding(p.id, s.id, !bound); }}
                style={{ background: 'transparent', textAlign: 'left' }}
              >
                <span style={{ fontSize: '1.05rem' }}>{p.emoji}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: bound ? 'var(--neon-cyan)' : 'var(--text-secondary)', fontWeight: bound ? 600 : 400 }}>{p.name}</span>
                {bound && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>last used {fmt.ago(p.lastTouched)}</span>}
                <span className={`kw-skill-toggle ${bound ? 'on' : ''}`}>
                  <span className="kw-skill-toggle-knob" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="surface" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
          <span className="prompt">&gt;</span> recent uses <span className="count">— stub · last 7d</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bindings.slice(0, 3).map((p, i) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 6, padding: '5px 8px', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.95rem' }}>{p.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{['patched session.ts (+24 -3)', 'audit log schema review', 'oauth provider scaffolding'][i] ?? 'recent use'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{p.name} · {fmt.ago(p.lastTouched - i * 86400_000)}</div>
              </div>
              <span style={{ color: 'var(--neon-cyan)', fontSize: '0.66rem' }}>↗ s{i + 1}</span>
            </div>
          ))}
          {bindings.length === 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(no recent uses — bind to a project first)</div>
          )}
        </div>
      </div>
    </>
  );
}

const conceptMStyles = `
.sk-bar {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl, 16px);
  margin-bottom: 1.25rem;
}
.sk-search {
  display: flex; align-items: center; gap: 0.65rem;
  padding: 0.55rem 0.9rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 20px rgba(0,255,242,0.04);
}
.sk-tabs { display: flex; gap: 0.35rem; }
.sk-tab {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  white-space: nowrap;
}
.sk-tab span {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}
.sk-tab:hover { border-color: var(--border-glow); color: var(--text-primary); }
.sk-tab.active { background: var(--gradient-primary); color: var(--bg-void); border-color: transparent; font-weight: 600; }
.sk-tab.active span { background: rgba(0,0,0,0.2); color: var(--bg-void); }

.sk-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.85rem; }
.sk-card {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem;
  cursor: pointer;
  text-align: left;
  display: flex; flex-direction: column;
  transition: all var(--transition-base, 0.25s);
  position: relative;
  overflow: hidden;
}
.sk-card:hover { border-color: var(--border-glow); transform: translateY(-3px); box-shadow: var(--shadow-card, 0 20px 40px rgba(0,0,0,0.4)); }
.sk-card.sel {
  border-color: var(--neon-cyan);
  background: linear-gradient(135deg, rgba(0,255,242,0.06), var(--bg-glass) 30%);
  box-shadow: 0 0 25px rgba(0,255,242,0.15);
}
.sk-card.uninstalled { opacity: 0.6; }
.sk-card.uninstalled:hover { opacity: 1; }

.sk-card-name { font-family: var(--font-mono); font-size: 0.95rem; font-weight: 600; color: var(--neon-cyan); text-shadow: 0 0 14px rgba(0,255,242,0.3); }
.sk-card-source { font-family: var(--font-mono); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; font-weight: 600; }
.sk-card-stars {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--neon-orange);
  font-weight: 600;
  padding: 2px 7px;
  background: rgba(255,159,10,0.1);
  border: 1px solid rgba(255,159,10,0.2);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.sk-card-desc {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.55;
  margin-bottom: 0.7rem;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sk-card-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border-hair);
}
.sk-installed { font-family: var(--font-mono); font-size: 0.7rem; color: var(--neon-green); font-weight: 600; }
.sk-uninstalled { font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); }
.sk-bindings { display: flex; align-items: center; gap: 3px; }
.sk-binding-emoji { font-size: 0.95rem; opacity: 0.9; }

.sk-official {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--neon-green), var(--neon-cyan));
  color: var(--bg-void);
  font-size: 0.6rem;
  font-weight: 700;
  box-shadow: 0 0 8px rgba(48,209,88,0.5);
}

.sk-detail-head {
  background: linear-gradient(135deg, rgba(0,255,242,0.06), rgba(191,90,242,0.03));
  border: 1px solid rgba(0,255,242,0.2);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  position: relative;
  overflow: hidden;
}
.sk-detail-head::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--gradient-primary); }

.sk-binding-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.6rem;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast, 0.2s);
}
.sk-binding-row:hover { border-color: var(--border-glow); }

.install-cmd {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
.install-prefix { color: var(--neon-cyan); font-weight: 700; }
.install-text { color: var(--text-primary); flex: 1; }
.copy-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border-hair);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.copy-btn:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

/* SkillDetail uses .kw-skill-toggle styles already defined in ConceptK.tsx scope.
   Re-defining here for isolation. */
.kw-skill-toggle {
  width: 28px; height: 16px;
  background: var(--bg-elevated);
  border-radius: 8px;
  position: relative;
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
  transition: all var(--transition-fast, 0.2s);
}
.kw-skill-toggle.on {
  background: var(--gradient-primary);
  border-color: transparent;
  box-shadow: 0 0 10px rgba(0,255,242,0.4);
}
.kw-skill-toggle-knob {
  position: absolute;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--text-secondary);
  top: 1px; left: 1px;
  transition: all var(--transition-fast, 0.2s);
}
.kw-skill-toggle.on .kw-skill-toggle-knob { background: var(--bg-void); left: 13px; }
`;
