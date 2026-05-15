// concept-a.jsx — Card Wall. Pinterest-style grid, one big card per project.
// What the user explicitly asked for. Glassmorphism + neon, info-rich.

function ConceptA() {
  const { projects, sessions, todos, stats, modelMix, tokenSpark } = window.AppData;
  const liveSessions = sessions.filter(s => s.state === 'live');
  const recentTodos = todos.filter(t => !t.done).slice(0, 5);

  return (
    <div className="dashboard-canvas">
      <ParticleField density={0.00005} color="0, 255, 242" />
      <CursorGlow color="rgba(0,255,242,0.10)" size={320}>
        <div className="inner" style={{overflow:'hidden',height:'100%'}}>
          <Topbar />

          {/* Top strip: stats + sparkline */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr) 1.6fr', gap:'1rem', marginBottom:'1.25rem'}}>
            <StatTile label="active sessions" value={stats.activeSessions} foot={<span><span className="up">●</span> 2 streaming</span>} />
            <StatTile label="tokens · 24h" tone="purple" value={stats.totalTokens24h} format={(n)=>window.fmt.k(Math.round(n))} foot={<span><span className="up">↑ 23%</span> vs yesterday</span>} />
            <StatTile label="cost · 24h" tone="green" value={stats.totalCost24h} format={(n)=>'$'+n.toFixed(2)} foot={<span>~ $0.52/hr burn rate</span>} />
            <StatTile label="projects" tone="orange" value={stats.projects} foot={<span>{projects.filter(p=>p.status==='active').length} active · {projects.filter(p=>p.status==='paused').length} paused</span>} />
            <div className="stat-tile" style={{paddingBottom:'0.8rem'}}>
              <div className="stat-tile-label">model mix · 24h</div>
              <div style={{display:'flex',gap:'0.7rem',alignItems:'flex-end',marginTop:'0.55rem'}}>
                {modelMix.map(m => (
                  <div key={m.model} style={{flex:1}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-secondary)',marginBottom:3}}>
                      <span>{m.model}</span><span style={{color: m.color}}>{m.pct}%</span>
                    </div>
                    <div className="pbar thin"><div className="pbar-fill" style={{width: m.pct+'%', background: m.color, boxShadow: `0 0 10px ${m.color}`}}/></div>
                  </div>
                ))}
              </div>
              <Sparkline data={tokenSpark} />
            </div>
          </div>

          {/* Main two-col: project grid + side panel */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 360px', gap:'1.25rem', flex:1, minHeight:0}}>
            {/* Project wall */}
            <div style={{minWidth:0, overflowY:'auto', paddingRight:'0.25rem'}}>
              <div className="sec-head">
                <span className="prompt">&gt;</span> projects <span className="count">— {projects.length}</span>
                <span className="right" style={{display:'flex',gap:'0.6rem',alignItems:'center'}}>
                  <span>sort: last touched · filter: all</span>
                  <button className="new-proj-btn">+ new project</button>
                </span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:'1rem'}}>
                {projects.map((p, i) => (
                  <div key={p.id} style={{animation: `cardFadeIn 0.5s var(--ease-smooth) ${i*60}ms both`}}>
                    <ProjectCardFull p={p} />
                  </div>
                ))}
              </div>
            </div>

            {/* Right rail: capture + inbox + live + todos */}
            <div style={{display:'flex',flexDirection:'column',gap:'1rem',minHeight:0,overflowY:'auto',paddingRight:'0.25rem'}}>
              <div style={{flex:'0 0 auto'}}>
                <div className="sec-head">
                  <span className="prompt">&gt;</span> live now <LiveDot color="var(--neon-green)" /> <span className="count">— {liveSessions.length}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                  {liveSessions.map(s => <SessionRow key={s.id} s={s} compact />)}
                </div>
              </div>

              <div style={{flex:'0 0 auto'}}>
                <div className="sec-head">
                  <span className="prompt">&gt;</span> quick capture
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'0.55rem 0.75rem',background:'var(--bg-void)',border:'1px solid var(--border-glow)',borderRadius:'var(--radius-md)',boxShadow:'inset 0 0 20px rgba(0,255,242,0.04)'}}>
                  <span style={{color:'var(--neon-cyan)',fontFamily:'var(--font-mono)',fontWeight:700}}>$</span>
                  <span style={{flex:1,fontFamily:'var(--font-mono)',fontSize:'0.8rem',color:'var(--text-secondary)',minWidth:0}}>
                    <Typewriter
                      phrases={[
                        'fix rate limit edge case #aurora',
                        'idea: wasm for lexer hot loop',
                        'reply to sam re contract',
                        'voice-to-todo via whisper 💡',
                      ]}
                      speed={50}
                      pause={1900}
                    />
                  </span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-muted)',background:'var(--bg-elevated)',padding:'2px 6px',borderRadius:3}}>⏎</span>
                </div>
              </div>

              <div style={{flex:'0 0 auto'}}>
                <div className="sec-head">
                  <span className="prompt">&gt;</span> 📥 inbox <span className="count">— {todos.filter(t=>!t.project && !t.done).length} ideas</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'0.35rem'}}>
                  {todos.filter(t=>!t.project && !t.done).slice(0, 4).map(t => <TodoItem key={t.id} t={t} />)}
                </div>
              </div>

              <div style={{flex:'0 0 auto'}}>
                <div className="sec-head">
                  <span className="prompt">&gt;</span> open todos <span className="count">— {recentTodos.length}</span>
                  <span className="right" style={{fontFamily:'var(--font-mono)',color:'var(--neon-cyan)'}}>+ new</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                  {recentTodos.slice(0,4).map(t => <TodoItem key={t.id} t={t} />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CursorGlow>
    </div>
  );
}

window.ConceptA = ConceptA;
