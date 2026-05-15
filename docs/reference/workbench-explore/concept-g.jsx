// concept-g.jsx — Session detail. The "monitor my chats" payoff view.
// Header: session crumb. Left: full transcript (user/assistant/tool turns).
// Right: tool-call summary, files touched, token+cost breakdown, related todos, actions.

function ConceptG() {
  const session = {
    id: 's1', project: 'aurora', model: 'sonnet-4.5', tool: 'claude-code', state: 'live',
    title: 'Wire OAuth callback to session store',
    startedAt: '12:42:08',
    duration: 612,
    tokensIn: 41_320, tokensOut: 8_910, tokensCached: 32_540,
    cost: 0.19,
  };
  const project = window.AppData.projects.find(p => p.id === session.project);

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{overflow:'hidden', height:'100%'}}>
        <Topbar />

        {/* Session header */}
        <div className="sd-head">
          <div className="sd-crumb">
            <span style={{color:'var(--text-muted)',fontFamily:'var(--font-mono)',fontSize:'0.75rem'}}>workbench &nbsp;/&nbsp;</span>
            <span style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--neon-cyan)'}}>{project.emoji} {project.name}</span>
            <span style={{color:'var(--text-muted)',fontFamily:'var(--font-mono)',fontSize:'0.75rem'}}>&nbsp;/&nbsp; sessions &nbsp;/&nbsp;</span>
            <span style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--text-primary)'}}>{session.id}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'1rem',marginTop:'0.4rem'}}>
            <div style={{flex:1,minWidth:0}}>
              <h2 style={{fontFamily:'var(--font-mono)',fontSize:'1.45rem',fontWeight:700,color:'var(--neon-cyan)',textShadow:'0 0 18px rgba(0,255,242,0.4)',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {session.title}
              </h2>
              <div style={{display:'flex',gap:'0.6rem',alignItems:'center',marginTop:'0.4rem',flexWrap:'wrap'}}>
                <span className="sess-state live"><LiveDot color="var(--neon-green)" /> live</span>
                <ToolBadge tool={session.tool} />
                <ModelBadge model={session.model} />
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)'}}>started {session.startedAt} · {window.fmt.dur(session.duration)}</span>
              </div>
            </div>
            <div style={{display:'flex',gap:'0.4rem'}}>
              <button className="sd-action">📋 copy</button>
              <button className="sd-action">⏸ pause</button>
              <button className="sd-action">⑂ fork</button>
              <button className="sd-action danger">⏹ kill</button>
            </div>
          </div>
        </div>

        {/* Body: transcript + side */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 340px', gap:'1.25rem', flex:1, minHeight:0}}>
          {/* TRANSCRIPT */}
          <div className="transcript" style={{minWidth:0, overflowY:'auto'}}>
            <Turn kind="user" who="you" at="12:41:52">
              wire the oauth callback to the new session store. should use the JWT helper already in src/auth/jwt.ts
            </Turn>

            <Turn kind="thinking" at="12:41:55">
              The user wants to connect the OAuth callback path to the new SessionStore. Let me first
              look at what's there to understand the structure before proposing a change.
            </Turn>

            <Turn kind="assistant" at="12:42:08">
              <p>Reading the current OAuth handler and the session-store interface to plan the wiring.</p>
            </Turn>

            <ToolCall name="read_file" args="src/auth/oauth.ts" status="ok" lines="84">
              <Diff
                lines={[
                  { t: 'ctx', n: 12, txt: "export async function handleCallback(req: Request) {" },
                  { t: 'ctx', n: 13, txt: "  const code = req.url.searchParams.get('code');" },
                  { t: 'ctx', n: 14, txt: "  if (!code) return new Response('missing code', { status: 400 });" },
                ]}
                collapsed
              />
            </ToolCall>

            <ToolCall name="read_file" args="src/auth/jwt.ts" status="ok" lines="62" />
            <ToolCall name="read_file" args="src/auth/session-store.ts" status="ok" lines="48" />

            <Turn kind="assistant" at="12:42:18">
              <p>Three call sites for <code>SessionStore.set</code> currently. The OAuth path needs to
              create a Session with the user info from the token, then redirect.</p>
              <p>Proposing this shape for the wiring:</p>
              <pre className="td-code">{`const session = await sessions.fromJwt(jwt, {
  tenant: payload.tenant_id,
  ttl: 60 * 60 * 24 * 7,
});
return redirect('/dashboard', { 'Set-Cookie': session.cookie() });`}</pre>
            </Turn>

            <ToolCall name="edit_file" args="src/auth/session.ts" status="ok" plus={24} minus={3}>
              <Diff
                lines={[
                  { t: 'rem', n: 22, txt: "  const id = crypto.randomUUID();" },
                  { t: 'add', n: 22, txt: "  const id = await this.generateId(tenant);" },
                  { t: 'add', n: 23, txt: "  const session = new Session(id, jwt, tenant, ttl);" },
                  { t: 'ctx', n: 24, txt: "  this.store.set(id, session);" },
                  { t: 'add', n: 25, txt: "  this.metrics.inc('session.created', { tenant });" },
                  { t: 'ctx', n: 26, txt: "  return session;" },
                ]}
              />
            </ToolCall>

            <ToolCall name="edit_file" args="src/auth/oauth.ts" status="ok" plus={9} minus={1} collapsed />

            <ToolCall name="run_tests" args="--testPathPattern auth" status="warn">
              <pre className="td-code">{`PASS  src/auth/jwt.test.ts (14 tests)
PASS  src/auth/oauth.test.ts (8 tests)
FAIL  src/auth/session.test.ts
  ● rejects expired sessions
    Expected: 401
    Received: 200
  ● cleans up on logout
    Timed out after 5000ms`}</pre>
            </ToolCall>

            <Turn kind="assistant" at="12:42:27" pending>
              <p>Two failures — both look like they'd been passing against the old uuid-only id path.
              Investigating <code>session.test.ts</code> now…</p>
              <span className="td-cursor">▎</span>
            </Turn>
          </div>

          {/* SIDE */}
          <div style={{display:'flex',flexDirection:'column',gap:'0.85rem',minWidth:0,overflowY:'auto'}}>
            {/* Tokens + cost */}
            <div className="surface" style={{padding:'1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> tokens · cost
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                <Tile k="in" v={window.fmt.k(session.tokensIn)} c="var(--neon-cyan)" />
                <Tile k="out" v={window.fmt.k(session.tokensOut)} c="var(--neon-purple)" />
                <Tile k="cached" v={window.fmt.k(session.tokensCached)} c="var(--neon-green)" />
                <Tile k="cost" v={'$'+session.cost.toFixed(2)} c="var(--neon-orange)" />
              </div>
              {/* Token stack bar */}
              <div style={{marginTop:'0.7rem'}}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>composition</div>
                <div style={{height:8,display:'flex',borderRadius:4,overflow:'hidden',background:'var(--bg-elevated)'}}>
                  <div style={{width:'50%',background:'var(--neon-cyan)',boxShadow:'0 0 10px var(--neon-cyan)'}}/>
                  <div style={{width:'11%',background:'var(--neon-purple)',boxShadow:'0 0 10px var(--neon-purple)'}}/>
                  <div style={{width:'39%',background:'var(--neon-green)',boxShadow:'0 0 10px var(--neon-green)'}}/>
                </div>
              </div>
            </div>

            {/* Tool call summary */}
            <div className="surface" style={{padding:'1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> tool calls <span className="count">— 7</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[
                  { name: 'read_file', count: 3, color: 'var(--neon-cyan)' },
                  { name: 'edit_file', count: 2, color: 'var(--neon-purple)' },
                  { name: 'run_tests', count: 1, color: 'var(--neon-orange)' },
                  { name: 'grep', count: 1, color: 'var(--text-muted)' },
                ].map(t => (
                  <div key={t.name} style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:'0.78rem'}}>
                    <span style={{color:t.color}}>●</span>
                    <span style={{color:'var(--text-primary)',flex:1}}>{t.name}</span>
                    <span style={{color:'var(--text-muted)'}}>×{t.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Files touched */}
            <div className="surface" style={{padding:'1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> files touched <span className="count">— 2</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[
                  { p: 'src/auth/session.ts', plus: 24, minus: 3 },
                  { p: 'src/auth/oauth.ts', plus: 9, minus: 1 },
                ].map(f => (
                  <div key={f.p} style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:'0.74rem'}}>
                    <span style={{color:'var(--text-primary)',flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.p}</span>
                    <span style={{color:'var(--neon-green)'}}>+{f.plus}</span>
                    <span style={{color:'var(--neon-pink)'}}>−{f.minus}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Related todos */}
            <div className="surface" style={{padding:'1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> related todos
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {window.AppData.todos.filter(t => t.project === 'aurora').slice(0, 3).map(t => <TodoItem key={t.id} t={t} />)}
              </div>
            </div>

            {/* Resume / share */}
            <div className="surface" style={{padding:'1rem'}}>
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> actions
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <button className="sd-side-btn">↗ open in claude code</button>
                <button className="sd-side-btn">⤴ share transcript</button>
                <button className="sd-side-btn">⤓ export jsonl</button>
                <button className="sd-side-btn">🔖 save as snippet</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{conceptGStyles}</style>
    </div>
  );
}

function Turn({ kind, who, at, children, pending }) {
  const ico = kind === 'user' ? '$' : kind === 'assistant' ? '>' : kind === 'thinking' ? '∿' : '·';
  const color = kind === 'user' ? 'var(--neon-green)' : kind === 'assistant' ? 'var(--neon-cyan)' : kind === 'thinking' ? 'var(--neon-purple)' : 'var(--text-muted)';
  return (
    <div className={`td-turn ${kind} ${pending?'pending':''}`}>
      <div className="td-turn-icon" style={{color}}>{ico}</div>
      <div className="td-turn-body">
        <div className="td-turn-meta">
          <span style={{color, fontWeight: 600}}>{kind === 'thinking' ? 'thinking' : (who || (kind==='assistant'?'sonnet-4.5':'agent'))}</span>
          <span style={{color:'var(--text-muted)'}}>· {at}</span>
        </div>
        <div className="td-turn-content">{children}</div>
      </div>
    </div>
  );
}

function ToolCall({ name, args, status, lines, plus, minus, collapsed, children }) {
  const [open, setOpen] = React.useState(!collapsed);
  const statusColor = status === 'ok' ? 'var(--neon-green)' : status === 'warn' ? 'var(--neon-orange)' : status === 'error' ? 'var(--neon-pink)' : 'var(--text-muted)';
  const statusGlyph = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : status === 'error' ? '✕' : '·';
  return (
    <div className={`td-tool ${open?'open':''}`}>
      <button className="td-tool-head" onClick={() => setOpen(!open)}>
        <span className="td-tool-chevron">{open ? '▾' : '▸'}</span>
        <span className="td-tool-name">tool_call</span>
        <span className="td-tool-fn">{name}</span>
        <span className="td-tool-arg">{args}</span>
        <span className="td-tool-status" style={{color:statusColor}}>{statusGlyph} {status}</span>
        {plus != null && <span style={{color:'var(--neon-green)',fontFamily:'var(--font-mono)',fontSize:'0.72rem'}}>+{plus}</span>}
        {minus != null && <span style={{color:'var(--neon-pink)',fontFamily:'var(--font-mono)',fontSize:'0.72rem'}}>−{minus}</span>}
        {lines != null && <span style={{color:'var(--text-muted)',fontFamily:'var(--font-mono)',fontSize:'0.72rem'}}>{lines} lines</span>}
      </button>
      {open && children && <div className="td-tool-body">{children}</div>}
    </div>
  );
}

function Diff({ lines, collapsed }) {
  if (collapsed) return null;
  return (
    <div className="td-diff">
      {lines.map((l, i) => (
        <div key={i} className={`td-diff-line ${l.t}`}>
          <span className="td-diff-gutter">{l.t==='add'?'+':l.t==='rem'?'−':' '}</span>
          <span className="td-diff-n">{l.n}</span>
          <span className="td-diff-txt">{l.txt}</span>
        </div>
      ))}
    </div>
  );
}

const conceptGStyles = `
.sd-head {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
}
.sd-crumb { display: flex; align-items: center; }
.sd-action {
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.sd-action:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
.sd-action.danger:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.sd-side-btn {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  color: var(--text-secondary);
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}
.sd-side-btn:hover { border-color: var(--border-glow); color: var(--neon-cyan); background: rgba(0,255,242,0.04); }

.transcript {
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  box-shadow: inset 0 0 30px rgba(0,255,242,0.03);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.65;
  display: flex; flex-direction: column; gap: 0.85rem;
}

.td-turn {
  display: grid; grid-template-columns: 24px 1fr; gap: 0.6rem;
  padding: 0.55rem 0;
  border-left: 2px solid transparent;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
}
.td-turn.thinking { opacity: 0.7; }
.td-turn.thinking .td-turn-body { font-style: italic; color: var(--text-secondary); }
.td-turn.pending { border-left-color: var(--neon-cyan); background: rgba(0,255,242,0.03); }
.td-turn-icon {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.95rem;
  padding-top: 1px;
}
.td-turn-meta {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  margin-bottom: 4px;
  text-transform: lowercase;
}
.td-turn-content { color: var(--text-secondary); }
.td-turn-content p { margin: 0; margin-bottom: 0.4rem; font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; }
.td-turn-content p:last-child { margin-bottom: 0; }
.td-turn-content code {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.8rem;
}
.td-cursor {
  display: inline-block;
  color: var(--neon-cyan);
  animation: blink 1s steps(1) infinite;
}

.td-code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-cyan);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.85rem;
  margin: 0.4rem 0;
  color: var(--neon-green);
  overflow-x: auto;
  white-space: pre;
  line-height: 1.55;
}

.td-tool {
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(191,90,242,0.03);
  overflow: hidden;
}
.td-tool.open { border-color: rgba(191,90,242,0.25); }
.td-tool-head {
  width: 100%;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
}
.td-tool-head:hover { background: rgba(191,90,242,0.05); }
.td-tool-chevron { color: var(--text-muted); font-size: 0.7rem; }
.td-tool-name { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.62rem; }
.td-tool-fn { color: var(--neon-purple); font-weight: 600; }
.td-tool-arg {
  color: var(--text-primary);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.td-tool-status { margin-left: auto; font-weight: 600; white-space: nowrap; }

.td-tool-body { padding: 0 0.75rem 0.75rem; }

.td-diff {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.td-diff-line { display: grid; grid-template-columns: 18px 38px 1fr; padding: 1px 0; }
.td-diff-line.add { background: rgba(48,209,88,0.07); }
.td-diff-line.rem { background: rgba(255,55,95,0.07); }
.td-diff-gutter { text-align: center; font-weight: 700; }
.td-diff-line.add .td-diff-gutter { color: var(--neon-green); }
.td-diff-line.rem .td-diff-gutter { color: var(--neon-pink); }
.td-diff-line.ctx .td-diff-gutter { color: var(--text-muted); }
.td-diff-n { color: var(--text-muted); text-align: right; padding-right: 8px; }
.td-diff-txt { white-space: pre; color: var(--text-primary); }
.td-diff-line.ctx .td-diff-txt { color: var(--text-secondary); }
`;

window.ConceptG = ConceptG;
