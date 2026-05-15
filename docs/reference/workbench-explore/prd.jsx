// prd.jsx — Product requirements doc artboard.

function PRD() {
  return (
    <div className="dashboard-canvas" style={{ overflowY: 'auto' }}>
      <div className="inner" style={{ maxWidth: 880, margin: '0 auto', padding: '3rem 2.5rem', overflow:'visible', height:'auto' }}>
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'0.75rem'}}>
          <span style={{fontSize:'2.25rem',filter:'drop-shadow(0 0 16px var(--neon-cyan))',animation:'pulse 2s ease-in-out infinite'}}>🎯</span>
          <div>
            <div className="mono" style={{fontSize:'0.72rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Product Requirements · v0.1 draft</div>
            <h1 style={{fontFamily:'var(--font-mono)',fontSize:'2rem',fontWeight:700,lineHeight:1.1,letterSpacing:'-0.02em',marginTop:4,background:'var(--gradient-logo)',WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent'}}>
              workbench
            </h1>
          </div>
        </div>
        <p style={{fontFamily:'var(--font-mono)',fontSize:'1rem',color:'var(--text-secondary)',marginBottom:'2rem'}}>
          <span style={{color:'var(--neon-cyan)',marginRight:8,animation:'blink 1s steps(1) infinite'}}>&gt;</span>
          Unified workspace for AI-assisted coding. todo + project state + agent telemetry, one screen.
        </p>

        {/* Problem */}
        <PrdSection num="01" title="The problem">
          <ul className="prd-bullets">
            <li>Multiple AI coding tools (Claude Code, Codex) run across many projects. There's <strong>no single pane</strong> to see what's running, what's queued, what's stuck.</li>
            <li>Todos live in scattered places (issue tracker, notebook, comments in code, "Claude, what was I doing?"). Context switching is expensive.</li>
            <li>Token + cost spend is opaque until the monthly bill arrives. Per-project burn is invisible.</li>
            <li>Feature-level progress (this PR is 70% done) lives only in your head.</li>
          </ul>
        </PrdSection>

        {/* Audience */}
        <PrdSection num="02" title="Audience">
          <p>Solo developers and small teams running <strong>3+ active codebases</strong> with at least one AI agent attached to each. Power user — they already drive Claude Code / Codex from the terminal.</p>
        </PrdSection>

        {/* Goals */}
        <PrdSection num="03" title="Goals · v1">
          <div className="prd-goals">
            <Goal n="G1" title="Capture without friction" body="Any thought — task, idea, half-baked half-sentence — lands in inbox in &lt;2s. No required fields. Tag #project later, or never." />
            <Goal n="G2" title="One-glance status" body="Open the dashboard, see every project + what's happening right now, in under 3 seconds." />
            <Goal n="G3" title="Todos with project lineage" body="A flat todo list tagged with #project. Orphan todos (no project) live in inbox until promoted. Project pages aggregate their todos automatically." />
            <Goal n="G4" title="Agent monitor" body="Live + historical Claude Code / Codex sessions, with model, tokens, cost, duration, summary." />
            <Goal n="G5" title="Feature progress" body="Per-project breakdown: what sub-features exist, what % done, what's blocking." />
            <Goal n="G6" title="Burn awareness" body="Tokens & cost in the chrome at all times. Per-project burn on hover." />
            <Goal n="G7" title="Project lifecycle" body="Add / archive / edit projects in &lt; 30s. Auto-discover from git roots; manual one-tag projects also supported." />
          </div>
        </PrdSection>

        {/* Non-goals */}
        <PrdSection num="04" title="Non-goals · v1">
          <ul className="prd-bullets">
            <li>Not an issue tracker — no comments, assignees, sprints. Todos are personal.</li>
            <li>Not a chat client — you don't compose new sessions here, you observe them.</li>
            <li>Not an IDE — no inline editing. Click-through goes to the underlying tool.</li>
            <li>Not multi-user / collaborative. Single-user dashboard.</li>
          </ul>
        </PrdSection>

        {/* Information architecture */}
        <PrdSection num="05" title="Information model">
          <table className="prd-table">
            <thead><tr><th>Entity</th><th>Key fields</th><th>Where it comes from</th></tr></thead>
            <tbody>
              <tr><td>Project</td><td>id, name, emoji, branch, status, progress%, doing, lastTouched, source (local repo / git remote / tag-only), tags, budget</td><td>auto-discovered from git roots OR user-created via &quot;new project&quot; flow</td></tr>
              <tr><td>Feature</td><td>name, progress%, status (todo/wip/almost/done), order</td><td>seeded at project creation; user-edited; auto-suggested from session summaries</td></tr>
              <tr><td>Todo</td><td>text, project (nullable!), kind (task/idea), priority, due (today/this-week/someday), #tags, done</td><td>quick-capture input. Orphans go to inbox.</td></tr>
              <tr><td>Inbox item</td><td>same as Todo with <code>project=null</code></td><td>quick-capture without #project tag</td></tr>
              <tr><td>Session</td><td>id, project, model, tool, state, title, preview, tokens, cost, duration, at</td><td>tail Claude Code &amp; Codex session logs</td></tr>
              <tr><td>Stats</td><td>active, tokens24h, cost24h, modelMix</td><td>aggregated from sessions over rolling 24h</td></tr>
              <tr><td>Milestone</td><td>name, status, date, progress%</td><td>user-created, lives on project</td></tr>
              <tr><td>Decision</td><td>date, title, body, tags, session?</td><td>AI-proposed from session outcomes, user accepts/edits</td></tr>
              <tr><td>Lesson</td><td>title, body, tags, cross-project?</td><td>atomic knowledge cards, searchable across all projects when <code>cross=true</code></td></tr>
              <tr><td>Notes</td><td>markdown blob per project</td><td>user-edited, autosaves to <code>~/.workbench/&lt;project&gt;/notes.md</code></td></tr>
              <tr><td>Skill</td><td>id, name, emoji, desc, source, stars, installed, official?</td><td>Claude Code skill registry + locally installed</td></tr>
              <tr><td>Project ↔ Skill</td><td>many-to-many binding</td><td>per-project; auto-loaded on session start</td></tr>
            </tbody>
          </table>
        </PrdSection>

        {/* User stories */}
        <PrdSection num="06" title="User stories">
          <Story id="US-1" actor="developer" verb="have a random idea at 11pm" want="dump it into inbox in two seconds — no project, no tags, no fields" />
          <Story id="US-2" actor="developer" verb="open the dashboard in the morning" want="see what every project is in the middle of + what's still in my inbox from yesterday" />
          <Story id="US-3" actor="developer" verb="triage inbox" want="promote some items to a real project, archive the rest, in one click each" />
          <Story id="US-4" actor="developer" verb="start a new side project" want="create it in &lt; 30s with optional features pre-seeded" />
          <Story id="US-5" actor="developer" verb="watch a live Claude Code session" want="see the model's last action and current step, in real time" />
          <Story id="US-6" actor="developer" verb="check today's spend" want="know how much I've burned across all projects, by model" />
          <Story id="US-7" actor="developer" verb="resume yesterday's work" want="re-open the right session in the right tool with one click" />
          <Story id="US-8" actor="developer" verb="check progress on a feature" want="see the % done bar, which sessions touched it, what's left" />
        </PrdSection>

        {/* Surfaces */}
        <PrdSection num="07" title="Surfaces explored (this doc)">
          <ul className="prd-bullets">
            <li><strong>A · Card Wall</strong> — pinterest grid. Quick capture + inbox + live + todos in right rail. Best default for "what am I working on".</li>
            <li><strong>B · Mission Control</strong> — 3-pane sidebar / detail / live-stream. Best for depth on one project.</li>
            <li><strong>C · Hero + Stream</strong> — featured project front-and-center, live agent log running down the side. Best when you have <em>one</em> primary focus.</li>
            <li><strong>D · Constellation</strong> — projects as nodes in a graph, scale = activity, color = status. Best for thinking about portfolio shape.</li>
            <li><strong>E · Capture &amp; Plan</strong> — <strong>todo-first.</strong> Big capture bar + 4-col board (Inbox · Today · Doing · Later). Project rail on the right. Best for the "lots of daily ideas, sort later" workflow.</li>
            <li><strong>F · Project Lifecycle</strong> — new-project modal + edit-project panel. Shows how projects get created, archived, and have their features / tags / budgets configured.</li>
            <li><strong>G · Session detail</strong> — clicking any session opens this. Full transcript with collapsible tool calls, inline diffs, token composition, files-touched, related todos, resume/fork/kill actions.</li>
            <li><strong>H · Cost &amp; burn analytics</strong> — daily spend chart (30d), per-project leaderboard, hourly heatmap (7×24), model donut, per-scope budgets, alerts.</li>
            <li><strong>I · ⌘K command palette</strong> — fuzzy search across projects, todos, sessions; quick actions (new todo, switch view, theme). Power-user nav glue.</li>
            <li><strong>J · Weekly review</strong> — Sunday-night ritual. AI-generated narrative summary, KPIs vs last week, done-celebration grouped by project, features advanced, next-week plan with day buckets.</li>
            <li><strong>K · Project workbench</strong> — the "home" for one project. Intent statement, milestones timeline, decision log (AI auto-captured from sessions), notes / scratchpad, atomic lessons (cross-project searchable), bound skills sidebar.</li>
            <li><strong>M · Skills library</strong> — browse / install / bind Claude Code skills. Per-skill detail shows which projects it's bound to + recent uses. Toggles to auto-load on session start.</li>
            <li><strong>L · Todo detail / split / promote</strong> — click any todo to open this modal. Edit, add sub-tasks, attach context. Promote inbox idea → feature / project / lesson. One-click "run with claude code" opens O.</li>
            <li><strong>O · Start session dispatcher</strong> — quick dispatch a prompt to a tool + model + project + skills + context bundle. Budget caps. The single way to <em>start</em> work from inside the dashboard.</li>
            <li><strong>N · Settings · themes · integrations</strong> — appearance picker (5 themes), local paths, model rates, integrations (GitHub / Linear / Slack / Obsidian / Notion), quick toggles for ambient effects.</li>
          </ul>
          <p style={{marginTop:'0.6rem',fontSize:'0.85rem',color:'var(--text-muted)'}}>Recommendation: ship <strong>E as default</strong> (capture-first matches the daily ritual), expose <strong>A</strong> as <code>⌘+2</code> for the project-wall view, <strong>B</strong> as <code>⌘+3</code> for deep focus. <strong>H</strong> as <code>⌘+5</code>. <strong>K</strong> opens from any project name in any view. <strong>J</strong> is on a Sunday cron. <strong>G</strong> opens any time you click a session. <strong>I</strong> is always-available via <code>⌘K</code>.</p>
        </PrdSection>

        <PrdSection num="07b" title="Knowledge + skills (built into K & M)">
          <p>Knowledge is <strong>not a separate KB app</strong>. Instead it lives inside the project workbench (K) as four layers:</p>
          <ul className="prd-bullets">
            <li><strong>Intent</strong> — one sentence on what success looks like. Without this, "75% done" is meaningless.</li>
            <li><strong>Milestones</strong> — versioned timeline (v0.1, v0.2…). Higher-altitude than features.</li>
            <li><strong>Decision log</strong> — chronological "why we chose X" entries. Auto-proposed from session outcomes; user accepts/edits.</li>
            <li><strong>Notes / scratchpad</strong> — plain markdown, autosaves. Stack, conventions, open questions.</li>
            <li><strong>Lessons</strong> — atomic gotcha cards. Tagged. Can be marked cross-project so they surface in search across all projects.</li>
          </ul>
          <p style={{marginTop:'0.6rem'}}><strong>Skills (M)</strong> are Claude Code skill packages, bound per-project. When you start a session on a project, its bound skills auto-load as context. Skills can be official / community / experimental — same source taxonomy as the public registry.</p>
        </PrdSection>

        {/* Tech */}
        <PrdSection num="08" title="Tech sketch">
          <ul className="prd-bullets">
            <li><strong>Web Dashboard</strong>, served by a local daemon. Same daemon tails <code>~/.claude/projects/*/sessions/*.jsonl</code> and Codex logs.</li>
            <li>React + the design system in this file. Real-time updates via Server-Sent Events from the daemon.</li>
            <li>Todos persist to <code>~/.workbench/todos.json</code>. Projects auto-discovered from git roots; user can hide/pin.</li>
            <li>No cloud. Everything local.</li>
          </ul>
        </PrdSection>

        {/* Open questions */}
        <PrdSection num="09" title="Open questions">
          <ul className="prd-bullets">
            <li>How are features defined? Manual sub-tasks? Or auto-derived from todo cluster?</li>
            <li>Should the dashboard be able to <em>start</em> a session, or strictly read-only?</li>
            <li>Cost: per-model rates may drift. Hard-coded or fetched?</li>
            <li>What's the empty state when no projects are tracked yet?</li>
          </ul>
        </PrdSection>

        <div style={{marginTop:'2.5rem',padding:'1rem 1.25rem',background:'var(--bg-glass)',border:'1px dashed var(--border-glow)',borderRadius:'var(--radius-md)',fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--text-muted)'}}>
          <span style={{color:'var(--neon-cyan)'}}>$</span> <span style={{color:'var(--neon-green)'}}>workbench --view=cards</span> &nbsp;<span style={{color:'var(--text-muted)'}}># default</span><br/>
          <span style={{color:'var(--neon-cyan)'}}>$</span> <span style={{color:'var(--neon-green)'}}>workbench --view=mission</span><br/>
          <span style={{color:'var(--neon-cyan)'}}>$</span> <span style={{color:'var(--neon-green)'}}>workbench --view=hero --project=aurora</span><br/>
          <span style={{color:'var(--neon-cyan)'}}>$</span> <span style={{color:'var(--neon-green)'}}>workbench --view=graph</span>
        </div>
      </div>
      <style>{prdStyles}</style>
    </div>
  );
}

function PrdSection({ num, title, children }) {
  return (
    <section className="prd-sec">
      <h2 className="prd-h2">
        <span className="prd-num">{num}</span>
        <span>{title}</span>
      </h2>
      <div className="prd-body">{children}</div>
    </section>
  );
}

function Goal({ n, title, body }) {
  return (
    <div className="prd-goal">
      <div className="prd-goal-num">{n}</div>
      <div>
        <div className="prd-goal-title">{title}</div>
        <div className="prd-goal-body">{body}</div>
      </div>
    </div>
  );
}

function Story({ id, actor, verb, want }) {
  return (
    <div className="prd-story">
      <span className="prd-story-id">{id}</span>
      <span>As a <strong>{actor}</strong>, when I <strong>{verb}</strong>, I want to <strong>{want}</strong>.</span>
    </div>
  );
}

const prdStyles = `
.prd-sec { margin-bottom: 2rem; }
.prd-h2 {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex; align-items: baseline; gap: 0.6rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border-subtle);
}
.prd-num {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--neon-cyan);
  text-shadow: 0 0 10px rgba(0,255,242,0.5);
  font-weight: 500;
}
.prd-body { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.65; }
.prd-body strong { color: var(--text-primary); font-weight: 600; }
.prd-body code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--neon-green);
  background: var(--bg-elevated);
  padding: 1px 5px;
  border-radius: 4px;
}
.prd-bullets { list-style: none; padding: 0; margin: 0; }
.prd-bullets li {
  position: relative; padding-left: 1.25rem; margin-bottom: 0.45rem;
}
.prd-bullets li::before {
  content: '▸'; position: absolute; left: 0; top: 0;
  color: var(--neon-cyan);
}
.prd-goals { display: grid; gap: 0.6rem; }
.prd-goal {
  display: grid; grid-template-columns: 38px 1fr; gap: 0.75rem;
  padding: 0.7rem 0.9rem; background: var(--bg-glass); border: 1px solid var(--border-hair); border-radius: var(--radius-md);
}
.prd-goal-num {
  font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700;
  color: var(--bg-void); background: var(--gradient-primary);
  height: 28px; border-radius: var(--radius-pill);
  display: flex; align-items: center; justify-content: center;
}
.prd-goal-title { font-family: var(--font-mono); font-weight: 600; color: var(--neon-cyan); font-size: 0.9rem; }
.prd-goal-body { font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px; }
.prd-table {
  width: 100%; border-collapse: collapse;
  font-family: var(--font-mono); font-size: 0.78rem;
}
.prd-table th, .prd-table td {
  text-align: left; padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--border-hair);
}
.prd-table th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.05em; }
.prd-table td { color: var(--text-secondary); }
.prd-table td:first-child { color: var(--neon-cyan); }
.prd-story {
  display: flex; align-items: flex-start; gap: 0.6rem;
  padding: 0.5rem 0.75rem; margin-bottom: 0.4rem;
  border-left: 2px solid var(--neon-purple);
  background: rgba(191,90,242,0.04);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  font-size: 0.85rem;
}
.prd-story-id {
  font-family: var(--font-mono); font-size: 0.7rem; font-weight: 700;
  color: var(--neon-purple); flex-shrink: 0;
  padding-top: 2px;
}
`;

window.PRD = PRD;
