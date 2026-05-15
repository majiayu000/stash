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
import { WorkItemService } from '../src/domain/work-item/service.js';

function isoDate(daysFromToday = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

const config = loadConfig();
const db = openDatabaseMigrated({ path: config.dbPath, inMemory: config.inMemoryDb });

const areas = new AreaService({ db, clock: systemClock });
const items = new WorkItemService({ db, clock: systemClock });

const { created } = areas.ensureDefaults();
process.stderr.write(`[seed] created ${created.length} default areas\n`);

const existing = items.list({ includeDropped: true });
if (existing.length > 0) {
  process.stderr.write(`[seed] ${existing.length} work items already exist — skipping seed.\n`);
  process.exit(0);
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
