import type { ReactNode } from 'react';

/**
 * Product Requirements Doc — scrollable artboard, all in-page. No backend,
 * pure markdown-style content rendered with PrdSection/Goal/Story helpers.
 */
export function ConceptPRD(_: { data: unknown; reload: () => void }) {
  void _;
  return (
    <div className="dashboard-canvas" style={{ overflowY: 'auto' }}>
      <div className="inner" style={{ maxWidth: 880, margin: '0 auto', padding: '3rem 2.5rem', overflow: 'visible', height: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '2.25rem', filter: 'drop-shadow(0 0 16px var(--neon-cyan))', animation: 'pulse 2s ease-in-out infinite' }}>🎯</span>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Product Requirements · v0.2 (stash workbench)
            </div>
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', marginTop: 4, background: 'var(--gradient-logo)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              stash
            </h1>
          </div>
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          <span style={{ color: 'var(--neon-cyan)', marginRight: 8, animation: 'blink 1s steps(1) infinite' }}>&gt;</span>
          Unified local workspace for AI-assisted coding. Todo + project state + agent telemetry, one screen.
        </p>

        <PrdSection num="01" title="The problem">
          <ul className="prd-bullets">
            <li>Multiple AI coding tools (Claude Code, Codex) run across many projects. There's <strong>no single pane</strong> to see what's running, what's queued, what's stuck.</li>
            <li>Todos live in scattered places (issue tracker, notebook, comments, "Claude, what was I doing?"). Context switching is expensive.</li>
            <li>Token + cost spend is opaque until the monthly bill arrives. Per-project burn is invisible.</li>
            <li>Feature-level progress (this PR is 70% done) lives only in your head.</li>
          </ul>
        </PrdSection>

        <PrdSection num="02" title="Audience">
          <p>Solo developers and small teams running <strong>3+ active codebases</strong> with at least one AI agent attached to each. Power user — already drives Claude Code / Codex from the terminal.</p>
        </PrdSection>

        <PrdSection num="03" title="Goals · v1">
          <div className="prd-goals">
            <Goal n="G1" title="Capture without friction"     body="Any thought lands in inbox in < 2s. No required fields. Tag #project later, or never." />
            <Goal n="G2" title="One-glance status"           body="Open the dashboard, see every project + what's happening right now, in under 3 seconds." />
            <Goal n="G3" title="Todos with project lineage"  body="Flat todo list tagged with #project. Orphans live in inbox until promoted. Project pages aggregate todos automatically." />
            <Goal n="G4" title="Agent monitor"               body="Live + historical Claude Code / Codex sessions with model, tokens, cost, duration, summary." />
            <Goal n="G5" title="Feature progress"            body="Per-project breakdown: what sub-features exist, what % done, what's blocking." />
            <Goal n="G6" title="Burn awareness"              body="Tokens & cost in the chrome at all times. Per-project burn on hover." />
            <Goal n="G7" title="Project lifecycle"           body="Add / archive / edit projects in < 30s. Auto-discover from git roots; manual one-tag projects also supported." />
          </div>
        </PrdSection>

        <PrdSection num="04" title="Non-goals · v1">
          <ul className="prd-bullets">
            <li>Not an issue tracker — no comments, assignees, sprints. Todos are personal.</li>
            <li>Not a chat client — you don't compose new sessions here, you observe them.</li>
            <li>Not an IDE — no inline editing. Click-through goes to the underlying tool.</li>
            <li>Not multi-user / collaborative. Single-user dashboard.</li>
          </ul>
        </PrdSection>

        <PrdSection num="05" title="Information model">
          <table className="prd-table">
            <thead><tr><th>Entity</th><th>Key fields</th><th>Where it comes from</th></tr></thead>
            <tbody>
              <tr><td>Project (Area)</td><td>id, name, emoji, branch, status, progress%, doing, lastTouched, source, tags, budget</td><td>auto-discovered from git roots OR user-created via "new project" flow (Concept F)</td></tr>
              <tr><td>Feature</td><td>name, progress%, status, order</td><td>seeded at project creation; user-edited; auto-suggested from session summaries</td></tr>
              <tr><td>Todo (WorkItem)</td><td>text, project (nullable), kind, priority, due, #tags, done</td><td>quick-capture; orphans → inbox</td></tr>
              <tr><td>Session</td><td>id, project, model, tool, state, title, preview, tokens, cost, duration, at</td><td>tail Claude Code &amp; Codex session logs (already wired)</td></tr>
              <tr><td>Stats</td><td>active, tokens24h, cost24h, modelMix</td><td>aggregated from sessions over rolling 24h</td></tr>
              <tr><td>Milestone</td><td>name, status, date, progress%</td><td>user-created, lives on project (Phase 3b)</td></tr>
              <tr><td>Decision</td><td>date, title, body, tags, session?</td><td>AI-proposed from session outcomes (Phase 3b)</td></tr>
              <tr><td>Lesson</td><td>title, body, tags, cross-project?</td><td>atomic knowledge cards (Phase 3b)</td></tr>
              <tr><td>Notes</td><td>markdown blob per project</td><td>user-edited (Phase 3b)</td></tr>
              <tr><td>Skill</td><td>id, name, emoji, desc, source, stars, installed, official?</td><td>Phase 3a skill domain</td></tr>
              <tr><td>Project ↔ Skill</td><td>many-to-many binding</td><td>per-project; auto-loaded on session start</td></tr>
            </tbody>
          </table>
        </PrdSection>

        <PrdSection num="06" title="User stories">
          <Story id="US-1" actor="developer" verb="have a random idea at 11pm"        want="dump it into inbox in two seconds — no project, no tags, no fields" />
          <Story id="US-2" actor="developer" verb="open the dashboard in the morning"  want="see what every project is in the middle of + what's still in my inbox" />
          <Story id="US-3" actor="developer" verb="triage inbox"                       want="promote some items to a real project, archive the rest, in one click each" />
          <Story id="US-4" actor="developer" verb="start a new side project"           want="create it in < 30s with optional features pre-seeded" />
          <Story id="US-5" actor="developer" verb="watch a live Claude Code session"  want="see the model's last action and current step, in real time" />
          <Story id="US-6" actor="developer" verb="check today's spend"                want="know how much I've burned across all projects, by model" />
          <Story id="US-7" actor="developer" verb="resume yesterday's work"            want="re-open the right session in the right tool with one click" />
          <Story id="US-8" actor="developer" verb="check progress on a feature"        want="see the % done bar, which sessions touched it, what's left" />
        </PrdSection>

        <PrdSection num="07" title="Surfaces (16 concepts in this build)">
          <ul className="prd-bullets">
            <li><strong>E · Capture &amp; Plan</strong> — todo-first dashboard. Big capture bar + 4-col board. <em>Default at /</em>.</li>
            <li><strong>A · Card Wall</strong> — Pinterest project grid + right rail (live, inbox, todos).</li>
            <li><strong>B · Mission Control</strong> — 3-pane: project rail / hero+features+todos / agent stream + history.</li>
            <li><strong>C · Hero + Stream</strong> — single project featured, mini-grid below, live feed.</li>
            <li><strong>D · Constellation</strong> — projects as graph nodes, ring=progress, size=sessions, timeline strip.</li>
            <li><strong>F · Project Lifecycle</strong> — new-project modal + edit-project panel side by side.</li>
            <li><strong>G · Session detail</strong> — transcript with collapsible tool calls, diffs, token composition, related todos.</li>
            <li><strong>H · Cost &amp; burn analytics</strong> — daily spend, donut, hourly heatmap, leaderboard, budgets, alerts.</li>
            <li><strong>I · ⌘K command palette</strong> — fuzzy search projects / todos / sessions / actions; live keyboard nav.</li>
            <li><strong>J · Weekly review</strong> — narrative summary, KPIs, done-celebration, features advanced, next-week plan.</li>
            <li><strong>K · Project workbench</strong> — intent · milestones · decisions · notes · lessons; skills sidebar.</li>
            <li><strong>L · Todo detail</strong> — modal: sub-tasks, linked sessions, journal, promote to feature/project/lesson.</li>
            <li><strong>M · Skills library</strong> — browse / install / bind. Toggles to auto-load on session start.</li>
            <li><strong>O · Start session dispatcher</strong> — prompt + tool + model + skills + context + budget caps.</li>
            <li><strong>N · Settings</strong> — 7-theme picker, quick toggles, paths, model rates, integrations.</li>
            <li><strong>PRD</strong> — this document.</li>
          </ul>
          <p style={{ marginTop: '0.6rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Routing: <code>/</code> → E (default). <code>/c/&lt;id&gt;</code> for everything else. <code>/c/k/:projectId</code>, <code>/c/g/:sessionId</code>, <code>/c/l/:workItemId</code> for deep-links. ConceptSwitcher (top-right) flips between them.
          </p>
        </PrdSection>

        <PrdSection num="08" title="Tech sketch (stash v0.2)">
          <ul className="prd-bullets">
            <li><strong>Server</strong>: Bun + Hono + <code>bun:sqlite</code> on <code>:4174</code>. Domains today: work-item, area, work-item-session, evidence. Phase 3 adds: skills, project-knowledge, analytics-burn, analytics-weekly.</li>
            <li><strong>Adapters</strong>: claude-code (<code>~/.claude/projects/*</code> jsonl tail), codex (<code>~/.codex/sessions/*</code>).</li>
            <li><strong>Client</strong>: React 18 + Vite + TypeScript + Tailwind. CSS-var-driven theming (7 themes), workbench design template.</li>
            <li><strong>Tests</strong>: bun-test (domain unit + web int), vitest (client unit), playwright (E2E golden paths).</li>
            <li><strong>Local-only</strong>. No cloud sync, no auth, no multi-user.</li>
          </ul>
        </PrdSection>

        <PrdSection num="09" title="Decisions locked (SPEC §8)">
          <ul className="prd-bullets">
            <li><strong>Areas ≡ Projects</strong>: keep <code>areas</code> table, alias as <code>projectId</code> in API/UI.</li>
            <li><strong>Weekly narrative</strong>: deterministic templates in v0.2; LLM call deferred to v0.3.</li>
            <li><strong>Skills</strong>: local SQLite only; no external registry sync in v0.2.</li>
            <li><strong>Cost rates</strong>: hardcoded defaults with user-editable overrides via Concept N.</li>
          </ul>
        </PrdSection>

        <PrdSection num="10" title="Open questions">
          <ul className="prd-bullets">
            <li>Features as manual sub-tasks or auto-derived from todo clusters?</li>
            <li>Dashboard read-only vs. start-session-from-O? (currently leaning on O)</li>
            <li>Empty state when no projects are tracked yet — explicit onboarding or just an empty wall?</li>
            <li>Wire the workbench daemon to a stash CLI (<code>stash tail</code>, <code>stash new ...</code>)?</li>
          </ul>
        </PrdSection>

        <div style={{ marginTop: '2.5rem', padding: '1rem 1.25rem', background: 'var(--bg-glass)', border: '1px dashed var(--border-glow)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--neon-cyan)' }}>$</span> <span style={{ color: 'var(--neon-green)' }}>bun run server:dev</span>  <span style={{ color: 'var(--text-muted)' }}># :4174</span><br />
          <span style={{ color: 'var(--neon-cyan)' }}>$</span> <span style={{ color: 'var(--neon-green)' }}>bun run client:dev</span>  <span style={{ color: 'var(--text-muted)' }}># :5173 → workbench at /</span><br />
          <span style={{ color: 'var(--neon-cyan)' }}>$</span> <span style={{ color: 'var(--neon-green)' }}>bun run test:all</span>
        </div>
      </div>
      <style>{prdStyles}</style>
    </div>
  );
}

function PrdSection({ num, title, children }: { num: string; title: string; children: ReactNode }) {
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

function Goal({ n, title, body }: { n: string; title: string; body: string }) {
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

function Story({ id, actor, verb, want }: { id: string; actor: string; verb: string; want: string }) {
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
