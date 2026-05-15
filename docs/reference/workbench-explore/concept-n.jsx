// concept-n.jsx — Settings + integrations + theme picker (multi-theme showcase).

function ConceptN() {
  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{overflow:'hidden', height:'100%'}}>
        <Topbar />

        <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:'1.25rem',flex:1,minHeight:0}}>
          {/* LEFT — settings rail */}
          <div className="surface" style={{padding:'0.75rem',overflowY:'auto'}}>
            <div className="sec-head" style={{marginBottom:'0.6rem',padding:'0 0.4rem'}}>
              <span className="prompt">&gt;</span> settings
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'0.2rem'}}>
              <SettingsRail item="🎨 appearance" active />
              <SettingsRail item="📁 paths" />
              <SettingsRail item="🤖 models · rates" />
              <SettingsRail item="🔗 integrations" />
              <SettingsRail item="🔔 notifications" />
              <SettingsRail item="⌨ shortcuts" />
              <SettingsRail item="💾 data · export" />
              <SettingsRail item="ⓘ about" />
            </div>
            <div style={{marginTop:'1rem',padding:'0.7rem 0.6rem',background:'rgba(0,255,242,0.04)',border:'1px dashed rgba(0,255,242,0.2)',borderRadius:'var(--radius-md)',fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'var(--text-muted)',lineHeight:1.5}}>
              <span style={{color:'var(--neon-cyan)'}}>$</span> config at <br/><code style={{color:'var(--neon-green)'}}>~/.workbench/config.toml</code>
            </div>
          </div>

          {/* RIGHT — appearance section */}
          <div style={{minWidth:0,overflowY:'auto',paddingRight:'0.25rem',display:'flex',flexDirection:'column',gap:'1.5rem'}}>
            <div>
              <h2 style={{fontFamily:'var(--font-mono)',fontSize:'1.4rem',fontWeight:700,marginBottom:'0.25rem'}}>
                <ShinyText>appearance</ShinyText>
              </h2>
              <p style={{fontFamily:'var(--font-body)',fontSize:'0.88rem',color:'var(--text-secondary)'}}>
                Pick a theme. Each is a full token swap — backgrounds, neon spectrum, gradients, glows.
                You can also tweak any individual variable in <code style={{fontFamily:'var(--font-mono)',color:'var(--neon-green)',background:'var(--bg-elevated)',padding:'1px 6px',borderRadius:3,fontSize:'0.78rem'}}>~/.workbench/theme.css</code>.
              </p>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'1.25rem'}}>
              <ThemePreview tone="cyber" active name="Cyber neon"
                desc="The default. Cyan / purple / magenta on deep space black."
                hex={['#00fff2','#bf5af2','#ff00ff','#30d158']} />
              <ThemePreview tone="matrix" name="Matrix"
                desc="Single-hue green CRT. Pure terminal — htop / Tron / The Matrix energy."
                hex={['#00ff66','#aaff00','#00b347','#00ff7f']} />
              <ThemePreview tone="synthwave" name="Synthwave"
                desc="Hot pink + violet + orange on deep purple. Outrun '80s retrofuture."
                hex={['#ff006f','#a020f0','#ff5500','#ffd700']} />
              <ThemePreview tone="amber" name="Amber CRT"
                desc="Vintage amber phosphor. Single-hue warm orange. Cosy + serious."
                hex={['#ffaa00','#ff7700','#cc6600','#ffcc44']} />
              <ThemePreview tone="glacier" name="Glacier"
                desc="Light mode that doesn't look like a different product. Cool blue + violet, soft surfaces."
                hex={['#0072ce','#6633cc','#c026d3','#059669']} />
              <ThemePreview tone="paper" name="Paper · square"
                desc="Clean white, high contrast, square corners. GitHub Primer vibes — flat, hairline borders, no glow."
                hex={['#0969da','#1a7f37','#8250df','#cf222e']} />
              <ThemePreview tone="mono" name="Mono · typewriter"
                desc="Pure black & white. Square frames, brutalist hard shadows, JetBrains Mono everywhere. State encoded by weight + fill, not color. Programmer-zen."
                hex={['#000000','#404040','#909090','#cccccc']} />
              <div className="theme-card add">
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:'0.4rem',color:'var(--text-muted)'}}>
                  <span style={{fontSize:'1.8rem'}}>+</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'0.75rem'}}>custom theme</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-muted)'}}>build your own</span>
                </div>
              </div>
            </div>

            {/* Other quick settings — collapsed previews so the page feels real */}
            <div className="surface" style={{padding:'1.2rem'}}>
              <h3 style={{fontFamily:'var(--font-mono)',fontSize:'1rem',fontWeight:600,marginBottom:'0.85rem'}}>quick toggles</h3>
              <div className="qs-grid">
                <QuickToggle label="animated grid" on />
                <QuickToggle label="floating orbs" on />
                <QuickToggle label="cursor glow" on />
                <QuickToggle label="particle fields" on />
                <QuickToggle label="typewriter intros" on />
                <QuickToggle label="reduced motion" />
                <QuickToggle label="dim backgrounds at night" on />
                <QuickToggle label="emoji-as-icons" on />
              </div>
            </div>

            {/* Preview density across the rest */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
              <NextSection icon="📁" title="paths" rows={[
                ['claude code logs', '~/.claude/projects/'],
                ['codex logs', '~/.codex/sessions/'],
                ['notes vault',  '~/notes/workbench'],
                ['git roots',    '~/code, ~/Desktop/code/AI'],
              ]} />
              <NextSection icon="🤖" title="model rates" rows={[
                ['sonnet-4.5 input',  '$3.00 / Mtok'],
                ['sonnet-4.5 output', '$15.00 / Mtok'],
                ['haiku-4.5 input',   '$0.80 / Mtok'],
                ['haiku-4.5 output',  '$4.00 / Mtok'],
                ['codex-1 input',     '$2.50 / Mtok'],
                ['codex-1 output',    '$10.00 / Mtok'],
              ]} />
            </div>

            <div className="surface" style={{padding:'1.2rem'}}>
              <h3 style={{fontFamily:'var(--font-mono)',fontSize:'1rem',fontWeight:600,marginBottom:'0.85rem'}}>🔗 integrations</h3>
              <div className="int-grid">
                <Integration emoji="🐙" name="github" sub="issues + PRs sync"  status="connected" />
                <Integration emoji="📋" name="linear"  sub="bi-directional sync" status="connect" />
                <Integration emoji="💬" name="slack"  sub="notifications"        status="connected" />
                <Integration emoji="🗓" name="calendar" sub="schedule todos"   status="connect" />
                <Integration emoji="📓" name="obsidian" sub="read vault"        status="connected" />
                <Integration emoji="💎" name="notion"   sub="export weekly review" status="connect" />
              </div>
            </div>

          </div>
        </div>
      </div>
      <style>{conceptNStyles}</style>
    </div>
  );
}

function SettingsRail({ item, active }) {
  return (
    <button className={`set-rail ${active?'active':''}`}>
      <span>{item}</span>
      {active && <span style={{marginLeft:'auto',color:'var(--neon-cyan)',fontFamily:'var(--font-mono)',fontSize:'0.7rem'}}>‹</span>}
    </button>
  );
}

function ThemePreview({ tone, name, desc, hex, active }) {
  const [currentTheme, setCurrentTheme] = React.useState(() => (window.getTheme && window.getTheme()) || 'cyber');
  React.useEffect(() => {
    const handler = (e) => setCurrentTheme(e.detail.theme);
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  }, []);
  const isActive = currentTheme === tone;
  const apply = () => window.setTheme && window.setTheme(tone);
  return (
    <div className={`theme-card ${isActive?'active':''}`} onClick={apply} style={{cursor:'pointer'}}>
      <div className={`theme-preview theme-${tone}`}>
        {/* Mini dashboard preview */}
        <div className="tp-bg">
          <div className="tp-header">
            <span className="tp-logo">🎯</span>
            <span className="tp-title">workbench</span>
            <span className="tp-tag">v0.1</span>
          </div>
          <div className="tp-stats">
            <div className="tp-stat-tile"><div className="tp-stat-num">184k</div><div className="tp-stat-lbl">tokens</div></div>
            <div className="tp-stat-tile"><div className="tp-stat-num">$4.16</div><div className="tp-stat-lbl">cost</div></div>
            <div className="tp-stat-tile"><div className="tp-stat-num">2</div><div className="tp-stat-lbl">live</div></div>
          </div>
          <div className="tp-pcard">
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <span style={{fontSize:'0.95rem'}}>🌌</span>
              <span className="tp-pname">aurora-api</span>
              <span className="tp-pdot"/>
            </div>
            <div className="tp-pbar"><div className="tp-pbar-fill" style={{width:'72%'}}/></div>
            <div className="tp-pfoot">72% · 7 todo · ⎇ feat/auth-flow</div>
          </div>
          <div className="tp-todo">
            <span className="tp-todo-check"/>
            <span className="tp-todo-text">finish OAuth callback edge cases</span>
            <span className="tp-prio">!!</span>
          </div>
          <div className="tp-btn-row">
            <button className="tp-btn">▶ start session</button>
            <button className="tp-btn ghost">+ new</button>
          </div>
        </div>
      </div>
      <div className="theme-card-meta">
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:4}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:'0.95rem',fontWeight:600}}>{name}</span>
          {isActive && <span className="theme-active-badge">● active</span>}
        </div>
        <div style={{fontFamily:'var(--font-body)',fontSize:'0.78rem',color:'var(--text-secondary)',lineHeight:1.5,marginBottom:8}}>{desc}</div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {hex.map(h => <span key={h} className="theme-swatch" style={{background:h,boxShadow:`0 0 8px ${h}`}}/>)}
          <span style={{flex:1}}/>
          {!isActive && <button className="np-btn ghost" style={{padding:'0.3rem 0.7rem',fontSize:'0.7rem'}} onClick={(e)=>{e.stopPropagation();apply();}}>apply</button>}
        </div>
      </div>
    </div>
  );
}

function QuickToggle({ label, on }) {
  return (
    <div className="qs-row">
      <span className="qs-label">{label}</span>
      <span className={`kw-skill-toggle ${on?'on':''}`}><span className="kw-skill-toggle-knob"/></span>
    </div>
  );
}

function NextSection({ icon, title, rows }) {
  return (
    <div className="surface" style={{padding:'1.2rem'}}>
      <h3 style={{fontFamily:'var(--font-mono)',fontSize:'1rem',fontWeight:600,marginBottom:'0.85rem'}}>{icon} {title}</h3>
      <div style={{display:'flex',flexDirection:'column',gap:5}}>
        {rows.map(([k,v]) => (
          <div key={k} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'0.5rem',alignItems:'center',padding:'0.45rem 0.6rem',background:'var(--bg-glass)',border:'1px solid var(--border-hair)',borderRadius:'var(--radius-sm)',fontFamily:'var(--font-mono)',fontSize:'0.75rem'}}>
            <span style={{color:'var(--text-secondary)'}}>{k}</span>
            <span style={{color:'var(--neon-green)'}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Integration({ emoji, name, sub, status }) {
  const isConnected = status === 'connected';
  return (
    <div className="int-card">
      <span style={{fontSize:'1.6rem'}}>{emoji}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.85rem',fontWeight:600,color:'var(--text-primary)'}}>{name}</div>
        <div style={{fontFamily:'var(--font-body)',fontSize:'0.72rem',color:'var(--text-muted)'}}>{sub}</div>
      </div>
      <button className={`int-btn ${isConnected?'connected':''}`}>
        {isConnected ? '● connected' : 'connect'}
      </button>
    </div>
  );
}

const conceptNStyles = `
.set-rail {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0.65rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  transition: all var(--transition-fast);
  text-align: left;
  width: 100%;
}
.set-rail:hover { background: rgba(255,255,255,0.03); border-color: var(--border-hair); }
.set-rail.active {
  background: rgba(0,255,242,0.06);
  border-color: var(--border-glow);
  color: var(--neon-cyan);
  box-shadow: inset 2px 0 0 var(--neon-cyan);
}

/* Theme preview cards */
.theme-card {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition-base);
}
.theme-card:hover {
  transform: translateY(-3px);
  border-color: var(--border-glow);
  box-shadow: var(--shadow-card-hover);
}
.theme-card.active {
  border-color: var(--neon-cyan);
  box-shadow: 0 0 25px rgba(0,255,242,0.18);
}
.theme-card.add {
  border-style: dashed;
  min-height: 280px;
  cursor: pointer;
}
.theme-card.add:hover {
  border-color: var(--neon-cyan);
  background: rgba(0,255,242,0.03);
}
.theme-card-meta { padding: 0.85rem 1rem 1rem; }
.theme-active-badge {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--neon-green);
  background: rgba(48,209,88,0.12);
  border: 1px solid rgba(48,209,88,0.3);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}
.theme-swatch {
  width: 14px; height: 14px;
  border-radius: 50%;
}

/* Mini dashboard preview — uses theme tokens internally */
.theme-preview {
  height: 200px;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-bottom: 1px solid var(--border-subtle);
}
.tp-bg {
  position: absolute; inset: 0;
  background: var(--bg-void);
  padding: 0.6rem 0.7rem;
  display: flex; flex-direction: column; gap: 0.45rem;
  /* Apply theme variables — these come from the .theme-* parent class */
}
.tp-bg::before {
  content: ''; position: absolute; inset: 0;
  background:
    linear-gradient(90deg, var(--grid-color) 1px, transparent 1px),
    linear-gradient(var(--grid-color) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 60%, transparent 100%);
}
.tp-bg > * { position: relative; z-index: 1; }
.tp-header {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.tp-logo {
  font-size: 0.95rem;
  filter: drop-shadow(0 0 6px var(--neon-cyan));
}
.tp-title {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--gradient-logo);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.tp-tag {
  font-family: var(--font-mono); font-size: 0.58rem;
  color: var(--text-muted); margin-left: auto;
}
.tp-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.3rem; }
.tp-stat-tile {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.45rem;
  position: relative;
}
.tp-stat-tile::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--gradient-primary);
}
.tp-stat-num {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
}
.tp-stat-lbl {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}
.tp-pcard {
  padding: 0.45rem 0.55rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.tp-pname {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--neon-cyan);
  flex: 1;
}
.tp-pdot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--neon-green);
  box-shadow: 0 0 5px var(--neon-green);
}
.tp-pbar {
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  overflow: hidden;
}
.tp-pbar-fill {
  height: 100%;
  background: var(--gradient-primary);
  border-radius: 2px;
}
.tp-pfoot {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  color: var(--text-muted);
  margin-top: 4px;
}
.tp-todo {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.tp-todo-check {
  width: 10px; height: 10px;
  border: 1.2px solid var(--text-muted);
  border-radius: 2px;
}
.tp-todo-text {
  flex: 1;
  font-family: var(--font-body);
  font-size: 0.65rem;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tp-prio {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--neon-pink);
  background: rgba(255,55,95,0.12);
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 700;
}
.tp-btn-row { display: flex; gap: 0.3rem; margin-top: auto; }
.tp-btn {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  padding: 0.3rem 0.55rem;
  background: var(--gradient-primary);
  color: var(--bg-void);
  border: none;
  border-radius: var(--radius-pill);
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0 8px var(--neon-cyan);
}
.tp-btn.ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  box-shadow: none;
}

/* Quick toggles */
.qs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.4rem;
}
.qs-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.7rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.qs-label {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-primary);
}

/* Integrations */
.int-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.6rem;
}
.int-card {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.7rem 0.85rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.int-btn {
  padding: 0.35rem 0.85rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  border: 1px solid var(--neon-cyan);
  color: var(--neon-cyan);
  background: transparent;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.int-btn:hover { background: var(--neon-cyan); color: var(--bg-void); box-shadow: var(--shadow-neon); }
.int-btn.connected {
  border-color: rgba(48,209,88,0.4);
  color: var(--neon-green);
  background: rgba(48,209,88,0.08);
  font-weight: 600;
}
.int-btn.connected:hover { background: rgba(48,209,88,0.18); }
`;

window.ConceptN = ConceptN;
