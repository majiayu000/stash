// concept-d.jsx — Constellation. Projects as nodes in a constellation graph.
// Ring = progress. Size = activity. Color = status. Hover/click for details.
// Bottom strip: timeline of recent sessions across the portfolio.

function ConceptD() {
  const { projects, sessions, todos } = window.AppData;
  const [selectedId, setSelectedId] = React.useState('aurora');
  const selected = projects.find(p => p.id === selectedId);

  // Layout: position projects in a constellation. Hand-tuned for readability.
  const positions = {
    aurora:    { x: 50,  y: 35 },
    pixel:     { x: 78,  y: 50 },
    'haiku-bot': { x: 65,  y: 75 },
    terra:     { x: 30,  y: 65 },
    monolith:  { x: 15,  y: 35 },
    spectre:   { x: 45,  y: 18 },
  };
  // Connections (shared tags / proximity)
  const edges = [
    ['aurora','pixel'], ['aurora','haiku-bot'], ['aurora','spectre'],
    ['pixel','terra'], ['terra','monolith'], ['spectre','pixel'],
    ['haiku-bot','terra'],
  ];

  const statusColor = (s) => ({
    active:   'var(--neon-green)',
    shipping: 'var(--neon-orange)',
    paused:   'var(--text-muted)',
    fresh:    'var(--neon-purple)',
  }[s] || 'var(--neon-cyan)');

  const nodeSize = (p) => 38 + Math.min(40, p.sessions * 1.6);

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{overflow:'hidden', height:'100%'}}>
        <Topbar />

        <div style={{display:'grid', gridTemplateColumns:'1fr 380px', gap:'1.25rem', flex:1, minHeight:0}}>
          {/* MAIN: constellation */}
          <div style={{display:'flex', flexDirection:'column', minWidth:0, minHeight:0, gap:'1rem'}}>
            <div className="surface const-stage">
              <MagnetLines rows={10} cols={20} color="rgba(0,255,242,0.10)" />
              <ParticleField density={0.00008} color="0, 255, 242" maxLink={140} />
              {/* SVG edges */}
              <svg className="const-edges" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="edge-grad" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#00fff2" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#bf5af2" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                {edges.map(([a, b], i) => {
                  const pa = positions[a], pb = positions[b];
                  return <line key={i}
                    x1={pa.x + '%'} y1={pa.y + '%'}
                    x2={pb.x + '%'} y2={pb.y + '%'}
                    stroke="url(#edge-grad)" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.35"
                    className="const-edge"
                  />;
                })}
              </svg>

              {/* Nodes */}
              {projects.map(p => {
                const pos = positions[p.id];
                const size = nodeSize(p);
                const isSelected = p.id === selectedId;
                const color = statusColor(p.status);
                const circ = 2 * Math.PI * (size / 2 - 3);
                const dashOffset = circ * (1 - p.progress / 100);
                return (
                  <button
                    key={p.id}
                    className={`const-node ${isSelected ? 'sel' : ''}`}
                    style={{
                      left: `calc(${pos.x}% - ${size/2}px)`,
                      top:  `calc(${pos.y}% - ${size/2}px)`,
                      width: size, height: size,
                      '--node-color': color,
                    }}
                    onClick={() => setSelectedId(p.id)}
                  >
                    {/* progress ring */}
                    <svg viewBox={`0 0 ${size} ${size}`} className="const-ring">
                      <circle cx={size/2} cy={size/2} r={size/2 - 3} fill="none"
                        stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                      <circle cx={size/2} cy={size/2} r={size/2 - 3} fill="none"
                        stroke={color} strokeWidth="2.5"
                        strokeDasharray={circ}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${size/2} ${size/2})`}
                        style={{filter:`drop-shadow(0 0 6px ${color})`}}
                      />
                    </svg>
                    <span className="const-node-emoji" style={{fontSize: Math.max(18, size * 0.42)}}>{p.emoji}</span>
                    {p.status === 'active' && p.tokens24h > 0 && (
                      <span className="const-node-live"><LiveDot color="var(--neon-green)" /></span>
                    )}
                    <span className="const-node-label">
                      <span className="const-node-name">{p.name}</span>
                      <span className="const-node-pct">{p.progress}%</span>
                    </span>
                  </button>
                );
              })}

              {/* Legend */}
              <div className="const-legend">
                <div className="leg-row"><span className="leg-dot" style={{background:'var(--neon-green)'}}/> active</div>
                <div className="leg-row"><span className="leg-dot" style={{background:'var(--neon-orange)'}}/> shipping</div>
                <div className="leg-row"><span className="leg-dot" style={{background:'var(--neon-purple)'}}/> fresh</div>
                <div className="leg-row"><span className="leg-dot" style={{background:'var(--text-muted)'}}/> paused</div>
                <div className="leg-divider"/>
                <div className="leg-row mono-mini">ring = progress %</div>
                <div className="leg-row mono-mini">size = sessions</div>
              </div>

              {/* Floating header */}
              <div className="const-head">
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.95rem',fontWeight:600,color:'var(--text-primary)',display:'flex',alignItems:'center',gap:8}}>
                  <span className="prompt" style={{color:'var(--neon-cyan)'}}>&gt;</span> constellation
                </div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)'}}>
                  6 projects · click any node
                </div>
              </div>
            </div>

            {/* Timeline strip */}
            <div className="surface" style={{padding:'0.9rem 1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> session timeline <span className="count">— last 4h, all projects</span>
              </div>
              <Timeline />
            </div>
          </div>

          {/* RIGHT: selected detail */}
          <div style={{display:'flex',flexDirection:'column',gap:'0.9rem',minWidth:0,minHeight:0,overflowY:'auto'}}>
            <div className="surface" style={{padding:'1.25rem',background:`linear-gradient(135deg, ${'color-mix' in CSS && CSS.supports('color: color-mix(in srgb, red, blue)') ? `color-mix(in srgb, ${statusColor(selected.status)} 10%, var(--bg-glass))` : 'var(--bg-glass)'}, var(--bg-glass))`, borderColor: statusColor(selected.status)}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'0.75rem'}}>
                <div style={{fontSize:'2.5rem',filter:`drop-shadow(0 0 16px ${statusColor(selected.status)})`}}>{selected.emoji}</div>
                <div style={{flex:1}}>
                  <h2 style={{fontFamily:'var(--font-mono)',fontSize:'1.3rem',fontWeight:700,color:'var(--neon-cyan)',textShadow:'0 0 18px rgba(0,255,242,0.4)',lineHeight:1.2}}>{selected.name}</h2>
                  <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginTop:6,flexWrap:'wrap'}}>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)'}}>⎇ {selected.branch}</span>
                    <StatusPill status={selected.status} />
                  </div>
                </div>
              </div>
              <div className="pcard-doing" style={{marginTop:'0.9rem',marginBottom:'0.9rem'}}>{selected.doing}</div>

              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>overall</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.9rem',color:'var(--text-primary)',fontWeight:600}}>{selected.progress}%</span>
              </div>
              <ProgressBar value={selected.progress} />

              <div style={{marginTop:'1rem',display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:'0.5rem'}}>
                <Tile k="tokens" v={window.fmt.k(selected.tokens24h)} c="var(--neon-cyan)" />
                <Tile k="cost" v={'$'+selected.cost24h.toFixed(2)} c="var(--neon-green)" />
                <Tile k="sessions" v={selected.sessions} c="var(--neon-purple)" />
              </div>
            </div>

            <div className="surface" style={{padding:'1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> features
              </div>
              {selected.features.map(f => (
                <div key={f.name} style={{marginBottom:'0.7rem'}}>
                  <div className="pbar-row" style={{marginBottom:3}}>
                    <div className="pbar-label"><span className={`feat-dot ${f.status}`}/> {f.name}</div>
                    <div className="pbar-pct">{f.progress}%</div>
                  </div>
                  <ProgressBar value={f.progress} thin />
                </div>
              ))}
            </div>

            <div className="surface" style={{padding:'1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> todos
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.35rem'}}>
                {todos.filter(t=>t.project===selected.id).slice(0,5).map(t => <TodoItem key={t.id} t={t} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{conceptDStyles}</style>
    </div>
  );
}

function Tile({ k, v, c }) {
  return (
    <div style={{padding:'0.55rem 0.65rem',background:'rgba(255,255,255,0.025)',border:'1px solid var(--border-hair)',borderRadius:'var(--radius-md)'}}>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{k}</div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'1.05rem',fontWeight:700,color:c,fontVariantNumeric:'tabular-nums',lineHeight:1.1,marginTop:3}}>{v}</div>
    </div>
  );
}

function Timeline() {
  // Render the 8 mock sessions across a 4-hour window.
  const now = Date.now();
  const window4h = 4 * 60 * 60 * 1000;
  const start = now - window4h;
  const lanes = ['aurora','pixel','haiku-bot','terra','monolith','spectre'];
  const sessions = window.AppData.sessions;
  return (
    <div className="timeline">
      <div className="tl-lanes">
        {lanes.map(id => {
          const p = window.AppData.projects.find(x => x.id === id);
          return (
            <div key={id} className="tl-lane">
              <div className="tl-lane-label">
                <span>{p.emoji}</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</span>
              </div>
              <div className="tl-track">
                {sessions.filter(s => s.project === id).map(s => {
                  const pos = ((s.at - start) / window4h) * 100;
                  if (pos < 0) return null;
                  const width = Math.min(15, Math.max(2, s.duration / (window4h/100) * 100 / 60));
                  const stateColor = s.state === 'live' ? 'var(--neon-green)'
                                  : s.state === 'error' ? 'var(--neon-pink)'
                                  : s.tool === 'codex' ? 'var(--neon-purple)' : 'var(--neon-cyan)';
                  return (
                    <div key={s.id}
                         className={`tl-block ${s.state==='live'?'live':''}`}
                         style={{
                           left: pos + '%',
                           width: width + '%',
                           background: `linear-gradient(90deg, ${stateColor}, color-mix(in srgb, ${stateColor} 50%, transparent))`,
                           borderColor: stateColor,
                         }}
                         title={s.title}>
                      <span className="tl-block-label">{s.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="tl-axis">
        <div />
        <div className="tl-axis-marks">
          <span>−4h</span><span>−3h</span><span>−2h</span><span>−1h</span><span>now</span>
        </div>
      </div>
    </div>
  );
}

const conceptDStyles = `
.const-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  padding: 0;
  overflow: hidden;
}
.const-edges {
  position: absolute;
  inset: 0; width: 100%; height: 100%;
  z-index: 1;
  pointer-events: none;
}
.const-edge { animation: dashSlide 30s linear infinite; }
@keyframes dashSlide { to { stroke-dashoffset: -200; } }

.const-node {
  position: absolute;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-hair);
  border-radius: 50%;
  cursor: pointer;
  z-index: 2;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.3s var(--ease-smooth);
  padding: 0;
}
.const-node:hover { transform: scale(1.1); z-index: 3; }
.const-node.sel {
  transform: scale(1.15);
  z-index: 4;
  border-color: var(--node-color);
  box-shadow: 0 0 30px var(--node-color), 0 0 60px color-mix(in srgb, var(--node-color) 40%, transparent);
}
.const-ring {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
}
.const-node-emoji {
  position: relative;
  filter: drop-shadow(0 0 8px var(--node-color));
}
.const-node-live {
  position: absolute; top: -2px; right: -2px;
  z-index: 5;
}
.const-node-label {
  position: absolute;
  top: 100%; left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  white-space: nowrap;
  pointer-events: none;
}
.const-node-name {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-primary);
}
.const-node.sel .const-node-name {
  color: var(--neon-cyan);
  text-shadow: 0 0 10px rgba(0,255,242,0.6);
}
.const-node-pct {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--text-muted);
}

.const-legend {
  position: absolute;
  bottom: 1rem; left: 1rem;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.65rem 0.85rem;
  z-index: 5;
  display: flex; flex-direction: column; gap: 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-secondary);
}
.leg-row { display: flex; align-items: center; gap: 0.45rem; }
.leg-dot { width: 8px; height: 8px; border-radius: 50%; }
.leg-divider { height: 1px; background: var(--border-subtle); margin: 0.2rem 0; }
.mono-mini { color: var(--text-muted); font-size: 0.65rem; }

.const-head {
  position: absolute;
  top: 1rem; right: 1rem;
  display: flex; align-items: center; gap: 1rem;
  padding: 0.6rem 0.9rem;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  z-index: 5;
}

.timeline { display: flex; flex-direction: column; gap: 0.5rem; }
.tl-lanes { display: flex; flex-direction: column; gap: 4px; }
.tl-lane { display: grid; grid-template-columns: 110px 1fr; gap: 0.6rem; align-items: center; }
.tl-lane-label { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
.tl-track {
  position: relative; height: 20px;
  background: linear-gradient(to right,
    transparent 0%, transparent calc(25% - 1px), rgba(255,255,255,0.05) 25%, transparent calc(25% + 1px),
    transparent calc(50% - 1px), rgba(255,255,255,0.05) 50%, transparent calc(50% + 1px),
    transparent calc(75% - 1px), rgba(255,255,255,0.05) 75%, transparent calc(75% + 1px)
  );
  border-left: 1px solid var(--border-hair);
  border-right: 2px solid var(--neon-cyan);
  border-radius: 2px;
}
.tl-block {
  position: absolute; top: 2px; bottom: 2px;
  border: 1px solid;
  border-radius: 3px;
  min-width: 3px;
  display: flex; align-items: center;
  padding: 0 4px;
  overflow: hidden;
  transition: transform 0.2s var(--ease-smooth);
  cursor: pointer;
}
.tl-block:hover { transform: scaleY(1.2); z-index: 2; }
.tl-block.live { animation: pulse 2s ease-in-out infinite; }
.tl-block-label {
  font-family: var(--font-mono); font-size: 0.6rem;
  color: var(--bg-void); font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 0 1px 0 rgba(255,255,255,0.2);
}
.tl-axis {
  display: grid;
  grid-template-columns: 110px 1fr;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-muted);
  margin-top: 4px;
}
.tl-axis::before { content: ''; }
.tl-axis-marks {
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
}
.tl-axis-marks span:last-child { color: var(--neon-cyan); }
`;

window.ConceptD = ConceptD;
