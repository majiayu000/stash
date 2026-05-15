// concept-o.jsx — Start session dispatcher. Send a prompt to a tool/model.

function ConceptO() {
  const { projects, skills, projectSkills } = window.AppData;
  const selectedProject = projects[0]; // aurora
  const boundSkills = projectSkills[selectedProject.id].map(id => skills.find(s => s.id === id));

  return (
    <div className="dashboard-canvas" style={{position:'relative'}}>
      {/* Dim backdrop */}
      <div className="inner" style={{overflow:'hidden', height:'100%', filter:'blur(2px) brightness(0.5)', pointerEvents:'none'}}>
        <Topbar />
      </div>

      <div className="td-overlay">
        <div className="ss-modal">
          <div className="ss-modal-head">
            <span style={{fontSize:'1.6rem',filter:'drop-shadow(0 0 14px var(--neon-cyan))'}}>▶</span>
            <div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>start session</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:'1.25rem',fontWeight:700}}>
                <ShinyText>dispatch to agent</ShinyText>
              </div>
            </div>
            <button className="td-close" style={{marginLeft:'auto'}}>✕</button>
          </div>

          {/* Prompt */}
          <div className="ss-section">
            <label className="ss-label">prompt</label>
            <div className="ss-prompt">
              <span style={{color:'var(--neon-cyan)',fontFamily:'var(--font-mono)',fontWeight:700,marginTop:2}}>$</span>
              <div style={{flex:1,fontFamily:'var(--font-mono)',fontSize:'0.95rem',color:'var(--text-primary)',lineHeight:1.6,minHeight:80}}>
                wire the oauth callback to the new session store. should use the JWT helper already in src/auth/jwt.ts<br/>
                <span style={{color:'var(--text-muted)'}}>also: make sure to test the expired-token case — that's what bit us on Friday</span>
                <span style={{color:'var(--neon-cyan)',animation:'blink 1s steps(1) infinite'}}>▎</span>
              </div>
            </div>
            <div className="ss-hint">
              <span><kbd>#</kbd> reference project</span>
              <span><kbd>@file</kbd> attach file</span>
              <span><kbd>↑</kbd> previous prompt</span>
              <span style={{marginLeft:'auto',color:'var(--text-muted)'}}>~280 tokens · 1.4k context</span>
            </div>
          </div>

          {/* Project + tool + model */}
          <div className="ss-grid">
            <div className="ss-section">
              <label className="ss-label">project</label>
              <button className="ss-picker">
                <span style={{fontSize:'1.1rem'}}>{selectedProject.emoji}</span>
                <div style={{flex:1,textAlign:'left'}}>
                  <div className="ss-picker-name">{selectedProject.name}</div>
                  <div className="ss-picker-sub">⎇ {selectedProject.branch}</div>
                </div>
                <span style={{color:'var(--text-muted)'}}>▾</span>
              </button>
            </div>

            <div className="ss-section">
              <label className="ss-label">tool</label>
              <div className="ss-toolrow">
                <ToolBtn name="claude code" active glyph=">" color="var(--neon-cyan)" />
                <ToolBtn name="codex" glyph="$" color="var(--neon-purple)" />
                <ToolBtn name="aider" glyph="✱" color="var(--text-muted)" />
              </div>
            </div>

            <div className="ss-section">
              <label className="ss-label">model</label>
              <div className="ss-toolrow">
                <ModelBtn name="sonnet-4.5" active rate="$3 / Mtok" />
                <ModelBtn name="haiku-4.5"  rate="$0.80 / Mtok" />
                <ModelBtn name="opus-4.5"   rate="$15 / Mtok" />
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="ss-section">
            <label className="ss-label">
              skills to load
              <span style={{color:'var(--text-muted)',fontWeight:400,marginLeft:6}}>· auto-loaded from project bindings, toggle off any</span>
            </label>
            <div className="ss-skills">
              {boundSkills.map(s => <SkillToggle key={s.id} s={s} on />)}
              <button className="td-tag td-tag-add" style={{padding:'4px 9px'}}>+ add skill</button>
            </div>
          </div>

          {/* Context */}
          <div className="ss-section">
            <label className="ss-label">
              load as context
              <span style={{color:'var(--text-muted)',fontWeight:400,marginLeft:6}}>· auto-included in system prompt</span>
            </label>
            <div className="ss-ctx-grid">
              <ContextRow on icon="🎯" name="project intent" sub="1 sentence · ~80 tok" />
              <ContextRow on icon="📜" name="decision log · last 5" sub="4 entries · ~600 tok" />
              <ContextRow on icon="📖" name="notes / scratchpad" sub="full md · ~1.2k tok" />
              <ContextRow on icon="💎" name="lessons (cross-proj match)" sub="2 matched · ~200 tok" />
              <ContextRow icon="📂" name="recent diffs (last 24h)" sub="3 files · ~800 tok" />
              <ContextRow icon="🔗" name="linked sessions" sub="2 sessions · ~3k tok" />
            </div>
          </div>

          {/* Budget */}
          <div className="ss-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
            <div className="ss-section">
              <label className="ss-label">budget cap</label>
              <div className="ss-budget">
                <span className="ss-budget-prefix">$</span>
                <span className="ss-budget-value">0.50</span>
                <span className="ss-budget-suffix">stop on overrun</span>
              </div>
            </div>
            <div className="ss-section">
              <label className="ss-label">token cap</label>
              <div className="ss-budget">
                <span className="ss-budget-prefix" style={{color:'var(--neon-purple)'}}>≤</span>
                <span className="ss-budget-value">80k</span>
                <span className="ss-budget-suffix">tool output truncated above</span>
              </div>
            </div>
          </div>

          {/* Foot */}
          <div className="ss-foot">
            <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)'}}>
              estimated: <span style={{color:'var(--text-primary)'}}>~14k tokens · $0.19</span>
              <span style={{margin:'0 0.4rem'}}>·</span>
              auto-skill load: <span style={{color:'var(--neon-cyan)'}}>5 of 7</span>
            </span>
            <span style={{flex:1}}/>
            <button className="np-btn ghost">save as recipe</button>
            <button className="np-btn ghost">cancel <kbd>esc</kbd></button>
            <button className="np-btn primary">▶ dispatch <kbd>⌘↵</kbd></button>
          </div>
        </div>
      </div>
      <style>{conceptOStyles}</style>
    </div>
  );
}

function ToolBtn({ name, active, glyph, color }) {
  return (
    <button className={`ss-tool ${active?'active':''}`}>
      <span style={{color,fontFamily:'var(--font-mono)',fontWeight:700,fontSize:'1rem'}}>{glyph}</span>
      <span>{name}</span>
    </button>
  );
}

function ModelBtn({ name, active, rate }) {
  return (
    <button className={`ss-tool ${active?'active':''}`}>
      <div style={{flex:1,textAlign:'left',minWidth:0}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'var(--text-muted)',marginTop:1}}>{rate}</div>
      </div>
    </button>
  );
}

function SkillToggle({ s, on }) {
  return (
    <button className={`ss-skill ${on?'on':''}`}>
      <span style={{fontSize:'0.95rem',filter: on?'drop-shadow(0 0 6px var(--neon-cyan))':'grayscale(1) opacity(0.6)'}}>{s.emoji}</span>
      <span>{s.name}</span>
    </button>
  );
}

function ContextRow({ on, icon, name, sub }) {
  return (
    <label className={`ss-ctx ${on?'on':''}`}>
      <span style={{fontSize:'1.1rem',flexShrink:0,opacity: on?1:0.5}}>{icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color: on?'var(--text-primary)':'var(--text-secondary)',fontWeight: on?600:400,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-muted)'}}>{sub}</div>
      </div>
      <span className={`kw-skill-toggle ${on?'on':''}`}><span className="kw-skill-toggle-knob"/></span>
    </label>
  );
}

const conceptOStyles = `
.ss-modal {
  width: min(820px, 100%);
  max-height: calc(100% - 2rem);
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-deep), 0 0 50px rgba(0,255,242,0.2), inset 0 1px 0 rgba(255,255,255,0.06);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.3s var(--ease-smooth);
}
.ss-modal-head {
  display: flex; align-items: center; gap: 0.85rem;
  padding: 1.1rem 1.3rem;
  border-bottom: 1px solid var(--border-subtle);
}
.ss-modal > * + * { padding-left: 1.3rem; padding-right: 1.3rem; }
.ss-section {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.ss-section + .ss-section, .ss-section + .ss-grid, .ss-grid + .ss-section, .ss-grid + .ss-grid {
  border-top: 1px solid var(--border-hair);
}
.ss-label {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.ss-prompt {
  display: flex; gap: 0.65rem; align-items: flex-start;
  padding: 0.85rem 1rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 25px rgba(0,255,242,0.04);
}
.ss-hint {
  display: flex; gap: 1rem; align-items: center;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.ss-hint kbd {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
  border: 1px solid rgba(0,255,242,0.2);
  padding: 0 5px;
  border-radius: 3px;
  margin-right: 4px;
}

.ss-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}
.ss-grid .ss-section { padding: 0; border: 0; }

.ss-picker, .ss-tool {
  display: flex; align-items: center; gap: 0.55rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  transition: all var(--transition-fast);
  text-align: left;
}
.ss-picker:hover, .ss-tool:hover { border-color: var(--border-glow); }
.ss-tool.active {
  background: rgba(0,255,242,0.06);
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
  box-shadow: 0 0 14px rgba(0,255,242,0.12);
}
.ss-picker-name { font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.ss-picker-sub  { font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-muted); margin-top: 1px; }
.ss-toolrow { display: grid; grid-template-columns: 1fr; gap: 0.4rem; }

.ss-skills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.ss-skill {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.ss-skill.on {
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
}

.ss-ctx-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.ss-ctx {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.ss-ctx:hover { border-color: var(--border-glow); }
.ss-ctx.on { border-color: rgba(0,255,242,0.25); background: rgba(0,255,242,0.03); }

.ss-budget {
  display: flex; align-items: baseline; gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
}
.ss-budget-prefix {
  color: var(--neon-green);
  font-weight: 700;
  font-size: 1.1rem;
}
.ss-budget-value {
  color: var(--text-primary);
  font-weight: 700;
  font-size: 1.1rem;
  flex: 1;
}
.ss-budget-suffix {
  font-size: 0.66rem;
  color: var(--text-muted);
}

.ss-foot {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.85rem 1.3rem;
  border-top: 1px solid var(--border-subtle);
  background: rgba(0,0,0,0.15);
  margin: 0 !important;
}
`;

window.ConceptO = ConceptO;
