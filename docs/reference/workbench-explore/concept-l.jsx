// concept-l.jsx — Todo detail / split / promote modal.
// Click any todo to enter this. Edit, add sub-tasks, attach context,
// promote an idea into a project / feature, run with AI.

function ConceptL() {
  return (
    <div className="dashboard-canvas" style={{position:'relative'}}>
      {/* Dimmed backdrop preview */}
      <div className="inner" style={{overflow:'hidden', height:'100%', filter:'blur(2px) brightness(0.5)', pointerEvents:'none'}}>
        <Topbar />
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'0.85rem', marginBottom:'1rem'}}>
          {['📥','🌅','🚧','📅'].map((e, i) => (
            <div key={i} className="board-col tone-purple" style={{height:200}}>
              <div className="board-col-head"><span style={{fontSize:'1rem'}}>{e}</span><span className="board-col-name">col</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* The modal */}
      <div className="td-overlay">
        <div className="td-modal">
          {/* Header */}
          <div className="td-modal-head">
            <div style={{display:'flex',alignItems:'center',gap:'0.4rem',marginBottom:'0.4rem'}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--neon-purple)',background:'rgba(191,90,242,0.1)',padding:'2px 7px',borderRadius:'var(--radius-pill)',border:'1px solid rgba(191,90,242,0.25)',fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase'}}>💡 idea · from inbox</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'var(--text-muted)'}}>captured 3d ago · last edited 1h ago</span>
              <button className="td-close" style={{marginLeft:'auto'}}>✕</button>
            </div>
            <input className="td-modal-title" defaultValue="try wasm + simd for the lexer hot loop" readOnly />
            <textarea className="td-modal-desc" defaultValue={`Started thinking about this after the rust port hit a wall around the AST stage. The hot path is ~40% of total parse time. If we can drop a wasm kernel for just the tokenizer (no AST), we keep the existing rust code path for everything else.\n\nRisks:\n- Wasm cold-start cost may eat the win on small files\n- SIMD support varies across runtimes — bun is fine, deno needs flag\n- Build complexity: need a separate wasm-pack step in CI`} readOnly />
          </div>

          {/* Two-col body: tasks/links left, meta right */}
          <div className="td-modal-body">
            <div className="td-modal-main">
              {/* Sub-tasks */}
              <div className="td-section">
                <div className="td-section-label">
                  <span>sub-tasks</span>
                  <span style={{color:'var(--neon-green)'}}>2/5</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <SubTask done text="prototype wasm tokenizer in rust + wasm-pack" />
                  <SubTask done text="measure cold-start cost on small (<10kb) files" />
                  <SubTask text="benchmark vs current rust path on 1MB+ corpus" />
                  <SubTask text="decide: simd-128 only or also simd-256 fallback?" />
                  <SubTask text="write the build pipeline doc" />
                  <button className="td-subtask-add">+ add sub-task</button>
                </div>
              </div>

              {/* Tags */}
              <div className="td-section">
                <div className="td-section-label">tags</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  <span className="td-tag">#idea</span>
                  <span className="td-tag">#perf</span>
                  <span className="td-tag">#research</span>
                  <span className="td-tag td-tag-add">+ add</span>
                </div>
              </div>

              {/* Related sessions */}
              <div className="td-section">
                <div className="td-section-label">
                  <span>linked sessions</span>
                  <span style={{color:'var(--text-muted)'}}>auto-discovered</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <LinkedSession id="s4" who="terra · sonnet-4.5" title="Lexer: handle escaped quotes in raw strings" at="42m ago" />
                  <LinkedSession id="s8" who="terra · codex-1" title="AST node visitor pattern" at="4h ago" />
                </div>
              </div>

              {/* Journal */}
              <div className="td-section">
                <div className="td-section-label">
                  <span>journal · scratch</span>
                  <span style={{color:'var(--text-muted)'}}>markdown</span>
                </div>
                <div className="td-journal">
                  <div className="td-journal-entry">
                    <span className="td-journal-date">Nov 7</span>
                    Talked to gpt about wasm-bindgen — it confirms there's no auto-shim
                    for raw simd intrinsics. Either I write the rust manually or use
                    <code className="md-code">packed_simd_2</code>. Pinned a note.
                  </div>
                  <div className="td-journal-entry">
                    <span className="td-journal-date">Nov 5</span>
                    Read the bun docs on wasm support. Cold start is ~3ms after warmup.
                    Acceptable for hot loops, bad for small one-shots.
                  </div>
                </div>
              </div>
            </div>

            {/* Right meta column */}
            <div className="td-modal-meta">
              {/* Promote actions */}
              <div className="td-promote">
                <div className="td-section-label" style={{color:'var(--neon-purple)'}}>💎 promote this idea</div>
                <button className="td-promote-btn">
                  <span style={{fontSize:'1.1rem'}}>🌌</span>
                  <div style={{flex:1,textAlign:'left'}}>
                    <div className="td-promote-title">into a feature</div>
                    <div className="td-promote-sub">attach to existing project</div>
                  </div>
                  <span className="td-promote-chev">›</span>
                </button>
                <button className="td-promote-btn">
                  <span style={{fontSize:'1.1rem'}}>📁</span>
                  <div style={{flex:1,textAlign:'left'}}>
                    <div className="td-promote-title">into a new project</div>
                    <div className="td-promote-sub">scaffold "wasm-tokenizer-research"</div>
                  </div>
                  <span className="td-promote-chev">›</span>
                </button>
                <button className="td-promote-btn">
                  <span style={{fontSize:'1.1rem'}}>📑</span>
                  <div style={{flex:1,textAlign:'left'}}>
                    <div className="td-promote-title">into a lesson</div>
                    <div className="td-promote-sub">save as cross-project knowledge</div>
                  </div>
                  <span className="td-promote-chev">›</span>
                </button>
              </div>

              {/* Meta */}
              <div className="td-meta-block">
                <div className="td-section-label">properties</div>
                <MetaRow k="project" v={<span style={{color:'var(--neon-orange)'}}>#inbox</span>} editable />
                <MetaRow k="priority" v={<span className="todo-prio low" style={{margin:0}}>· low</span>} editable />
                <MetaRow k="due" v="someday" editable />
                <MetaRow k="kind" v={<span style={{color:'var(--neon-purple)'}}>💡 idea</span>} editable />
                <MetaRow k="created" v="Nov 7, 2025" />
                <MetaRow k="created via" v={<span style={{color:'var(--neon-cyan)'}}>capture bar</span>} />
              </div>

              {/* Run with AI */}
              <div className="td-run">
                <div className="td-section-label" style={{color:'var(--neon-cyan)'}}>▶ run with</div>
                <button className="td-run-btn">
                  <span style={{fontSize:'1.05rem'}}>🤖</span>
                  <span>claude code · sonnet-4.5</span>
                  <span className="td-run-kbd">⌘↵</span>
                </button>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--text-muted)',lineHeight:1.5,padding:'0.5rem'}}>
                  opens "start session" dialog with this todo as the prompt + linked sessions as context.
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="td-modal-foot">
            <button className="np-btn ghost">archive</button>
            <button className="np-btn ghost danger">delete</button>
            <span style={{flex:1}}/>
            <button className="np-btn ghost">split into 3 todos</button>
            <button className="np-btn primary">✓ mark done</button>
          </div>
        </div>
      </div>

      <style>{conceptLStyles}</style>
    </div>
  );
}

function SubTask({ done, text }) {
  return (
    <div className={`td-sub ${done?'done':''}`}>
      <span className="td-sub-check">{done && '✓'}</span>
      <span className="td-sub-text">{text}</span>
    </div>
  );
}

function LinkedSession({ id, who, title, at }) {
  return (
    <div className="td-linked-sess">
      <span style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'var(--neon-cyan)',fontWeight:600}}>{id}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{title}</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'var(--text-muted)'}}>{who} · {at}</div>
      </div>
      <span style={{color:'var(--neon-cyan)',cursor:'pointer'}}>↗</span>
    </div>
  );
}

function MetaRow({ k, v, editable }) {
  return (
    <div className="td-meta-row">
      <span className="td-meta-k">{k}</span>
      <span className="td-meta-v">{v}</span>
      {editable && <span className="td-meta-edit">✎</span>}
    </div>
  );
}

const conceptLStyles = `
.td-overlay {
  position: absolute; inset: 0;
  background: rgba(5,5,8,0.6);
  backdrop-filter: blur(8px);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 2rem;
  z-index: 10;
}
.td-modal {
  width: min(900px, 100%);
  max-height: calc(100% - 2rem);
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-deep), 0 0 50px rgba(191,90,242,0.15), inset 0 1px 0 rgba(255,255,255,0.06);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.3s var(--ease-smooth);
}
.td-modal-head {
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
}
.td-close {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  width: 28px; height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.td-close:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.td-modal-title {
  width: 100%;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  padding: 0;
  outline: none;
  text-shadow: 0 0 18px rgba(255,255,255,0.1);
}
.td-modal-title:focus { color: var(--neon-cyan); }
.td-modal-desc {
  width: 100%;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.85rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
  resize: none;
  outline: none;
  min-height: 100px;
  margin-top: 0.4rem;
}

.td-modal-body {
  display: grid;
  grid-template-columns: 1fr 280px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.td-modal-main {
  overflow-y: auto;
  padding: 1.1rem 1.25rem;
  display: flex; flex-direction: column; gap: 1.1rem;
  border-right: 1px solid var(--border-subtle);
}
.td-modal-meta {
  overflow-y: auto;
  padding: 1.1rem 1.1rem;
  display: flex; flex-direction: column; gap: 1rem;
}

.td-section { display: flex; flex-direction: column; gap: 0.5rem; }
.td-section-label {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  display: flex; justify-content: space-between;
}

.td-sub {
  display: flex; align-items: flex-start; gap: 0.55rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.td-sub:hover { border-color: var(--border-glow); }
.td-sub-check {
  width: 16px; height: 16px;
  border: 1.5px solid var(--text-muted);
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 10px;
  display: flex; align-items: center; justify-content: center;
  color: var(--bg-void);
  font-weight: 700;
}
.td-sub.done .td-sub-check {
  background: var(--gradient-success);
  border-color: transparent;
}
.td-sub-text {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-primary);
  line-height: 1.4;
}
.td-sub.done .td-sub-text {
  color: var(--text-muted);
  text-decoration: line-through;
}
.td-subtask-add {
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
.td-subtask-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

.td-tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgba(191,90,242,0.08);
  color: var(--neon-purple);
  border: 1px solid rgba(191,90,242,0.2);
  cursor: pointer;
}
.td-tag-add {
  background: transparent;
  color: var(--text-muted);
  border-style: dashed;
  border-color: var(--border-subtle);
}

.td-linked-sess {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  background: rgba(0,255,242,0.03);
  border: 1px solid rgba(0,255,242,0.15);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.td-linked-sess:hover { border-color: var(--border-glow); }

.td-journal {
  display: flex; flex-direction: column; gap: 0.4rem;
}
.td-journal-entry {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 0.55rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-purple);
  border-radius: var(--radius-sm);
}
.td-journal-date {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--neon-purple);
  margin-right: 0.6rem;
  font-weight: 600;
}

.td-promote, .td-meta-block, .td-run {
  display: flex; flex-direction: column; gap: 0.4rem;
  padding: 0.85rem 0.9rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.td-promote-btn {
  display: flex; align-items: center; gap: 0.55rem;
  width: 100%;
  padding: 0.55rem 0.7rem;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}
.td-promote-btn:hover {
  border-color: var(--border-glow);
  background: rgba(0,255,242,0.05);
  transform: translateX(2px);
}
.td-promote-title {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary);
}
.td-promote-sub {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-top: 1px;
}
.td-promote-chev {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--text-muted);
}
.td-promote-btn:hover .td-promote-chev { color: var(--neon-cyan); }

.td-meta-row {
  display: grid; grid-template-columns: 75px 1fr auto;
  gap: 0.5rem; align-items: center;
  padding: 0.35rem 0;
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.td-meta-k { color: var(--text-muted); text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em; }
.td-meta-v { color: var(--text-primary); }
.td-meta-edit { color: var(--text-muted); cursor: pointer; opacity: 0.4; }
.td-meta-row:hover .td-meta-edit { opacity: 1; }

.td-run-btn {
  display: flex; align-items: center; gap: 0.55rem;
  width: 100%;
  padding: 0.7rem 0.85rem;
  background: var(--gradient-primary);
  color: var(--bg-void);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 0 20px rgba(0,255,242,0.3);
  transition: all var(--transition-fast);
}
.td-run-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 30px rgba(0,255,242,0.45); }
.td-run-kbd {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  background: rgba(0,0,0,0.2);
  padding: 1px 6px;
  border-radius: 3px;
}

.td-modal-foot {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--border-subtle);
  background: rgba(0,0,0,0.15);
}
`;

window.ConceptL = ConceptL;
