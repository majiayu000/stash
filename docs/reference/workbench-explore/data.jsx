// Shared mock data for the AI workbench prototype.
// Projects, sessions (Claude Code + Codex), todos, stats.

window.AppData = (() => {
  const now = Date.now();
  const mins = (n) => now - n * 60 * 1000;
  const hrs = (n) => now - n * 60 * 60 * 1000;

  const projects = [
    {
      id: 'aurora',
      name: 'aurora-api',
      emoji: '🌌',
      branch: 'feat/auth-flow',
      progress: 72,
      status: 'active',
      doing: 'wiring OAuth callback to session store',
      features: [
        { name: 'OAuth flow', progress: 90, status: 'almost' },
        { name: 'Session store', progress: 60, status: 'wip' },
        { name: 'Rate limiter', progress: 30, status: 'wip' },
        { name: 'Audit log', progress: 0, status: 'todo' },
      ],
      todoCount: 7,
      todoDone: 12,
      sessions: 14,
      tokens24h: 184_320,
      cost24h: 2.41,
      lastModel: 'sonnet-4.5',
      lastTouched: mins(3),
    },
    {
      id: 'pixel',
      name: 'pixel-studio',
      emoji: '🎨',
      branch: 'main',
      progress: 41,
      status: 'active',
      doing: 'canvas hit-testing for layered nodes',
      features: [
        { name: 'Layer model', progress: 88, status: 'almost' },
        { name: 'Hit testing', progress: 45, status: 'wip' },
        { name: 'Export pipeline', progress: 20, status: 'wip' },
      ],
      todoCount: 5,
      todoDone: 9,
      sessions: 23,
      tokens24h: 96_540,
      cost24h: 1.32,
      lastModel: 'codex-1',
      lastTouched: mins(18),
    },
    {
      id: 'haiku-bot',
      name: 'haiku-bot',
      emoji: '🤖',
      branch: 'main',
      progress: 95,
      status: 'shipping',
      doing: 'final QA — prod deploy pending',
      features: [
        { name: 'Slack handler', progress: 100, status: 'done' },
        { name: 'Rate caps', progress: 100, status: 'done' },
        { name: 'Metrics dash', progress: 80, status: 'almost' },
      ],
      todoCount: 2,
      todoDone: 21,
      sessions: 41,
      tokens24h: 12_410,
      cost24h: 0.18,
      lastModel: 'haiku-4.5',
      lastTouched: hrs(2),
    },
    {
      id: 'terra',
      name: 'terra-cli',
      emoji: '🧭',
      branch: 'rewrite/rust',
      progress: 23,
      status: 'active',
      doing: 'porting parser from go to rust',
      features: [
        { name: 'Lexer port', progress: 60, status: 'wip' },
        { name: 'AST', progress: 25, status: 'wip' },
        { name: 'Codegen', progress: 0, status: 'todo' },
      ],
      todoCount: 11,
      todoDone: 4,
      sessions: 8,
      tokens24h: 64_200,
      cost24h: 0.94,
      lastModel: 'sonnet-4.5',
      lastTouched: mins(42),
    },
    {
      id: 'monolith',
      name: 'monolith-docs',
      emoji: '📚',
      branch: 'docs/v2',
      progress: 58,
      status: 'paused',
      doing: 'paused — waiting on design review',
      features: [
        { name: 'IA pass', progress: 100, status: 'done' },
        { name: 'API ref autogen', progress: 70, status: 'wip' },
        { name: 'Search index', progress: 10, status: 'wip' },
      ],
      todoCount: 4,
      todoDone: 7,
      sessions: 6,
      tokens24h: 0,
      cost24h: 0,
      lastModel: 'sonnet-4.5',
      lastTouched: hrs(28),
    },
    {
      id: 'spectre',
      name: 'spectre-sdk',
      emoji: '👻',
      branch: 'feat/typed-events',
      progress: 14,
      status: 'fresh',
      doing: 'scaffolding TypeScript types',
      features: [
        { name: 'Type generation', progress: 30, status: 'wip' },
        { name: 'Event bus', progress: 5, status: 'todo' },
        { name: 'Docs', progress: 0, status: 'todo' },
      ],
      todoCount: 9,
      todoDone: 1,
      sessions: 3,
      tokens24h: 22_180,
      cost24h: 0.31,
      lastModel: 'codex-1',
      lastTouched: mins(8),
    },
  ];

  const sessions = [
    { id: 's1', project: 'aurora', model: 'sonnet-4.5', tool: 'claude-code', state: 'live',
      title: 'Wire OAuth callback to session store',
      preview: '> reading src/auth/oauth.ts… found 3 call sites. proposing a Session interface that wraps the existing JWT helper…',
      tokens: 14_230, cost: 0.19, duration: 612, at: mins(0) },
    { id: 's2', project: 'spectre', model: 'codex-1', tool: 'codex', state: 'live',
      title: 'Scaffold typed event bus',
      preview: '$ codex generate types --src events/*.ts\n  ✓ inferred 14 event shapes\n  → writing dist/events.d.ts',
      tokens: 4_180, cost: 0.05, duration: 92, at: mins(1) },
    { id: 's3', project: 'pixel', model: 'codex-1', tool: 'codex', state: 'idle',
      title: 'Hit-test debugger overlay',
      preview: 'draws bounding boxes on canvas. press D to toggle. nodes outside camera frustum skipped.',
      tokens: 8_420, cost: 0.11, duration: 1_140, at: mins(18) },
    { id: 's4', project: 'terra', model: 'sonnet-4.5', tool: 'claude-code', state: 'done',
      title: 'Lexer: handle escaped quotes in raw strings',
      preview: 'patched scan_string() — now backtracks on \\\\ before \\". added 6 fixtures.',
      tokens: 21_640, cost: 0.28, duration: 2_180, at: mins(42) },
    { id: 's5', project: 'aurora', model: 'haiku-4.5', tool: 'claude-code', state: 'done',
      title: 'Audit log schema review',
      preview: 'looks consistent with existing event log. suggest adding partition key by tenant_id.',
      tokens: 3_100, cost: 0.02, duration: 240, at: hrs(1) },
    { id: 's6', project: 'haiku-bot', model: 'sonnet-4.5', tool: 'claude-code', state: 'done',
      title: 'Smoke test pre-deploy',
      preview: '14/14 passing. p95 latency 142ms. ready to ship.',
      tokens: 5_280, cost: 0.07, duration: 360, at: hrs(2) },
    { id: 's7', project: 'pixel', model: 'sonnet-4.5', tool: 'claude-code', state: 'error',
      title: 'Export pipeline benchmark',
      preview: 'crashed on layer #312 — recursive svg mask. need to bound depth.',
      tokens: 11_900, cost: 0.15, duration: 1_840, at: hrs(3) },
    { id: 's8', project: 'terra', model: 'codex-1', tool: 'codex', state: 'done',
      title: 'AST node visitor pattern',
      preview: 'generic Visitor<T> trait + impls for 9 node types. tests green.',
      tokens: 18_220, cost: 0.24, duration: 1_510, at: hrs(4) },
  ];

  const todos = [
    { id: 't1', text: 'finish OAuth callback edge cases', project: 'aurora', tags: ['#auth', '#bug'], done: false, priority: 'high', kind: 'task', due: 'today' },
    { id: 't2', text: 'add rate limiter to /chat endpoint', project: 'aurora', tags: ['#perf'], done: false, priority: 'med', kind: 'task', due: 'today' },
    { id: 't3', text: 'fix canvas hit-test off-by-one', project: 'pixel', tags: ['#bug'], done: false, priority: 'high', kind: 'task', due: 'today' },
    { id: 't4', text: 'write export pipeline benchmarks', project: 'pixel', tags: ['#perf', '#test'], done: false, priority: 'med', kind: 'task', due: 'this-week' },
    { id: 't5', text: 'ship haiku-bot v1.2 to prod', project: 'haiku-bot', tags: ['#release'], done: false, priority: 'high', kind: 'task', due: 'today' },
    { id: 't6', text: 'port lexer test fixtures from go', project: 'terra', tags: ['#rust'], done: false, priority: 'med', kind: 'task', due: 'this-week' },
    { id: 't7', text: 'design event bus interface', project: 'spectre', tags: ['#design'], done: false, priority: 'low', kind: 'task', due: 'this-week' },
    { id: 't8', text: 'reply to monolith design review thread', project: 'monolith', tags: ['#review'], done: false, priority: 'low', kind: 'task', due: 'today' },

    // Inbox — orphan ideas + tasks without a project
    { id: 'i1', text: 'try wasm + simd for the lexer hot loop', project: null, tags: ['#idea'], done: false, priority: 'low', kind: 'idea', due: 'someday' },
    { id: 'i2', text: 'blog post: "monitoring all your AI agents in one pane"', project: null, tags: ['#writing'], done: false, priority: 'low', kind: 'idea', due: 'someday' },
    { id: 'i3', text: 'investigate cloudflare workers for the API edge', project: null, tags: ['#research'], done: false, priority: 'med', kind: 'idea', due: 'this-week' },
    { id: 'i4', text: 'reply to email from sam re: contract scope', project: null, tags: ['#admin'], done: false, priority: 'high', kind: 'task', due: 'today' },
    { id: 'i5', text: 'side project idea — claude code session diff viewer', project: null, tags: ['#idea', '#side-project'], done: false, priority: 'low', kind: 'idea', due: 'someday' },
    { id: 'i6', text: 'try voice-to-todo capture via whisper', project: null, tags: ['#idea'], done: false, priority: 'low', kind: 'idea', due: 'someday' },
    { id: 'i7', text: 'renew domain spectre-sdk.dev', project: null, tags: ['#admin'], done: false, priority: 'med', kind: 'task', due: 'this-week' },
    { id: 'i8', text: 'figure out why codex is slower on monorepo than single-pkg', project: null, tags: ['#research'], done: false, priority: 'low', kind: 'idea', due: 'someday' },

    // done
    { id: 't9', text: 'audit log schema — partition by tenant', project: 'aurora', tags: ['#schema'], done: true, priority: 'med', kind: 'task' },
    { id: 't10', text: 'layer model: z-order persistence', project: 'pixel', tags: ['#bug'], done: true, priority: 'med', kind: 'task' },
    { id: 't11', text: 'haiku-bot rate caps PR', project: 'haiku-bot', tags: ['#release'], done: true, priority: 'high', kind: 'task' },
  ];

  const stats = {
    activeSessions: sessions.filter(s => s.state === 'live').length,
    totalTokens24h: projects.reduce((a, p) => a + p.tokens24h, 0),
    totalCost24h: projects.reduce((a, p) => a + p.cost24h, 0),
    projects: projects.length,
    todosOpen: todos.filter(t => !t.done).length,
    todosDone: todos.filter(t => t.done).length,
  };

  const modelMix = [
    { model: 'sonnet-4.5', pct: 58, color: 'var(--neon-cyan)' },
    { model: 'codex-1',    pct: 26, color: 'var(--neon-purple)' },
    { model: 'haiku-4.5',  pct: 16, color: 'var(--neon-green)' },
  ];

  const tokenSpark = [42, 68, 51, 90, 74, 112, 88, 130, 124, 158, 142, 184];

  // ─── Per-project knowledge: intent, milestones, decisions, lessons ───
  const projectKnowledge = {
    aurora: {
      intent: 'A multi-tenant auth + session API that backends every internal tool. Success looks like: zero auth incidents in 90 days, sub-100ms p95 callback latency, drop-in JWT helper that other teams can use without reading docs.',
      milestones: [
        { id: 'm0', name: 'v0.1 · auth skeleton',     status: 'done',     date: 'Oct 12', progress: 100 },
        { id: 'm1', name: 'v0.2 · OAuth + sessions',  status: 'active',   date: 'Nov 15', progress: 72 },
        { id: 'm2', name: 'v0.3 · rate-limit + audit', status: 'planned',  date: 'Dec 1',  progress: 18 },
        { id: 'm3', name: 'v1.0 · public release',    status: 'future',   date: 'Q1 2026', progress: 0  },
      ],
      decisions: [
        { id: 'd1', date: 'Nov 8',  title: 'Sessions are server-side, JWT is bearer only',
          body: 'After 2 sessions debating, decided: JWT carries identity only, session is server-side row with TTL. Lets us revoke without rotation.',
          tags: ['auth','architecture'], session: 's5' },
        { id: 'd2', date: 'Nov 5',  title: 'Partition audit log by tenant_id',
          body: 'Queries are tenant-scoped 99% of the time. Partition key tenant_id, sort by ts desc. Pruning gets cheap.',
          tags: ['schema','audit'], session: 's5' },
        { id: 'd3', date: 'Nov 2',  title: 'Use crypto.randomUUID() for session IDs',
          body: 'NOT sequential. ULIDs were tempting for sortability but the timing leak risk isn\'t worth it.',
          tags: ['security'], session: null },
        { id: 'd4', date: 'Oct 28', title: 'Rate limit is per-tenant + per-user, not per-IP',
          body: 'Behind a CDN IP is unreliable. Token bucket in redis, key = (tenant, user, route_group).',
          tags: ['perf','rate-limit'], session: null },
      ],
      notes: `# aurora-api scratchpad\n\n## stack\n- runtime: bun (drop-in faster than node for this)\n- db: postgres 16 + drizzle\n- session store: redis + ttl\n- jwt: jose (not jsonwebtoken — has esm + supports edge)\n\n## conventions\n- handlers return Response, not (req, res)\n- every route has a \`route.ts\` + \`route.test.ts\` next to it\n- errors throw HttpError(code, message), caught in middleware\n\n## open questions\n- do we need refresh tokens or just bump TTL on activity?\n- audit log: synchronous insert or queue?\n- multi-region — single redis or per-region?`,
      lessons: [
        { id: 'l1', title: 'Bun drops node\'s crypto.randomUUID 3x slower in cold start',
          body: 'Pre-warm with a throwaway call at boot. Confirmed via flamegraph.',
          tags: ['bun','perf','gotcha'], cross: false },
        { id: 'l2', title: 'JWT iat in seconds, but JS Date is ms',
          body: 'Wasted 40min on a "token expired" loop. Always Math.floor(Date.now()/1000) for jwt fields.',
          tags: ['jwt','gotcha'], cross: true },
        { id: 'l3', title: 'redis SETNX is the cheapest lock primitive',
          body: 'For idempotency keys. Don\'t reach for redlock unless you actually need cross-key atomicity.',
          tags: ['redis','perf'], cross: true },
        { id: 'l4', title: 'drizzle migrations don\'t auto-create extensions',
          body: 'Add a 000_extensions.sql with CREATE EXTENSION IF NOT EXISTS pgcrypto; before everything else.',
          tags: ['drizzle','gotcha'], cross: true },
      ],
    },
  };

  // ─── Skills (Claude Code skills) ──────────────────────────────────────
  const skills = [
    { id: 'test-runner',     name: 'test-runner',    emoji: '🧪', desc: 'runs tests, parses failures, suggests minimal fixes',          source: 'official', stars: 18420, official: true,  installed: true },
    { id: 'schema-migration', name: 'schema-migration', emoji: '🗃️', desc: 'safe drizzle/prisma migrations w/ rollback + dry-run',         source: 'official', stars: 9_310, official: true,  installed: true },
    { id: 'commit-doctor',   name: 'commit-doctor',  emoji: '🩺', desc: 'crafts conventional commits from staged diff',                source: 'majiayu',  stars: 4_120, official: false, installed: true },
    { id: 'pr-summarizer',   name: 'pr-summarizer',  emoji: '📑', desc: 'turns a branch into a clean PR description with screenshots', source: 'official', stars: 12_840, official: true, installed: true },
    { id: 'oauth-toolkit',   name: 'oauth-toolkit',  emoji: '🔐', desc: 'scaffold OAuth flows w/ provider quirks baked in',            source: 'community', stars: 2_840, official: false, installed: true },
    { id: 'rate-limit-helper',name: 'rate-limit-helper', emoji: '🚦', desc: 'design token-bucket / sliding-window with redis',           source: 'community', stars: 1_220, official: false, installed: false },
    { id: 'lexer-bench',     name: 'lexer-bench',    emoji: '⚡', desc: 'micro-benchmarks for parsers + lexer hot loops',              source: 'community', stars: 612,   official: false, installed: false },
    { id: 'wasm-port',       name: 'wasm-port',      emoji: '🦀', desc: 'port hot loops to wasm via rust',                             source: 'experimental', stars: 480, official: false, installed: false },
    { id: 'changelog-bot',   name: 'changelog-bot',  emoji: '📰', desc: 'generates changelogs from commits + PRs',                     source: 'official', stars: 6_700, official: true,  installed: true },
    { id: 'event-typegen',   name: 'event-typegen',  emoji: '⚙️', desc: 'infer event types from runtime samples',                      source: 'community', stars: 920,   official: false, installed: true },
  ];

  // Per-project skill bindings (which skills are active on which project)
  const projectSkills = {
    aurora:    ['test-runner', 'schema-migration', 'oauth-toolkit', 'commit-doctor', 'pr-summarizer'],
    pixel:     ['test-runner', 'commit-doctor', 'pr-summarizer'],
    'haiku-bot': ['test-runner', 'changelog-bot', 'commit-doctor', 'pr-summarizer'],
    terra:     ['test-runner', 'lexer-bench', 'commit-doctor'],
    monolith:  ['pr-summarizer'],
    spectre:   ['event-typegen', 'test-runner', 'commit-doctor'],
  };

  return { projects, sessions, todos, stats, modelMix, tokenSpark, projectKnowledge, skills, projectSkills };
})();

// ─── helpers ──────────────────────────────────────────────────────────────
window.fmt = {
  k: (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n),
  cost: (n) => '$' + n.toFixed(2),
  ago: (t) => {
    const d = Math.max(0, Date.now() - t);
    if (d < 60_000) return 'just now';
    if (d < 3_600_000) return Math.round(d / 60_000) + 'm ago';
    if (d < 86_400_000) return Math.round(d / 3_600_000) + 'h ago';
    return Math.round(d / 86_400_000) + 'd ago';
  },
  dur: (s) => {
    if (s < 60) return s + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    return (s / 3600).toFixed(1) + 'h';
  },
};
