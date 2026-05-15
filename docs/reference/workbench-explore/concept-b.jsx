// concept-b.jsx — Mission Control. 3-pane operations center.
// Left: project sidebar (compact list). Center: focused project detail with
// big progress + features + todos. Right: live agent stream + token meter.

function ConceptB() {
  const { projects, sessions, todos } = window.AppData;
  const [activeId, setActiveId] = React.useState('aurora');
  const active = projects.find(p => p.id === activeId);
  const projectTodos = todos.filter(t => t.project === activeId);
  const projectSessions = sessions.filter(s => s.project === activeId);

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{overflow:'hidden', height:'100%'}}>
        <Topbar />

        <div style={{display:'grid', gridTemplateColumns:'240px 1fr 380px', gap:'1rem', flex:1, minHeight:0}}>
          {/* LEFT: project rail */}
          <div className="surface" style={{padding:'0.75rem', overflowY:'auto', display:'flex', flexDirection:'column'}}>
            <div className="sec-head" style={{marginBottom:'0.6rem', padding:'0 0.4rem'}}>
              <span className="prompt">&gt;</span> projects
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'0.3rem'}}>
              {projects.map(p => (
                <button key={p.id} onClick={() => setActiveId(p.id)} className={`rail-item ${activeId===p.id?'active':''}`}>
                  <span className="rail-emoji">{p.emoji}</span>
                  <div className="rail-body">
                    <div className="rail-name">{p.name}</div>
                    <div className="rail-foot">
                      <span className="rail-pct">{p.progress}%</span>
                      <span className="rail-meta">{p.todoCount} todo · {p.sessions} sess</span>
                    </div>
                    <div className="pbar thin" style={{marginTop:4}}>
                      <div className="pbar-fill" style={{width:p.progress+'%'}} />
                    </div>
                  </div>
                  {p.status === 'active' && p.tokens24h > 0 && <LiveDot color="var(--neon-green)"/>}
                </button>
              ))}
            </div>
            <div style={{marginTop:'auto', paddingTop:'0.75rem', borderTop:'1px solid var(--border-hair)', fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-muted)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span>tokens · 24h</span><span style={{color:'var(--neon-cyan)'}}>184k</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span>cost · 24h</span><span style={{color:'var(--neon-green)'}}>$4.16</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>active sessions</span><span style={{color:'var(--neon-orange)'}}>2</span>
              </div>
            </div>
          </div>

          {/* CENTER: project detail */}
          <div style={{minWidth:0, display:'flex', flexDirection:'column', gap:'1rem', overflowY:'auto'}}>
            {/* Hero */}
            <TiltCard max={3} className="surface" style={{padding:'1.5rem', position:'relative'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'1rem',marginBottom:'1rem'}}>
                <div style={{fontSize:'3rem',filter:'drop-shadow(0 0 18px var(--neon-cyan))'}}>{active.emoji}</div>
                <div style={{flex:1}}>
                  <h2 style={{fontFamily:'var(--font-mono)',fontSize:'1.8rem',fontWeight:700,color:'var(--neon-cyan)',textShadow:'0 0 20px rgba(0,255,242,0.4)',lineHeight:1.1}}>
                    <ShinyText>{active.name}</ShinyText>
                  </h2>
                  <div style={{display:'flex',gap:'0.6rem',marginTop:'0.4rem',alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--text-muted)'}}>⎇ {active.branch}</span>
                    <StatusPill status={active.status} />
                    <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)'}}>last touched {window.fmt.ago(active.lastTouched)}</span>
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'2.5rem',fontWeight:700,background:'var(--gradient-primary)',WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent',lineHeight:1}}>
                    <CountUp to={active.progress} format={(n)=>Math.round(n)+'%'} />
                  </div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>overall</div>
                </div>
              </div>
              <div style={{padding:'0.7rem 0.9rem', background:'rgba(0,255,242,0.05)', border:'1px solid rgba(0,255,242,0.15)', borderLeft:'3px solid var(--neon-cyan)', borderRadius:'var(--radius-md)', fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'var(--text-secondary)', display:'flex', gap:8, alignItems:'center'}}>
                <span style={{color:'var(--neon-cyan)',animation:'blink 1.4s steps(1) infinite'}}>▶</span>
                <span style={{color:'var(--text-primary)'}}>doing:</span> {active.doing}
              </div>
              <ProgressBar value={active.progress} fat />
            </TiltCard>

            {/* Features grid */}
            <div className="surface">
              <div className="sec-head">
                <span className="prompt">&gt;</span> features <span className="count">— {active.features.length}</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:'0.75rem'}}>
                {active.features.map(f => (
                  <div key={f.name} style={{padding:'0.75rem 0.9rem', background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-hair)', borderRadius:'var(--radius-md)'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.5rem'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontFamily:'var(--font-mono)',fontSize:'0.85rem',color:'var(--text-primary)',fontWeight:500}}>
                        <span className={`feat-dot ${f.status}`}/>
                        {f.name}
                      </div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--text-muted)'}}>{f.progress}%</div>
                    </div>
                    <ProgressBar value={f.progress} />
                  </div>
                ))}
              </div>
            </div>

            {/* Todos */}
            <div className="surface">
              <div className="sec-head">
                <span className="prompt">&gt;</span> todos <span className="count">— {projectTodos.filter(t=>!t.done).length} open · {projectTodos.filter(t=>t.done).length} done</span>
                <span className="right" style={{color:'var(--neon-cyan)',cursor:'pointer'}}>+ add</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                {projectTodos.map(t => <TodoItem key={t.id} t={t} />)}
              </div>
            </div>
          </div>

          {/* RIGHT: live agent stream */}
          <div style={{display:'flex',flexDirection:'column',gap:'0.75rem',minWidth:0,minHeight:0}}>
            <div className="surface" style={{padding:'0.9rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.9rem',color:'var(--text-primary)',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                  <LiveDot color="var(--neon-green)" /> agent stream
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'var(--text-muted)'}}>{active.name}</span>
              </div>
              {/* Token meter */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem',marginBottom:'0.75rem'}}>
                <div style={{padding:'0.6rem 0.7rem',background:'rgba(0,255,242,0.04)',border:'1px solid rgba(0,255,242,0.15)',borderRadius:'var(--radius-sm)'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>tokens</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'1.25rem',color:'var(--neon-cyan)',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>
                    <CountUp to={active.tokens24h} format={(n)=>window.fmt.k(Math.round(n))} />
                  </div>
                </div>
                <div style={{padding:'0.6rem 0.7rem',background:'rgba(48,209,88,0.04)',border:'1px solid rgba(48,209,88,0.15)',borderRadius:'var(--radius-sm)'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>cost</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'1.25rem',color:'var(--neon-green)',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>
                    <CountUp to={active.cost24h} format={(n)=>'$'+n.toFixed(2)} />
                  </div>
                </div>
              </div>
              {/* Terminal feed */}
              <div className="ms-terminal">
                <div className="terminal-text"><span className="cmd">$</span> sk tail --project={active.name}</div>
                <div className="terminal-text muted">[12:42:18] session:s1 started · model:sonnet-4.5</div>
                <div className="terminal-text"><span style={{color:'var(--neon-cyan)'}}>{'>'}</span> reading <span style={{color:'var(--neon-purple)'}}>src/auth/oauth.ts</span></div>
                <div className="terminal-text"><span style={{color:'var(--neon-cyan)'}}>{'>'}</span> found 3 call sites for <code>SessionStore.set</code></div>
                <div className="terminal-text muted">[12:42:21] tool_call: read_file</div>
                <div className="terminal-text"><span style={{color:'var(--neon-cyan)'}}>{'>'}</span> proposing Session interface that wraps existing JWT helper</div>
                <div className="terminal-text muted">[12:42:24] tool_call: edit_file</div>
                <div className="terminal-text" style={{color:'var(--neon-green)'}}>  ✓ patched src/auth/session.ts (+24 -3)</div>
                <div className="terminal-text muted">[12:42:27] tool_call: run_tests</div>
                <div className="terminal-text" style={{color:'var(--neon-orange)'}}>  ⚠ 2 failing — chasing now…<span style={{color:'var(--neon-cyan)',animation:'blink 1s steps(1) infinite'}}>▎</span></div>
              </div>
            </div>

            <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column'}}>
              <div className="sec-head"><span className="prompt">&gt;</span> session history <span className="count">— {projectSessions.length}</span></div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.4rem',overflowY:'auto',paddingRight:4}}>
                {projectSessions.map(s => <SessionRow key={s.id} s={s} compact />)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{conceptBStyles}</style>
    </div>
  );
}

const conceptBStyles = `
.rail-item {
  display: grid; grid-template-columns: 24px 1fr auto;
  gap: 0.5rem; align-items: center;
  width: 100%;
  padding: 0.55rem 0.6rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
  font-family: var(--font-body);
  transition: all var(--transition-fast);
}
.rail-item:hover { background: rgba(255,255,255,0.03); border-color: var(--border-hair); }
.rail-item.active {
  background: rgba(0,255,242,0.06);
  border-color: var(--border-glow);
  box-shadow: inset 2px 0 0 var(--neon-cyan);
}
.rail-emoji { font-size: 1.1rem; }
.rail-body { min-width: 0; }
.rail-name {
  font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rail-item.active .rail-name { color: var(--neon-cyan); text-shadow: 0 0 12px rgba(0,255,242,0.5); }
.rail-foot { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-muted); margin-top: 2px; }
.rail-pct { color: var(--text-secondary); font-weight: 600; }

.ms-terminal {
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  padding: 0.75rem 0.85rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.7;
  box-shadow: inset 0 0 25px rgba(0,255,242,0.04);
  max-height: 220px;
  overflow-y: auto;
}
.ms-terminal .terminal-text { white-space: pre-wrap; }
.ms-terminal code {
  background: var(--bg-elevated);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--neon-purple);
}
`;

window.ConceptB = ConceptB;
