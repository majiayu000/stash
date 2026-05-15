// concept-i.jsx — Command palette (⌘K). Shown overlaid on a dimmed dashboard.

function ConceptI() {
  const { projects, todos, sessions } = window.AppData;
  const [query, setQuery] = React.useState('aur');

  return (
    <div className="dashboard-canvas" style={{position:'relative'}}>
      <div className="inner" style={{overflow:'hidden', height:'100%', filter:'blur(2px) brightness(0.6)', pointerEvents:'none'}}>
        {/* Dim backdrop — reuse a simplified Card Wall snapshot */}
        <Topbar />
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1rem'}}>
          {[1,2,3,4].map(i => (
            <div key={i} className="stat-tile" style={{padding:'1.1rem'}}>
              <div className="stat-tile-label">tokens</div>
              <div className="stat-tile-value">{i*82}k</div>
            </div>
          ))}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1rem'}}>
          {projects.slice(0,3).map(p => <ProjectCardFull key={p.id} p={p} />)}
        </div>
      </div>

      {/* Palette overlay */}
      <div className="cp-overlay">
        <div className="cp-modal">
          <div className="cp-input-row">
            <span className="cp-prompt">⌘K</span>
            <span className="cp-input">
              <span style={{color:'var(--text-primary)'}}>{query}</span>
              <span style={{color:'var(--neon-cyan)',animation:'blink 1s steps(1) infinite'}}>▎</span>
            </span>
            <span className="cp-kbd">esc</span>
          </div>
          <div className="cp-hint">
            <span>type to search · <kbd>↑↓</kbd> nav · <kbd>↵</kbd> open · <kbd>⌘↵</kbd> open in new tab</span>
          </div>

          <div className="cp-results">
            <CpGroup label="actions">
              <CpItem icon="✨" title="New todo" hint="capture an idea or task" kbd="⌘N" />
              <CpItem icon="📁" title="New project" hint="scaffold from local repo / remote / tag" kbd="⌘⇧N" />
              <CpItem icon="📥" title="Show inbox" hint={`${todos.filter(t=>!t.project && !t.done).length} items`} />
              <CpItem icon="🌅" title="Show today" hint={`${todos.filter(t=>t.due==='today' && !t.done).length} items`} />
            </CpGroup>

            <CpGroup label="projects">
              {projects.filter(p => p.name.toLowerCase().includes(query)).map(p => (
                <CpItem key={p.id}
                  icon={p.emoji}
                  title={p.name}
                  selected={p.id === 'aurora'}
                  hint={<span><span style={{color:'var(--neon-cyan)'}}>{p.progress}%</span> · {p.todoCount} todo · ⎇ {p.branch}</span>}
                  badge={p.status === 'active' && p.tokens24h > 0 ? <LiveDot color="var(--neon-green)"/> : null}
                />
              ))}
            </CpGroup>

            <CpGroup label="todos">
              {todos.filter(t => !t.done && (t.text.toLowerCase().includes(query) || (t.project||'').includes(query))).slice(0, 3).map(t => {
                const proj = projects.find(p => p.id === t.project);
                return (
                  <CpItem key={t.id}
                    icon={t.kind === 'idea' ? '💡' : '☐'}
                    title={t.text}
                    hint={<span>{proj ? <span style={{color:'var(--neon-cyan)'}}>#{proj.name}</span> : <span style={{color:'var(--neon-orange)'}}>#inbox</span>} · {t.tags.join(' ')}</span>}
                    badge={<span className={`todo-prio ${t.priority}`} style={{margin:0}}>{t.priority==='high'?'!!':t.priority==='med'?'!':'·'}</span>}
                  />
                );
              })}
            </CpGroup>

            <CpGroup label="sessions">
              {sessions.filter(s => s.title.toLowerCase().includes('auth') || s.project === 'aurora').slice(0, 3).map(s => {
                const proj = projects.find(p => p.id === s.project);
                return (
                  <CpItem key={s.id}
                    icon={s.tool === 'codex' ? '$' : '>'}
                    iconColor={s.tool === 'codex' ? 'var(--neon-purple)' : 'var(--neon-cyan)'}
                    title={s.title}
                    hint={<span>{proj?.emoji} {proj?.name} · {s.model} · {window.fmt.k(s.tokens)} tok · {window.fmt.ago(s.at)}</span>}
                    badge={s.state === 'live' ? <span className="sess-state live" style={{margin:0}}><LiveDot color="var(--neon-green)"/> live</span> : null}
                  />
                );
              })}
            </CpGroup>

            <CpGroup label="filters · views">
              <CpItem icon="📊" title="Switch to Cost & burn analytics" kbd="⌘5" />
              <CpItem icon="🌌" title="Switch to Constellation graph" kbd="⌘4" />
              <CpItem icon="🌙" title="Toggle light theme" kbd="⌘⇧L" />
              <CpItem icon="⚙️" title="Settings…" kbd="⌘," />
            </CpGroup>
          </div>

          <div className="cp-foot">
            <span><kbd>tab</kbd> jump section</span>
            <span><kbd>#</kbd> project filter</span>
            <span><kbd>&gt;</kbd> command mode</span>
            <span style={{marginLeft:'auto',color:'var(--text-muted)'}}>{query.length} chars · 14 results</span>
          </div>
        </div>
      </div>

      <style>{conceptIStyles}</style>
    </div>
  );
}

function CpGroup({ label, children }) {
  return (
    <div className="cp-group">
      <div className="cp-group-label">{label}</div>
      <div className="cp-group-items">{children}</div>
    </div>
  );
}

function CpItem({ icon, iconColor, title, hint, kbd, badge, selected }) {
  return (
    <div className={`cp-item ${selected ? 'sel' : ''}`}>
      <span className="cp-item-icon" style={{color: iconColor}}>{icon}</span>
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
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-deep), 0 0 60px rgba(0, 255, 242, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.3s var(--ease-smooth);
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
.cp-input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 1.05rem;
  color: var(--text-primary);
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

.cp-results {
  flex: 1; min-height: 0;
  overflow-y: auto;
  padding: 0.4rem 0;
}
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
  transition: all var(--transition-fast);
}
.cp-item:hover { background: rgba(255,255,255,0.025); }
.cp-item.sel {
  background: linear-gradient(90deg, rgba(0,255,242,0.10), rgba(191,90,242,0.04));
  border-left-color: var(--neon-cyan);
}
.cp-item-icon {
  font-size: 1rem;
  width: 22px;
  text-align: center;
  font-family: var(--font-mono);
  font-weight: 700;
}
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
.cp-item-hint {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 2px;
}
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

window.ConceptI = ConceptI;
