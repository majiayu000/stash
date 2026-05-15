import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveDot } from '../../components/effects';
import { fmt, type WBData } from '../data';
import { ProjectCardFull, Topbar } from '../shared';

/**
 * Concept I — Command Palette (⌘K).
 * Dimmed dashboard backdrop + modal overlay with searchable groups:
 * actions · projects · todos · sessions · filters/views.
 * Live keyboard handling: type to filter, Esc to close, ↵ (stub) to open.
 */
export function ConceptI({ data }: { data: WBData; reload: () => void }) {
  const { projects, todos, sessions } = data;
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const q = query.toLowerCase();

  // Esc closes the palette → navigate to /.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') navigate('/');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  const filteredTodos = todos.filter((t) => !t.done && (t.text.toLowerCase().includes(q) || (t.project ?? '').toLowerCase().includes(q))).slice(0, 5);
  const filteredSessions = sessions.filter((s) => s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q)).slice(0, 5);
  const totalResults = filteredProjects.length + filteredTodos.length + filteredSessions.length + 4 + 4;
  const inboxCount = todos.filter((t) => !t.project && !t.done).length;
  const todayCount = todos.filter((t) => t.due === 'today' && !t.done).length;

  return (
    <div className="dashboard-canvas" style={{ position: 'relative' }}>
      {/* Dim backdrop */}
      <div className="inner" style={{ overflow: 'hidden', height: '100%', filter: 'blur(2px) brightness(0.6)', pointerEvents: 'none' }}>
        <Topbar data={data} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-tile" style={{ padding: '1.1rem' }}>
              <div className="stat-tile-label">tokens</div>
              <div className="stat-tile-value">{i * 82}k</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
          {projects.slice(0, 3).map((p) => <ProjectCardFull key={p.id} p={p} />)}
        </div>
      </div>

      {/* Palette */}
      <div className="cp-overlay">
        <div className="cp-modal">
          <div className="cp-input-row">
            <span className="cp-prompt">⌘K</span>
            <span className="cp-input" style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="type to search projects · todos · sessions · actions"
                data-testid="palette-input"
                style={{ width: '100%', background: 'transparent', border: 0, outline: 0, fontFamily: 'var(--font-mono)', fontSize: '1.05rem', color: 'var(--text-primary)' }}
              />
            </span>
            <span className="cp-kbd">esc</span>
          </div>
          <div className="cp-hint">
            <span>type to search · <kbd>↑↓</kbd> nav · <kbd>↵</kbd> open · <kbd>⌘↵</kbd> open in new tab</span>
          </div>

          <div className="cp-results">
            <CpGroup label="actions">
              <CpItem icon="✨" title="New todo"   hint="capture an idea or task"             kbd="⌘N" onClick={() => navigate('/')} />
              <CpItem icon="📁" title="New project" hint="scaffold from local repo / remote / tag" kbd="⌘⇧N" onClick={() => navigate('/c/f')} />
              <CpItem icon="📥" title="Show inbox"  hint={`${inboxCount} items`} onClick={() => navigate('/')} />
              <CpItem icon="🌅" title="Show today"  hint={`${todayCount} items`} onClick={() => navigate('/')} />
            </CpGroup>

            <CpGroup label="projects">
              {filteredProjects.length === 0
                ? <CpItem icon="·" title="(no matches)" hint="try a different query" />
                : filteredProjects.slice(0, 5).map((p, i) => (
                  <CpItem
                    key={p.id}
                    icon={p.emoji}
                    title={p.name}
                    selected={i === 0}
                    hint={<><span style={{ color: 'var(--neon-cyan)' }}>{p.progress}%</span> · {p.todoCount} todo {p.branch ? `· ⎇ ${p.branch}` : ''}</>}
                    badge={p.status === 'active' && p.tokens24h > 0 ? <LiveDot color="var(--neon-green)" /> : null}
                    onClick={() => navigate(`/c/k/${p.id}`)}
                  />
                ))}
            </CpGroup>

            <CpGroup label="todos">
              {filteredTodos.length === 0
                ? <CpItem icon="·" title="(no open todos match)" />
                : filteredTodos.map((t) => {
                  const proj = projects.find((p) => p.id === t.project);
                  return (
                    <CpItem
                      key={t.id}
                      icon={t.kind === 'idea' ? '💡' : '☐'}
                      title={t.text}
                      hint={<>{proj ? <span style={{ color: 'var(--neon-cyan)' }}>#{proj.name}</span> : <span style={{ color: 'var(--neon-orange)' }}>#inbox</span>} · {t.tags.join(' ')}</>}
                      badge={<span className={`todo-prio ${t.priority}`} style={{ margin: 0 }}>{t.priority === 'high' ? '!!' : t.priority === 'med' ? '!' : '·'}</span>}
                      onClick={() => navigate(`/c/l/${t.id}`)}
                    />
                  );
                })}
            </CpGroup>

            <CpGroup label="sessions">
              {filteredSessions.length === 0
                ? <CpItem icon="·" title="(no sessions match)" />
                : filteredSessions.map((s) => {
                  const proj = projects.find((p) => p.id === s.project);
                  return (
                    <CpItem
                      key={s.id}
                      icon={s.tool === 'codex' ? '$' : '>'}
                      iconColor={s.tool === 'codex' ? 'var(--neon-purple)' : 'var(--neon-cyan)'}
                      title={s.title}
                      hint={<>{proj?.emoji} {proj?.name ?? s.project} · {s.model} · {fmt.k(s.tokens)} tok · {fmt.ago(s.at)}</>}
                      badge={s.state === 'live' ? <span className="sess-state live" style={{ margin: 0 }}><LiveDot color="var(--neon-green)" /> live</span> : null}
                      onClick={() => navigate(`/c/g/${s.id}`)}
                    />
                  );
                })}
            </CpGroup>

            <CpGroup label="filters · views">
              <CpItem icon="📊" title="Switch to Cost & burn"  kbd="⌘5" onClick={() => navigate('/c/h')} />
              <CpItem icon="🌌" title="Switch to Constellation" kbd="⌘4" onClick={() => navigate('/c/d')} />
              <CpItem icon="🧩" title="Skills library"          kbd="⌘6" onClick={() => navigate('/c/m')} />
              <CpItem icon="⚙️" title="Settings…"               kbd="⌘," onClick={() => navigate('/c/n')} />
            </CpGroup>
          </div>

          <div className="cp-foot">
            <span><kbd>tab</kbd> jump section</span>
            <span><kbd>#</kbd> project filter</span>
            <span><kbd>&gt;</kbd> command mode</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{query.length} chars · {totalResults} results</span>
          </div>
        </div>
      </div>

      <style>{conceptIStyles}</style>
    </div>
  );
}

function CpGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cp-group">
      <div className="cp-group-label">{label}</div>
      <div className="cp-group-items">{children}</div>
    </div>
  );
}

function CpItem({ icon, iconColor, title, hint, kbd, badge, selected, onClick }: {
  icon: string; iconColor?: string; title: string;
  hint?: ReactNode; kbd?: string; badge?: ReactNode; selected?: boolean; onClick?: () => void;
}) {
  return (
    <div className={`cp-item ${selected ? 'sel' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="cp-item-icon" style={{ color: iconColor }}>{icon}</span>
      <div className="cp-item-body">
        <div className="cp-item-title">{title}</div>
        {hint && <div className="cp-item-hint">{hint}</div>}
      </div>
      {badge && <span className="cp-item-badge">{badge}</span>}
      {kbd && <span className="cp-item-kbd">{kbd}</span>}
    </div>
  );
}

const conceptIStyles = `
.cp-overlay {
  position: absolute;
  inset: 0;
  background: rgba(5, 5, 8, 0.5);
  backdrop-filter: blur(6px);
  z-index: 10;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 4rem;
}
.cp-modal {
  width: min(720px, 90%);
  max-height: 80%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl, 16px);
  box-shadow: var(--shadow-deep, 0 25px 50px rgba(0,0,0,0.6)), 0 0 60px rgba(0, 255, 242, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.3s var(--ease-smooth, ease);
}
.cp-input-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
}
.cp-prompt {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.08);
  border: 1px solid rgba(0,255,242,0.25);
  padding: 3px 7px;
  border-radius: 4px;
  font-weight: 600;
}
.cp-kbd {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 3px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
}
.cp-hint {
  padding: 0.4rem 1.25rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-hair);
}
.cp-hint kbd {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
  border: 1px solid rgba(0,255,242,0.2);
  padding: 0 5px;
  border-radius: 3px;
  margin: 0 2px;
}

.cp-results { flex: 1; min-height: 0; overflow-y: auto; padding: 0.4rem 0; }
.cp-group { margin-bottom: 0.4rem; }
.cp-group-label {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.4rem 1.25rem 0.2rem;
  font-weight: 600;
}
.cp-group-items { display: flex; flex-direction: column; }
.cp-item {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.55rem 1.25rem;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: all var(--transition-fast, 0.2s);
}
.cp-item:hover { background: rgba(255,255,255,0.025); }
.cp-item.sel {
  background: linear-gradient(90deg, rgba(0,255,242,0.10), rgba(191,90,242,0.04));
  border-left-color: var(--neon-cyan);
}
.cp-item-icon { font-size: 1rem; width: 22px; text-align: center; font-family: var(--font-mono); font-weight: 700; }
.cp-item-body { flex: 1; min-width: 0; }
.cp-item-title {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cp-item.sel .cp-item-title { color: var(--neon-cyan); text-shadow: 0 0 12px rgba(0,255,242,0.5); }
.cp-item-hint { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
.cp-item-badge { flex-shrink: 0; }
.cp-item-kbd {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  padding: 2px 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  flex-shrink: 0;
}
.cp-foot {
  display: flex; gap: 1rem; align-items: center;
  padding: 0.7rem 1.25rem;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-secondary);
}
.cp-foot kbd {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  padding: 1px 6px;
  border-radius: 3px;
  margin-right: 4px;
}
`;
