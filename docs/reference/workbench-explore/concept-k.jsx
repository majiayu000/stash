// concept-k.jsx — Project Workbench. The "home" for one project.
// Intent, milestones, decision log, notes/scratchpad, lessons.
// Sidebar: bound skills, features, todos, sessions, stats.

function ConceptK() {
  const { projects, todos, sessions, projectKnowledge, skills, projectSkills } = window.AppData;
  const p = projects[0]; // aurora
  const kb = projectKnowledge.aurora;
  const myTodos = todos.filter(t => t.project === p.id);
  const mySessions = sessions.filter(s => s.project === p.id);
  const mySkills = projectSkills[p.id].map(id => skills.find(s => s.id === id));

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{overflow:'hidden', height:'100%'}}>
        <Topbar />

        {/* Project hero */}
        <div className="kw-hero">
          <div className="kw-hero-row">
            <div style={{display:'flex',alignItems:'flex-start',gap:'1rem',flex:1,minWidth:0}}>
              <span style={{fontSize:'3.2rem',filter:'drop-shadow(0 0 20px var(--neon-cyan))',animation:'pulse 3s ease-in-out infinite',flexShrink:0,lineHeight:1}}>{p.emoji}</span>
              <div style={{flex:1,minWidth:0}}>
                <div className="kw-crumb">workbench &nbsp;/&nbsp; <span style={{color:'var(--text-secondary)'}}>projects</span> &nbsp;/&nbsp; <span style={{color:'var(--neon-cyan)'}}>{p.name}</span></div>
                <h2 className="kw-name"><ShinyText>{p.name}</ShinyText></h2>
                <div style={{display:'flex',alignItems:'center',gap:'0.6rem',marginTop:'0.4rem',flexWrap:'wrap'}}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'0.75rem',color:'var(--text-muted)'}}>⎇ {p.branch}</span>
                  <StatusPill status={p.status} />
                  <ModelBadge model={p.lastModel} />
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)'}}>last touched {window.fmt.ago(p.lastTouched)}</span>
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:'0.4rem',flexShrink:0}}>
              <button className="sd-action">📁 open</button>
              <button className="sd-action">▶ start session</button>
              <button className="sd-action">⚙ settings</button>
            </div>
          </div>

          {/* Progress + doing */}
          <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr',gap:'1rem',marginTop:'1.25rem'}}>
            <div style={{padding:'0.75rem 0.9rem',background:'var(--bg-glass)',border:'1px solid var(--border-hair)',borderRadius:'var(--radius-md)'}}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>overall progress</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'1.4rem',fontWeight:700,background:'var(--gradient-primary)',WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent',lineHeight:1}}><CountUp to={p.progress} format={n=>Math.round(n)+'%'}/></span>
              </div>
              <ProgressBar value={p.progress} fat />
            </div>
            <Tile k="tokens · 24h" v={window.fmt.k(p.tokens24h)} c="var(--neon-cyan)" />
            <Tile k="cost · 24h" v={'$'+p.cost24h.toFixed(2)} c="var(--neon-green)" />
          </div>

          <div className="pcard-doing" style={{marginTop:'1rem',marginBottom:0}}>
            <span style={{color:'var(--text-primary)',marginRight:6}}>doing:</span>
            {p.doing}
          </div>
        </div>

        {/* Main body: left long col + right sidebar */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:'1.25rem',flex:1,minHeight:0,marginTop:'1.25rem'}}>
          {/* LEFT */}
          <div style={{minWidth:0,overflowY:'auto',display:'flex',flexDirection:'column',gap:'1rem',paddingRight:'0.25rem'}}>
            {/* Intent */}
            <div className="surface kw-intent">
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> 🎯 project intent
                <span className="right" style={{color:'var(--neon-cyan)',cursor:'pointer'}}>edit</span>
              </div>
              <p style={{fontFamily:'var(--font-body)',fontSize:'0.95rem',lineHeight:1.65,color:'var(--text-primary)',fontStyle:'italic'}}>
                "{kb.intent}"
              </p>
            </div>

            {/* Milestones */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.85rem'}}>
                <span className="prompt">&gt;</span> 🏁 milestones
                <span className="count">— {kb.milestones.length}</span>
                <span className="right" style={{color:'var(--neon-cyan)',cursor:'pointer'}}>+ add</span>
              </div>
              <div className="kw-ms">
                {kb.milestones.map((m, i) => <Milestone key={m.id} m={m} last={i === kb.milestones.length - 1} />)}
              </div>
            </div>

            {/* Decision log */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.85rem'}}>
                <span className="prompt">&gt;</span> 📜 decision log
                <span className="count">— {kb.decisions.length}</span>
                <span className="right" style={{color:'var(--text-muted)'}}>auto-captured from sessions · always editable</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                {kb.decisions.map(d => <Decision key={d.id} d={d} />)}
              </div>
            </div>

            {/* Notes / scratchpad */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> 📖 notes · scratchpad
                <span className="right" style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'var(--text-muted)'}}>markdown · auto-saves · ⌘E to edit</span>
              </div>
              <div className="kw-notes">
                <MarkdownLite text={kb.notes} />
              </div>
            </div>

            {/* Lessons */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.85rem'}}>
                <span className="prompt">&gt;</span> 💎 lessons
                <span className="count">— {kb.lessons.length}</span>
                <span className="right" style={{color:'var(--text-muted)'}}>atomic · cross-project searchable</span>
              </div>
              <div className="kw-lessons">
                {kb.lessons.map(l => <Lesson key={l.id} l={l} />)}
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div style={{display:'flex',flexDirection:'column',gap:'1rem',minWidth:0,overflowY:'auto'}}>
            {/* Skills bound to project */}
            <div className="surface kw-skills">
              <div className="sec-head" style={{marginBottom:'0.75rem'}}>
                <span className="prompt">&gt;</span> 🧩 skills <span className="count">— {mySkills.length}</span>
                <span className="right" style={{color:'var(--neon-cyan)',cursor:'pointer',fontSize:'0.72rem',fontFamily:'var(--font-mono)'}}>+ add</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                {mySkills.map(s => <SkillChip key={s.id} s={s} active />)}
              </div>
              <div style={{marginTop:'0.6rem',padding:'0.55rem 0.7rem',background:'rgba(0,255,242,0.04)',border:'1px dashed rgba(0,255,242,0.2)',borderRadius:'var(--radius-md)',fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'var(--text-muted)',lineHeight:1.5}}>
                <span style={{color:'var(--neon-cyan)'}}>ⓘ</span> when starting a session on this project, these skills auto-load.
              </div>
            </div>

            {/* Features */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> features <span className="count">— {p.features.length}</span>
              </div>
              {p.features.map(f => (
                <div key={f.name} style={{marginBottom:'0.5rem'}}>
                  <div className="pbar-row" style={{marginBottom:3}}>
                    <div className="pbar-label"><span className={`feat-dot ${f.status}`}/> {f.name}</div>
                    <div className="pbar-pct">{f.progress}%</div>
                  </div>
                  <ProgressBar value={f.progress} thin />
                </div>
              ))}
            </div>

            {/* Todos */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> todos
                <span className="count">— {myTodos.filter(t=>!t.done).length} open</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.35rem'}}>
                {myTodos.map(t => <TodoItem key={t.id} t={t} showProject={false} />)}
              </div>
            </div>

            {/* Recent sessions */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> recent sessions <span className="count">— {mySessions.length}</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                {mySessions.slice(0, 4).map(s => <SessionRow key={s.id} s={s} compact />)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{conceptKStyles}</style>
    </div>
  );
}

function Milestone({ m, last }) {
  const color = m.status === 'done' ? 'var(--neon-green)'
              : m.status === 'active' ? 'var(--neon-cyan)'
              : m.status === 'planned' ? 'var(--neon-purple)'
              : 'var(--text-muted)';
  return (
    <div className="kw-ms-row">
      <div className="kw-ms-dot" style={{background:color,boxShadow:`0 0 12px ${color}`}}>
        {m.status === 'done' && <span style={{color:'var(--bg-void)',fontSize:'0.65rem',fontWeight:700}}>✓</span>}
      </div>
      {!last && <div className="kw-ms-line"/>}
      <div className="kw-ms-body">
        <div className="kw-ms-head">
          <span className="kw-ms-name" style={{color: m.status === 'future' ? 'var(--text-muted)' : 'var(--text-primary)'}}>{m.name}</span>
          <span className="kw-ms-date">{m.date}</span>
          <span className="kw-ms-pct" style={{color}}>{m.progress}%</span>
        </div>
        <div className="pbar thin" style={{marginTop:5}}>
          <div className="pbar-fill" style={{width:m.progress+'%',background:color,boxShadow:`0 0 8px ${color}`}}/>
        </div>
      </div>
    </div>
  );
}

function Decision({ d }) {
  return (
    <div className="kw-dec">
      <div className="kw-dec-head">
        <span className="kw-dec-date">{d.date}</span>
        <span className="kw-dec-title">{d.title}</span>
        {d.session && <span className="kw-dec-src">from <span style={{color:'var(--neon-cyan)'}}>{d.session}</span></span>}
      </div>
      <div className="kw-dec-body">{d.body}</div>
      <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
        {d.tags.map(t => <span key={t} className="kw-tag">#{t}</span>)}
      </div>
    </div>
  );
}

function Lesson({ l }) {
  return (
    <div className="kw-lesson">
      <div style={{display:'flex',alignItems:'flex-start',gap:6,marginBottom:6}}>
        <span style={{color:'var(--neon-purple)',fontSize:'0.9rem',filter:'drop-shadow(0 0 8px var(--neon-purple))',flexShrink:0,marginTop:2}}>💎</span>
        <div style={{flex:1,minWidth:0,fontFamily:'var(--font-mono)',fontSize:'0.82rem',fontWeight:600,color:'var(--text-primary)',lineHeight:1.4}}>{l.title}</div>
        {l.cross && <span style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'var(--neon-cyan)',background:'rgba(0,255,242,0.08)',padding:'1px 6px',borderRadius:'var(--radius-sm)',whiteSpace:'nowrap'}}>cross-proj</span>}
      </div>
      <div style={{fontFamily:'var(--font-body)',fontSize:'0.82rem',color:'var(--text-secondary)',lineHeight:1.55,marginBottom:6}}>{l.body}</div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {l.tags.map(t => <span key={t} className="kw-tag">#{t}</span>)}
      </div>
    </div>
  );
}

function SkillChip({ s, active }) {
  return (
    <div className="kw-skill">
      <span style={{fontSize:'1.05rem',filter: active ? 'drop-shadow(0 0 6px var(--neon-cyan))' : 'grayscale(1) brightness(0.6)',transition:'all 0.2s'}}>{s.emoji}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',fontWeight:600,color: active ? 'var(--neon-cyan)' : 'var(--text-muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.name}</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'var(--text-muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.desc}</div>
      </div>
      <span className={`kw-skill-toggle ${active?'on':''}`} title={active?'active':'off'}>
        <span className="kw-skill-toggle-knob"/>
      </span>
    </div>
  );
}

function MarkdownLite({ text }) {
  // ultra-light markdown renderer: # h, ## h2, - list, `code`, paragraph
  const lines = text.split('\n');
  const out = [];
  let listBuf = null;
  const flushList = () => { if (listBuf) { out.push(<ul key={'l'+out.length} className="md-ul">{listBuf}</ul>); listBuf = null; } };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) { flushList(); out.push(<h3 key={i} className="md-h1">{renderInline(line.slice(2))}</h3>); }
    else if (line.startsWith('## ')) { flushList(); out.push(<h4 key={i} className="md-h2">{renderInline(line.slice(3))}</h4>); }
    else if (line.startsWith('- ')) { listBuf = listBuf || []; listBuf.push(<li key={i}>{renderInline(line.slice(2))}</li>); }
    else if (line === '') { flushList(); /* skip blank */ }
    else { flushList(); out.push(<p key={i} className="md-p">{renderInline(line)}</p>); }
  });
  flushList();
  return <div className="md-body">{out}</div>;
}

function renderInline(s) {
  // handle `code` only
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith('`') ? <code key={i} className="md-code">{p.slice(1, -1)}</code> : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

const conceptKStyles = `
.kw-hero {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.4rem 1.6rem;
  position: relative;
  overflow: hidden;
}
.kw-hero::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--gradient-primary);
}
.kw-hero-row { display: flex; align-items: flex-start; gap: 1rem; }
.kw-crumb {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
}
.kw-name {
  font-family: var(--font-mono);
  font-size: 2.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--neon-cyan);
  text-shadow: 0 0 24px rgba(0,255,242,0.4);
  line-height: 1.1;
}

.kw-intent {
  background: linear-gradient(135deg, rgba(0,255,242,0.05), rgba(191,90,242,0.03));
  border-color: rgba(0,255,242,0.2);
}
.kw-intent p { color: var(--text-primary); }

/* Milestones timeline */
.kw-ms { display: flex; flex-direction: column; }
.kw-ms-row {
  position: relative;
  display: grid; grid-template-columns: 24px 1fr; gap: 0.85rem;
  padding-bottom: 1rem;
}
.kw-ms-row:last-child { padding-bottom: 0; }
.kw-ms-dot {
  width: 14px; height: 14px;
  border-radius: 50%;
  margin-left: 5px;
  margin-top: 4px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.kw-ms-line {
  position: absolute;
  left: 11px;
  top: 22px;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, var(--border-subtle), transparent);
}
.kw-ms-body {}
.kw-ms-head {
  display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
.kw-ms-name { font-weight: 600; }
.kw-ms-date { color: var(--text-muted); font-size: 0.72rem; }
.kw-ms-pct { margin-left: auto; font-weight: 600; font-size: 0.78rem; }

/* Decision card */
.kw-dec {
  padding: 0.75rem 0.9rem;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-purple);
  border-radius: var(--radius-md);
}
.kw-dec-head { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 5px; }
.kw-dec-date {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--neon-purple);
  font-weight: 600;
  background: rgba(191,90,242,0.08);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.kw-dec-title {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  color: var(--text-primary);
  font-weight: 600;
  flex: 1;
}
.kw-dec-src {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.kw-dec-body {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.kw-tag {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--neon-purple);
  background: rgba(191,90,242,0.06);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(191,90,242,0.15);
}

/* Notes / markdown */
.kw-notes {
  padding: 0.85rem 1rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 25px rgba(0,255,242,0.03);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.7;
  max-height: 360px;
  overflow-y: auto;
}
.md-body { color: var(--text-secondary); }
.md-h1 {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  color: var(--neon-cyan);
  text-shadow: 0 0 12px rgba(0,255,242,0.4);
  margin: 0.5rem 0 0.4rem;
}
.md-h1:first-child { margin-top: 0; }
.md-h2 {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--neon-purple);
  margin: 0.7rem 0 0.3rem;
}
.md-p { margin: 0 0 0.4rem; color: var(--text-secondary); }
.md-ul { margin: 0 0 0.5rem; padding-left: 1.25rem; list-style: none; }
.md-ul li { position: relative; padding-left: 0.4rem; margin-bottom: 0.15rem; color: var(--text-secondary); }
.md-ul li::before { content: '·'; color: var(--neon-cyan); position: absolute; left: -0.7rem; font-weight: 700; }
.md-code {
  font-family: var(--font-mono);
  color: var(--neon-green);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.76rem;
}

/* Lessons */
.kw-lessons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.kw-lesson {
  padding: 0.75rem 0.85rem;
  background: linear-gradient(135deg, rgba(191,90,242,0.04), rgba(255,255,255,0.02));
  border: 1px solid rgba(191,90,242,0.15);
  border-radius: var(--radius-md);
}

/* Skills sidebar */
.kw-skill {
  display: grid;
  grid-template-columns: 22px 1fr 32px;
  gap: 0.55rem;
  align-items: center;
  padding: 0.5rem 0.6rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.kw-skill:hover { border-color: var(--border-glow); transform: translateX(2px); }
.kw-skill-toggle {
  width: 28px; height: 16px;
  background: var(--bg-elevated);
  border-radius: 8px;
  position: relative;
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
  transition: all var(--transition-fast);
}
.kw-skill-toggle.on {
  background: var(--gradient-primary);
  border-color: transparent;
  box-shadow: 0 0 10px rgba(0,255,242,0.4);
}
.kw-skill-toggle-knob {
  position: absolute;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--text-secondary);
  top: 1px; left: 1px;
  transition: all var(--transition-fast);
}
.kw-skill-toggle.on .kw-skill-toggle-knob {
  background: var(--bg-void);
  left: 13px;
}
`;

window.ConceptK = ConceptK;
