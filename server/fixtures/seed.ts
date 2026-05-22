#!/usr/bin/env bun
/**
 * Dev seed. Idempotent: if work_items already has rows, skip.
 *
 *   bun run server/fixtures/seed.ts
 *   STASH_DB_PATH=/tmp/stash-demo.db bun run server/fixtures/seed.ts
 */
import { systemClock } from '../../shared/src/index.js';
import { loadConfig } from '../src/config.js';
import { openDatabaseMigrated } from '../src/db/connection.js';
import { AreaService } from '../src/domain/area/service.js';
import { SkillService } from '../src/domain/skill/service.js';
import { WorkItemService } from '../src/domain/work-item/service.js';

function isoDate(daysFromToday = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

const config = loadConfig();
const db = openDatabaseMigrated({
  path: config.dbPath,
  inMemory: config.inMemoryDb,
  backupDir: config.backupDir,
});

const areas = new AreaService({ db, clock: systemClock });
const items = new WorkItemService({ db, clock: systemClock });

const { created } = areas.ensureDefaults();
process.stderr.write(`[seed] created ${created.length} default areas\n`);

const existing = items.list({ includeDropped: true });
const skipWorkItems = existing.length > 0;
if (skipWorkItems) {
  process.stderr.write(`[seed] ${existing.length} work items already exist — skipping work-item seed.\n`);
}

const areaMap = new Map(areas.list().map((a) => [a.name, a.id]));

const samples = [
  {
    title: 'Design the basic Todo sidebar flow',
    kind: 'feature' as const,
    status: 'active' as const,
    priority: 'p1' as const,
    areaName: 'AI tooling',
    scheduledFor: isoDate(0),
    labels: ['design', 'mvp'],
  },
  {
    title: 'Capture random idea: project does not need to be chosen',
    kind: 'idea' as const,
    status: 'inbox' as const,
    priority: 'p2' as const,
    areaName: 'Personal admin',
  },
  {
    title: 'PDF citation highlight visual QA',
    kind: 'task' as const,
    status: 'waiting' as const,
    priority: 'p1' as const,
    areaName: 'OM demo',
    scheduledFor: isoDate(0),
    labels: ['qa', 'pdf'],
    waitingOn: 'visual approval',
  },
  {
    title: 'Compare Things inbox and deadline behavior',
    kind: 'research' as const,
    status: 'someday' as const,
    priority: 'p3' as const,
    areaName: 'Learning',
  },
  {
    title: 'Collect SLS raw IDs for orphan billing proof',
    kind: 'bug' as const,
    status: 'blocked' as const,
    priority: 'p0' as const,
    areaName: 'AtlasCloud infra',
    scheduledFor: isoDate(0),
    blockedBy: 'raw logstore IDs',
  },
  {
    title: 'Add Codex session adapter',
    kind: 'feature' as const,
    status: 'planned' as const,
    priority: 'p1' as const,
    areaName: 'AI tooling',
    scheduledFor: isoDate(2),
  },
  {
    title: 'Try a weekly idea review routine',
    kind: 'idea' as const,
    status: 'someday' as const,
    priority: 'p3' as const,
    areaName: 'Personal admin',
  },
];

if (!skipWorkItems) {
  for (const s of samples) {
    items.create({
      title: s.title,
      kind: s.kind,
      status: s.status,
      priority: s.priority,
      areaId: areaMap.get(s.areaName),
      scheduledFor: s.scheduledFor,
      labels: s.labels,
      waitingOn: s.waitingOn,
      blockedBy: s.blockedBy,
    });
  }
  process.stderr.write(`[seed] inserted ${samples.length} work items at ${config.dbPath}\n`);
}

// ─── Skills seed ──────────────────────────────────────────────────────────
const skills = new SkillService({ db, clock: systemClock });
const seedSkills = [
  { id: 'rust-best-practices', name: 'Rust Best Practices', emoji: '🦀', source: 'official'  as const, stars: 412, installed: true,  description: 'Microsoft pragmatic Rust guidelines' },
  { id: 'react-best-practices', name: 'React Best Practices', emoji: '⚛️', source: 'official'  as const, stars: 287, installed: true,  description: 'Modern React patterns + hooks' },
  { id: 'security-review',     name: 'Security Review',       emoji: '🔒', source: 'official'  as const, stars: 156, installed: false, description: 'OWASP + threat modeling pass' },
  { id: 'design-shotgun',      name: 'Design Shotgun',        emoji: '🎯', source: 'community' as const, stars: 89,  installed: true,  description: 'Generate UI variants in parallel' },
  { id: 'codex-cli',           name: 'Codex CLI',             emoji: '$',  source: 'community' as const, stars: 64,  installed: false, description: 'OpenAI Codex CLI wrapper' },
  { id: 'investigate',         name: 'Investigate',           emoji: '🔍', source: 'community' as const, stars: 51,  installed: true,  description: 'Root-cause analysis loop' },
];

let createdSkills = 0;
for (const s of seedSkills) {
  if (!skills.get(s.id)) {
    skills.create(s);
    createdSkills++;
  }
}
process.stderr.write(`[seed] created ${createdSkills} skills (${seedSkills.length} total)\n`);

// Bind a couple of installed skills to the first area so Concept M / K have content.
const firstArea = areas.list()[0];
if (firstArea && skills.listBindingsForProject(firstArea.id).length === 0) {
  const installedIds = seedSkills.filter((s) => s.installed).map((s) => s.id).slice(0, 3);
  skills.setProjectBindings(firstArea.id, installedIds);
  process.stderr.write(`[seed] bound ${installedIds.length} skills to area "${firstArea.name}"\n`);
}
