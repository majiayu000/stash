#!/usr/bin/env bun
/**
 * Rich demo seed — drops a believable week-of-work into a stash DB so the
 * workbench has something to render on first open.
 *
 * Run:
 *   STASH_DB_PATH=/tmp/stash-rich.db bun run server/fixtures/seed-rich.ts
 *   STASH_DB_PATH=/tmp/stash-rich.db CLAUDE_ROOT=/tmp/stash-rich-claude \
 *     bun run server/fixtures/seed-rich.ts --with-sessions
 *
 * Idempotent (per-table): re-running over a populated DB skips any table
 * that already has rows.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { systemClock } from '../../shared/src/index.js';
import { loadConfig } from '../src/config.js';
import { openDatabaseMigrated } from '../src/db/connection.js';
import { AreaService } from '../src/domain/area/service.js';
import { ProjectKnowledgeService } from '../src/domain/project-knowledge/service.js';
import { SkillService } from '../src/domain/skill/service.js';
import { WorkItemService } from '../src/domain/work-item/service.js';

const NOW = new Date();
function daysAgo(n: number): string { const d = new Date(NOW); d.setDate(d.getDate() - n); return d.toISOString(); }
function daysAhead(n: number): string { const d = new Date(NOW); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function rel(n: number): string { return daysAhead(n); }

const config = loadConfig();
const db = openDatabaseMigrated({ path: config.dbPath, inMemory: config.inMemoryDb });
const clock = systemClock;
const areas = new AreaService({ db, clock });
const items = new WorkItemService({ db, clock });
const skills = new SkillService({ db, clock });
const kb = new ProjectKnowledgeService({ db, clock });

// ─── Areas / projects ──────────────────────────────────────────────────────

const PROJECTS = [
  { name: 'aurora',     reviewCadence: 'weekly'  as const, intent: 'Ship the OAuth + session-store rework so v1 can go behind a real login.' },
  { name: 'borealis',   reviewCadence: 'weekly'  as const, intent: 'Land the layered-canvas model and make hit-testing stable.' },
  { name: 'pixel',      reviewCadence: 'weekly'  as const, intent: 'Polish the editor: pan/zoom inertia, multi-export pipeline.' },
  { name: 'terra-cli',  reviewCadence: 'monthly' as const, intent: 'Port the lexer to the new visitor pattern and benchmark.' },
  { name: 'personal',   reviewCadence: 'ad_hoc'  as const, intent: 'Inbox + life admin. Nothing here should block real work.' },
  { name: 'writing',    reviewCadence: 'weekly'  as const, intent: 'Two posts a month. Drafts on Tuesdays, ship on Fridays.' },
];

const existingAreas = areas.list();
const areaByName = new Map(existingAreas.map((a) => [a.name, a]));
let createdAreas = 0;
for (const p of PROJECTS) {
  if (!areaByName.has(p.name)) {
    const a = areas.create({ name: p.name, reviewCadence: p.reviewCadence });
    areaByName.set(p.name, a);
    createdAreas++;
  }
}
process.stderr.write(`[seed-rich] areas: +${createdAreas} (total ${areaByName.size})\n`);

// ─── Skills ────────────────────────────────────────────────────────────────

const skillSet = [
  { id: 'rust-best-practices',  name: 'Rust Best Practices',  emoji: '🦀', stars: 412, installed: true,  description: 'Pragmatic Rust patterns.' },
  { id: 'react-best-practices', name: 'React Best Practices', emoji: '⚛️', stars: 287, installed: true,  description: 'Modern React + hooks.' },
  { id: 'security-review',      name: 'Security Review',      emoji: '🔒', stars: 156, installed: false, description: 'OWASP + threat modeling pass.' },
  { id: 'design-shotgun',       name: 'Design Shotgun',       emoji: '🎯', stars: 89,  installed: true,  description: 'Generate UI variants in parallel.' },
  { id: 'sql-tuning',           name: 'SQL Tuning',           emoji: '🗄', stars: 64,  installed: false, description: 'Explain plans and index advice.' },
  { id: 'a11y',                 name: 'Accessibility Audit',  emoji: '♿', stars: 42,  installed: true,  description: 'WCAG-aware UI review.' },
];
let createdSkills = 0;
for (const s of skillSet) {
  if (!skills.get(s.id)) { skills.create(s); createdSkills++; }
}
const aurora = areaByName.get('aurora')!;
const borealis = areaByName.get('borealis')!;
const pixel = areaByName.get('pixel')!;
const terra = areaByName.get('terra-cli')!;
const writing = areaByName.get('writing')!;
// Bind a sensible default set to each project
const BINDINGS: Array<[string, string[]]> = [
  [aurora.id,   ['security-review', 'react-best-practices', 'sql-tuning']],
  [borealis.id, ['react-best-practices', 'a11y', 'design-shotgun']],
  [pixel.id,    ['design-shotgun', 'a11y']],
  [terra.id,    ['rust-best-practices']],
];
for (const [projectId, ids] of BINDINGS) {
  try { skills.setProjectBindings(projectId, ids); } catch { /* idempotent */ }
}
process.stderr.write(`[seed-rich] skills: +${createdSkills}, bindings synced for ${BINDINGS.length} projects\n`);

// ─── Project knowledge: intent + milestones + decisions + notes + lessons ──

function seedProject(projectId: string, intent: string, opts: { milestones: { name: string; daysOut: number; status: 'planned' | 'wip' | 'done'; progress: number }[]; decisions: { title: string; body: string; tags: string[]; daysAgo: number }[]; notes: string; lessons: { title: string; body: string; tags: string[] }[] }) {
  if (!kb.getIntent(projectId)) kb.setIntent(projectId, intent);
  if (kb.listMilestones(projectId).length === 0) {
    for (const m of opts.milestones) {
      kb.createMilestone(projectId, { name: m.name, date: daysAhead(m.daysOut), status: m.status, progress: m.progress });
    }
  }
  if (kb.listDecisions(projectId).length === 0) {
    for (const d of opts.decisions) {
      kb.createDecision(projectId, { title: d.title, body: d.body, tags: d.tags, date: daysAhead(-d.daysAgo).slice(0, 10) });
    }
  }
  if (!kb.getNotes(projectId)) kb.setNotes(projectId, opts.notes);
  if (kb.listLessons({ projectId }).length === 0) {
    for (const l of opts.lessons) {
      kb.createLesson({ projectId, title: l.title, body: l.body, tags: l.tags });
    }
  }
}

seedProject(aurora.id, 'Ship the OAuth + session-store rework so v1 can go behind a real login.', {
  milestones: [
    { name: 'kickoff',     daysOut: -21, status: 'done',    progress: 100 },
    { name: 'oauth flow',  daysOut: -3,  status: 'wip',     progress: 70 },
    { name: 'mvp',         daysOut: 14,  status: 'planned', progress: 0 },
    { name: 'v1 cut',      daysOut: 45,  status: 'planned', progress: 0 },
  ],
  decisions: [
    { title: 'use bun:sqlite for the local store', body: 'No native deps, ships with bun, transactions reliable enough.', tags: ['stack', 'storage'], daysAgo: 18 },
    { title: 'JWT over server sessions',           body: 'Stateless, cheaper to scale, refresh-token rotation handled in middleware.', tags: ['security'], daysAgo: 9 },
  ],
  notes: `# scratch — aurora\n- next session: wire the analytics endpoint\n- 2 failing tests in session.test.ts → expected 401, got 200\n- audit log column needed before we ship\n\n## decisions open\n- refresh-token rotation cadence\n`,
  lessons: [
    { title: 'Mock+tag the swap path', body: 'Tag every mock with the phase that will replace it. Saves the "where was that TODO" pass.', tags: ['workflow'] },
  ],
});

seedProject(borealis.id, 'Land the layered-canvas model and make hit-testing stable.', {
  milestones: [
    { name: 'layer model',  daysOut: -1, status: 'wip',     progress: 88 },
    { name: 'hit testing',  daysOut: 6,  status: 'wip',     progress: 45 },
    { name: 'beta',         daysOut: 30, status: 'planned', progress: 0 },
  ],
  decisions: [
    { title: 'canvas event delegation via spatial index', body: 'R-tree, not flat array. O(log n) hit-tests at 5k objects.', tags: ['perf'], daysAgo: 6 },
  ],
  notes: `# borealis\n- z-order persistence is in\n- pan/zoom feels great with inertia\n`,
  lessons: [],
});

seedProject(terra.id, 'Port the lexer to the new visitor pattern and benchmark.', {
  milestones: [{ name: 'lexer port', daysOut: 7, status: 'wip', progress: 60 }],
  decisions: [],
  notes: 'visitor pattern scaffolding done. fixtures next.',
  lessons: [],
});

process.stderr.write(`[seed-rich] knowledge seeded for 3 projects\n`);

// ─── Work items ────────────────────────────────────────────────────────────

const exists = items.list({ includeDropped: true }).length;
if (exists > 0) {
  process.stderr.write(`[seed-rich] ${exists} work items already exist — skipping work-item seed.\n`);
} else {
  type Seed = {
    title: string;
    projectName?: string;
    kind: 'task' | 'idea' | 'feature' | 'bug' | 'chore' | 'research';
    status: 'inbox' | 'planned' | 'active' | 'waiting' | 'someday' | 'done';
    priority: 'p0' | 'p1' | 'p2' | 'p3';
    labels?: string[];
    scheduledFor?: string;
    dueAt?: string;
    todayPinned?: boolean;
    description?: string;
    recurrence?: 'daily' | 'weekdays' | 'weekly' | 'after_completion_1d' | 'after_completion_7d';
  };

  const seeds: Seed[] = [
    // Today — actionable
    { title: 'fix two failing auth tests', projectName: 'aurora', kind: 'bug', status: 'active', priority: 'p0', labels: ['auth'], scheduledFor: rel(0), todayPinned: true, description: 'session.test.ts expects 401 after expiry; sees 200. Likely TTL check inverted.' },
    { title: 'resume hit-testing branch',  projectName: 'borealis', kind: 'feature', status: 'active', priority: 'p1', labels: ['canvas'], scheduledFor: rel(0), todayPinned: true },
    { title: 'reply to sam re contract',   kind: 'task', status: 'planned', priority: 'p1', labels: ['admin'], scheduledFor: rel(0), todayPinned: true },
    // This week — planned
    { title: 'audit-log column migration', projectName: 'aurora', kind: 'feature', status: 'planned', priority: 'p1', labels: ['db', 'auth'], scheduledFor: rel(1), dueAt: daysAhead(3) + 'T17:00:00.000Z' },
    { title: 'metrics dash skeleton',      projectName: 'aurora', kind: 'task', status: 'planned', priority: 'p2', labels: ['ops'], scheduledFor: rel(2) },
    { title: 'port lexer fixtures',        projectName: 'terra-cli', kind: 'task', status: 'planned', priority: 'p2', scheduledFor: rel(2), labels: ['lexer'] },
    { title: 'pan/zoom inertia review',    projectName: 'pixel', kind: 'task', status: 'planned', priority: 'p2', scheduledFor: rel(3), labels: ['polish'] },
    { title: 'draft "stash v0.6" post',    projectName: 'writing', kind: 'task', status: 'planned', priority: 'p2', scheduledFor: rel(4), labels: ['blog'] },
    // Recurring habit
    { title: 'weekly review',              kind: 'chore', status: 'planned', priority: 'p2', labels: ['review'], scheduledFor: rel(2), recurrence: 'weekly' },
    { title: 'daily standup notes',        kind: 'chore', status: 'planned', priority: 'p3', labels: ['admin'], scheduledFor: rel(0), recurrence: 'weekdays' },
    { title: 'water plants',               projectName: 'personal', kind: 'chore', status: 'planned', priority: 'p3', scheduledFor: rel(0), recurrence: 'after_completion_7d' },
    // Inbox — raw ideas
    { title: 'voice-to-todo via Whisper',  kind: 'idea', status: 'inbox', priority: 'p2', labels: ['feature'] },
    { title: 'promote idea → feature pipeline', kind: 'idea', status: 'inbox', priority: 'p2' },
    { title: 'use Tailscale for multi-device sync?', kind: 'research', status: 'inbox', priority: 'p2', labels: ['infra'] },
    { title: 'investigate: cron jobs in bun',  kind: 'research', status: 'inbox', priority: 'p3' },
    // Overdue
    { title: 'renew SSL cert',             projectName: 'aurora', kind: 'chore', status: 'planned', priority: 'p1', dueAt: daysAhead(-1) + 'T17:00:00.000Z', labels: ['ops'] },
    { title: 'review last Q invoices',     projectName: 'personal', kind: 'chore', status: 'planned', priority: 'p2', dueAt: daysAhead(-3) + 'T17:00:00.000Z' },
    // Someday — parking lot
    { title: 'rewrite the CLI in Rust',    projectName: 'terra-cli', kind: 'idea', status: 'someday', priority: 'p3' },
    { title: 'experiment: model-agnostic dispatch', kind: 'idea', status: 'someday', priority: 'p3' },
    // Done — last 5 days
    { title: 'rate caps PR',               projectName: 'aurora', kind: 'task', status: 'done', priority: 'p1', scheduledFor: rel(-1), labels: ['auth', 'ops'] },
    { title: 'slack handler v1.2',         projectName: 'aurora', kind: 'task', status: 'done', priority: 'p2', scheduledFor: rel(-2), labels: ['integrations'] },
    { title: 'changelog cut',              projectName: 'writing', kind: 'chore', status: 'done', priority: 'p2', scheduledFor: rel(-2) },
    { title: 'layer model production-ready', projectName: 'borealis', kind: 'feature', status: 'done', priority: 'p1', scheduledFor: rel(-3), labels: ['canvas'] },
    { title: 'smoke test pre-deploy',      projectName: 'aurora', kind: 'chore', status: 'done', priority: 'p2', scheduledFor: rel(-4), labels: ['ops'] },
    { title: 'export pipeline @ 2x',       projectName: 'pixel', kind: 'feature', status: 'done', priority: 'p1', scheduledFor: rel(-4) },
    { title: 'z-order persistence',        projectName: 'borealis', kind: 'task', status: 'done', priority: 'p2', scheduledFor: rel(-5) },
    // Reminder example — fires in ~1 minute from seed
    { title: 'try the reminder fire',      kind: 'task', status: 'planned', priority: 'p3', description: 'should fire ~1 minute after seed-rich runs.' },
  ];

  function recurrenceJson(r: Seed['recurrence']) {
    switch (r) {
      case 'daily':                return { type: 'rrule' as const, freq: 'DAILY' as const,  interval: 1 };
      case 'weekdays':             return { type: 'rrule' as const, freq: 'WEEKLY' as const, interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] as const };
      case 'weekly':               return { type: 'rrule' as const, freq: 'WEEKLY' as const, interval: 1 };
      case 'after_completion_1d':  return { type: 'after_completion' as const, offsetDays: 1 };
      case 'after_completion_7d':  return { type: 'after_completion' as const, offsetDays: 7 };
      default:                     return undefined;
    }
  }

  let created = 0;
  for (const s of seeds) {
    const projectId = s.projectName ? areaByName.get(s.projectName)?.id : undefined;
    const reminderAt = s.title === 'try the reminder fire'
      ? new Date(Date.now() + 60_000).toISOString()
      : undefined;
    items.create({
      title: s.title,
      kind: s.kind,
      status: s.status,
      priority: s.priority,
      labels: s.labels ?? [],
      scheduledFor: s.scheduledFor,
      dueAt: s.dueAt,
      todayPinned: s.todayPinned,
      description: s.description,
      reminderAt,
      // @ts-expect-error — recurrence is well-typed at the API; we pass plain JSON-shape here
      recurrence: recurrenceJson(s.recurrence),
      projectId,
      areaId: projectId,
    });
    created++;
  }
  process.stderr.write(`[seed-rich] work items: +${created}\n`);
}

// ─── Optional: fake Claude JSONL for analytics ─────────────────────────────

if (process.argv.includes('--with-sessions')) {
  const claudeRoot = process.env.CLAUDE_ROOT ?? '/tmp/stash-rich-claude';
  const projectDir = join(claudeRoot, 'projects', '-Users-demo-aurora');
  mkdirSync(projectDir, { recursive: true });

  const sessionId = `sess-rich-${Date.now()}`;
  const lines = [
    { type: 'user',      sessionId, cwd: '/Users/demo/aurora', timestamp: daysAgo(0),  message: { role: 'user',      content: 'investigate the failing auth test' } },
    { type: 'ai-title',  sessionId, aiTitle: 'Auth session expiry race investigation' },
    { type: 'assistant', sessionId,                              timestamp: daysAgo(0), message: { role: 'assistant', content: 'Reading session.ts and oauth.ts to map the call path.', model: 'claude-sonnet-4-6', usage: { input_tokens: 1200, output_tokens: 180, cache_read_input_tokens: 4500 } } },
    { type: 'assistant', sessionId,                              timestamp: daysAgo(0), message: { role: 'assistant', content: [{ type: 'tool_use', name: 'read_file', input: { file_path: 'src/auth/session.ts' } }], model: 'claude-sonnet-4-6', usage: { input_tokens: 800, output_tokens: 90 } } },
    { type: 'assistant', sessionId,                              timestamp: daysAgo(0), message: { role: 'assistant', content: 'I decided to use a fresh JWT validator wrapper rather than patching the existing one.', model: 'claude-sonnet-4-6', usage: { input_tokens: 2200, output_tokens: 320 } } },
  ];
  const path = join(projectDir, `${sessionId}.jsonl`);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  process.stderr.write(`[seed-rich] wrote ${path} — set CLAUDE_ROOT=${claudeRoot} when running the server\n`);
}

process.stderr.write('[seed-rich] done.\n');
