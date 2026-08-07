import { useNavigate } from 'react-router-dom';
import type { Skill } from '@stash/shared';
import { fmt, type WBProject } from '../data';

/** Skill card grid entries and the right-hand detail panel. */

export function sourceColorFor(source: Skill['source']): string {
  return source === 'official' ? 'var(--neon-green)' : 'var(--neon-purple)';
}

export function SkillCard({ s, selected, onClick, bindings }: { s: Skill; selected: boolean; onClick: () => void; bindings: WBProject[] }) {
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

export function SkillDetail({ s, bindings, allProjects, focusProjectId, projectSkills, onToggleBinding, onInstallToggle, onDelete, onNotice }: {
  s: Skill;
  bindings: WBProject[];
  allProjects: WBProject[];
  focusProjectId?: string;
  projectSkills: Record<string, string[]>;
  onToggleBinding: (projectId: string, skillId: string, enabled: boolean) => Promise<void>;
  onInstallToggle: (skill: Skill) => Promise<void>;
  onDelete: (skill: Skill) => void;
  onNotice: (notice: { message: string; tone: 'ok' | 'error' }) => void;
}) {
  const color = sourceColorFor(s.source);
  const navigate = useNavigate();
  function copyInstall() {
    const cmd = `sk install ${s.source === 'official' ? '' : s.source + '/'}${s.id}`;
    if (!navigator.clipboard?.writeText) {
      onNotice({ message: 'Clipboard is not available.', tone: 'error' });
      return;
    }
    void navigator.clipboard.writeText(cmd)
      .then(() => onNotice({ message: 'Install command copied', tone: 'ok' }))
      .catch((e) => onNotice({ message: e instanceof Error ? e.message : String(e), tone: 'error' }));
  }
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
        <SkillStatusSummary s={s} bindings={bindings} />
        <div className="install-cmd">
          <span className="install-prefix">$</span>
          <span className="install-text">sk install {s.source === 'official' ? '' : s.source + '/'}{s.id}</span>
          <button className="copy-btn" type="button" onClick={copyInstall} title="copy">📋</button>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
          {s.installed
            ? <button className="np-btn ghost"   type="button" onClick={() => { void onInstallToggle(s); }} style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}>uninstall</button>
            : <button className="np-btn primary" type="button" onClick={() => { void onInstallToggle(s); }} style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}>install</button>}
          <button
            className="np-btn ghost"
            type="button"
            onClick={() => { onDelete(s); }}
            data-testid="cm-delete"
            style={{ padding: '0.45rem 1rem', fontSize: '0.75rem', color: 'var(--neon-pink)', marginLeft: 'auto' }}
          >🗑 delete</button>
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
                className={`sk-binding-row${p.id === focusProjectId ? ' focused' : ''}`}
                type="button"
                onClick={() => { void onToggleBinding(p.id, s.id, !bound); }}
                style={{ background: 'transparent', textAlign: 'left' }}
                data-testid={`skill-binding-${p.id}`}
                data-focused={p.id === focusProjectId ? 'true' : undefined}
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
          <span className="prompt">&gt;</span> bound projects <span className="count">— {bindings.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bindings.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              not bound to any project. toggle a row above to bind.
            </div>
          ) : (
            bindings.map((p) => (
              <button key={p.id} type="button" onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 6, padding: '5px 8px', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: '0.95rem' }}>{p.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>last touched {fmt.ago(p.lastTouched)}</div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }}>open</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export function SkillStatusSummary({ s, bindings }: { s: Skill; bindings: WBProject[] }) {
  return (
    <div className="sk-status-grid" data-testid="cm-status-summary">
      <div className="sk-status-card">
        <span>Availability</span>
        <strong>{s.installed ? 'installed' : 'not installed'}</strong>
        <em>available in local stash library</em>
      </div>
      <div className="sk-status-card">
        <span>Activation</span>
        <strong>{bindings.length} project{bindings.length === 1 ? '' : 's'}</strong>
        <em>bindings control session auto-load</em>
      </div>
      <div className="sk-status-card">
        <span>Source</span>
        <strong>{s.source}</strong>
        <em>{s.source === 'official' ? 'trusted starter content' : 'local community skill'}</em>
      </div>
    </div>
  );
}
