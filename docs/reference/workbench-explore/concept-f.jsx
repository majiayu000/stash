// concept-f.jsx — New project flow + project edit detail.
// Shows: the "+ new project" modal, an empty-state for fresh projects,
// and a side-by-side "edit project" panel for managing existing ones.

function ConceptF() {
  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{overflow:'hidden', height:'100%'}}>
        <Topbar />
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem', flex:1, minHeight:0}}>
          <NewProjectModal />
          <EditProjectPanel />
        </div>
      </div>
      <style>{conceptFStyles}</style>
    </div>
  );
}

function NewProjectModal() {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1rem',minHeight:0}}>
      <div className="sec-head" style={{marginBottom:0,whiteSpace:'nowrap',overflow:'hidden'}}>
        <span className="prompt">&gt;</span> new project flow
        <span className="right" style={{whiteSpace:'nowrap'}}>via + new project</span>
      </div>

      <div className="np-modal">
        <div className="np-header">
          <div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>new project</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'1.25rem',fontWeight:700,color:'var(--neon-cyan)',textShadow:'0 0 18px rgba(0,255,242,0.4)',marginTop:2,whiteSpace:'nowrap'}}>
              <ShinyText>scaffold a project</ShinyText>
            </div>
          </div>
          <button className="np-close">✕</button>
        </div>

        <div className="np-field">
          <label>name</label>
          <div className="np-input">
            <span className="np-emoji-pick">🚀</span>
            <span className="np-input-text">spectre-sdk</span>
            <span style={{color:'var(--neon-cyan)',animation:'blink 1s steps(1) infinite'}}>▎</span>
          </div>
          <div className="np-hint">used as <code>#spectre-sdk</code> in todos · lowercase, dash-separated</div>
        </div>

        <div className="np-field">
          <label>source <span className="np-hint inline">— optional, auto-discovers branch + sessions</span></label>
          <div className="np-source-row">
            <button className="np-source-btn active">
              <span style={{fontSize:'1.1rem'}}>📁</span>
              <div>
                <div className="np-source-name">local repo</div>
                <div className="np-source-meta">~/code/spectre-sdk</div>
              </div>
            </button>
            <button className="np-source-btn">
              <span style={{fontSize:'1.1rem'}}>🌐</span>
              <div>
                <div className="np-source-name">git remote</div>
                <div className="np-source-meta">github.com/...</div>
              </div>
            </button>
            <button className="np-source-btn">
              <span style={{fontSize:'1.1rem'}}>📝</span>
              <div>
                <div className="np-source-name">none</div>
                <div className="np-source-meta">just a tag</div>
              </div>
            </button>
          </div>
        </div>

        <div className="np-field">
          <label>seed features <span className="np-hint inline">— prefill the progress breakdown</span></label>
          <div className="np-feat-list">
            <div className="np-feat-row">
              <span className="feat-dot todo"/>
              <span className="np-feat-name">type generation</span>
              <button className="np-feat-x">×</button>
            </div>
            <div className="np-feat-row">
              <span className="feat-dot todo"/>
              <span className="np-feat-name">event bus</span>
              <button className="np-feat-x">×</button>
            </div>
            <div className="np-feat-row">
              <span className="feat-dot todo"/>
              <span className="np-feat-name">docs</span>
              <button className="np-feat-x">×</button>
            </div>
            <button className="np-feat-add">+ add feature</button>
          </div>
        </div>

        <div className="np-field">
          <label>watch sessions from</label>
          <div className="np-tools-row">
            <label className="np-tool on"><span>●</span> claude code</label>
            <label className="np-tool on"><span>●</span> codex</label>
            <label className="np-tool"><span>○</span> aider</label>
            <label className="np-tool"><span>○</span> cursor</label>
          </div>
        </div>

        <div className="np-actions">
          <button className="np-btn ghost">cancel <kbd>esc</kbd></button>
          <button className="np-btn primary">scaffold <kbd>⌘↵</kbd></button>
        </div>
      </div>

      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)',padding:'0.6rem 0.8rem',background:'var(--bg-glass)',border:'1px dashed var(--border-subtle)',borderRadius:'var(--radius-md)'}}>
        <span style={{color:'var(--neon-cyan)'}}>$</span> <span style={{color:'var(--neon-green)'}}>workbench new spectre-sdk --src ~/code/spectre-sdk</span>
        <span style={{color:'var(--text-muted)'}}> # CLI equivalent</span>
      </div>
    </div>
  );
}

function EditProjectPanel() {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1rem',minHeight:0,overflowY:'auto'}}>
      <div className="sec-head" style={{marginBottom:0,whiteSpace:'nowrap',overflow:'hidden'}}>
        <span className="prompt">&gt;</span> edit project · pixel-studio
        <span className="right" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>via ⋯ on any project card</span>
      </div>

      <div className="surface">
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem'}}>
          <span style={{fontSize:'2rem',filter:'drop-shadow(0 0 14px var(--neon-cyan))'}}>🎨</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'1.05rem',fontWeight:700,color:'var(--neon-cyan)'}}>pixel-studio</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)'}}>~/code/pixel-studio · ⎇ main</div>
          </div>
          <button className="np-btn ghost small">archive</button>
          <button className="np-btn ghost small danger">delete</button>
        </div>

        <div className="ep-section">
          <label>features <span className="np-hint inline">— drag to reorder</span></label>
          <div className="np-feat-list">
            {[
              { n: 'Layer model', s: 'almost', p: 88 },
              { n: 'Hit testing', s: 'wip', p: 45 },
              { n: 'Export pipeline', s: 'wip', p: 20 },
              { n: 'Plugin API', s: 'todo', p: 0 },
            ].map(f => (
              <div key={f.n} className="np-feat-row editable">
                <span className="np-feat-grip">⋮⋮</span>
                <span className={`feat-dot ${f.s}`}/>
                <span className="np-feat-name">{f.n}</span>
                <div style={{flex:1}}>
                  <ProgressBar value={f.p} thin />
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)',minWidth:32,textAlign:'right'}}>{f.p}%</span>
                <button className="np-feat-x">×</button>
              </div>
            ))}
            <button className="np-feat-add">+ add feature</button>
          </div>
        </div>

        <div className="ep-section">
          <label>tags <span className="np-hint inline">— show up as quick filters</span></label>
          <div className="np-tools-row">
            <span className="ep-tag">#bug</span>
            <span className="ep-tag">#perf</span>
            <span className="ep-tag">#design</span>
            <span className="ep-tag ep-tag-add">+ add</span>
          </div>
        </div>

        <div className="ep-section">
          <label>session sources</label>
          <div className="np-tools-row">
            <label className="np-tool on"><span>●</span> claude code <span style={{color:'var(--text-muted)'}}>· 23 sessions</span></label>
            <label className="np-tool on"><span>●</span> codex <span style={{color:'var(--text-muted)'}}>· 18 sessions</span></label>
          </div>
        </div>

        <div className="ep-section">
          <label>budget · 24h</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
            <div className="ep-budget">
              <span className="ep-budget-label">token cap</span>
              <span className="ep-budget-val"><CountUp to={500000} format={n=>window.fmt.k(Math.round(n))} /></span>
            </div>
            <div className="ep-budget">
              <span className="ep-budget-label">cost cap</span>
              <span className="ep-budget-val">$10.00</span>
            </div>
          </div>
        </div>

        <div className="np-actions" style={{marginTop:'1rem'}}>
          <button className="np-btn ghost">cancel</button>
          <button className="np-btn primary">save changes</button>
        </div>
      </div>
    </div>
  );
}

const conceptFStyles = `
.np-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  box-shadow: var(--shadow-deep), 0 0 50px rgba(0,255,242,0.15), inset 0 1px 0 rgba(255,255,255,0.08);
  display: flex; flex-direction: column; gap: 1rem;
  position: relative;
}
.np-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.np-close {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  width: 30px; height: 30px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
}
.np-close:hover { border-color: var(--neon-pink); color: var(--neon-pink); }

.np-field { display: flex; flex-direction: column; gap: 0.5rem; }
.np-field > label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.np-hint {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}
.np-hint.inline { margin-left: 0.4rem; }
.np-hint code {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
  padding: 1px 5px;
  border-radius: 3px;
}

.np-input {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.75rem 0.9rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 20px rgba(0,255,242,0.04);
}
.np-emoji-pick {
  font-size: 1.2rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-elevated);
}
.np-input-text {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--text-primary);
}

.np-source-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.np-source-btn {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.6rem 0.7rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
  color: var(--text-secondary);
}
.np-source-btn:hover { border-color: var(--border-glow); }
.np-source-btn.active {
  border-color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
  box-shadow: 0 0 15px rgba(0,255,242,0.15);
}
.np-source-name { font-family: var(--font-mono); font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }
.np-source-meta { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); margin-top: 1px; }

.np-feat-list { display: flex; flex-direction: column; gap: 0.35rem; }
.np-feat-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.np-feat-row.editable { padding-right: 0.4rem; }
.np-feat-grip { color: var(--text-muted); cursor: grab; font-family: var(--font-mono); font-size: 0.7rem; padding: 0 2px; }
.np-feat-name { flex: 1; font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-primary); }
.np-feat-x {
  background: transparent; border: none; color: var(--text-muted);
  cursor: pointer; font-size: 0.95rem; padding: 0 4px;
}
.np-feat-x:hover { color: var(--neon-pink); }
.np-feat-add {
  background: transparent;
  border: 1px dashed var(--border-subtle);
  color: var(--text-muted);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
}
.np-feat-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

.np-tools-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.np-tool {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  color: var(--text-muted);
  background: var(--bg-glass);
  transition: all var(--transition-fast);
}
.np-tool.on {
  border-color: var(--border-glow);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.05);
}
.np-tool span { font-size: 0.65rem; }

.np-actions {
  display: flex; gap: 0.5rem; justify-content: flex-end;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-hair);
}
.np-btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
  white-space: nowrap;
}
.np-btn.small { padding: 0.35rem 0.7rem; font-size: 0.7rem; }
.np-btn.ghost { background: transparent; border-color: var(--border-subtle); color: var(--text-secondary); }
.np-btn.ghost:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
.np-btn.ghost.danger:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.np-btn.primary {
  background: var(--gradient-primary);
  color: var(--bg-void);
  box-shadow: 0 0 18px rgba(0,255,242,0.3);
}
.np-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 6px 25px rgba(0,255,242,0.45); }
.np-btn kbd {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  padding: 1px 5px;
  background: rgba(0,0,0,0.25);
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.1);
}
.np-btn.ghost kbd { background: var(--bg-elevated); color: var(--text-muted); border-color: var(--border-subtle); }

.ep-section { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.ep-section > label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.ep-tag {
  font-family: var(--font-mono); font-size: 0.74rem;
  padding: 3px 10px; border-radius: var(--radius-pill);
  background: rgba(191,90,242,0.08);
  color: var(--neon-purple);
  border: 1px solid rgba(191,90,242,0.2);
  cursor: pointer;
}
.ep-tag.ep-tag-add {
  background: transparent;
  color: var(--text-muted);
  border-style: dashed;
  border-color: var(--border-subtle);
}
.ep-budget {
  padding: 0.55rem 0.7rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  display: flex; flex-direction: column;
}
.ep-budget-label {
  font-family: var(--font-mono); font-size: 0.65rem;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;
}
.ep-budget-val {
  font-family: var(--font-mono); font-size: 1.1rem;
  color: var(--neon-cyan); font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
`;

window.ConceptF = ConceptF;
