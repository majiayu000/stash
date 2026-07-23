import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { openDatabase } from './connection.js';
import { listAppliedMigrations, listMigrationFiles, migrate } from './migrate.js';
import { AreaService } from '../domain/area/service.js';
import { BudgetService } from '../domain/budget/service.js';
import { ProjectKnowledgeService } from '../domain/project-knowledge/service.js';
import { SkillService } from '../domain/skill/service.js';
import { WorkItemService } from '../domain/work-item/service.js';
import { WorkItemSessionService } from '../domain/work-item-session/service.js';
import { AiDraftService } from '../domain/ai-draft/service.js';

interface TableRow {
  name: string;
}

interface CountRow {
  c: number;
}

const MIGRATIONS_DIR = fileURLToPath(new URL('migrations', import.meta.url));

function tableNames(db: ReturnType<typeof openDatabase>): string[] {
  return db
    .query<TableRow, []>("select name from sqlite_master where type = 'table' order by name")
    .all()
    .map((r) => r.name);
}

describe('migrate', () => {
  test('runs all migrations against a fresh in-memory database', () => {
    const db = openDatabase({ path: ':memory:', inMemory: true });
    const result = migrate(db);

    expect(result.applied.length).toBeGreaterThanOrEqual(2);
    expect(result.applied).toEqual(expect.arrayContaining(['001_work_items.sql', '002_areas.sql']));

    const tables = tableNames(db);
    expect(tables).toEqual(expect.arrayContaining(['work_items', 'areas', '_migrations']));
  });

  test('is idempotent — second run applies no new migrations', () => {
    const db = openDatabase({ path: ':memory:', inMemory: true });
    migrate(db);
    const second = migrate(db);
    expect(second.applied).toEqual([]);
  });

  test('records applied migrations in _migrations table', () => {
    const db = openDatabase({ path: ':memory:', inMemory: true });
    migrate(db);
    const applied = listAppliedMigrations(db);
    expect(applied[0]).toBe('001_work_items.sql');
    expect(applied[1]).toBe('002_areas.sql');
    expect(applied).toContain('003_work_item_sessions.sql');
    // Migrations are sorted; assert lex order is preserved.
    expect([...applied].sort()).toEqual(applied);
  });

  test('creates a backup before applying pending migrations', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-migrate-backup-'));
    try {
      const dbPath = join(root, 'stash.db');
      const backupDir = join(root, 'backups');
      const v1Dir = join(root, 'v1');
      const v2Dir = join(root, 'v2');
      mkdirSync(v1Dir);
      mkdirSync(v2Dir);
      writeFileSync(join(v1Dir, '001_marker.sql'), 'create table marker (id text primary key);');
      writeFileSync(join(v2Dir, '001_marker.sql'), 'create table marker (id text primary key);');
      writeFileSync(join(v2Dir, '002_add_name.sql'), 'alter table marker add column name text;');

      const db = openDatabase({ path: dbPath });
      try {
        migrate(db, v1Dir);
        db.prepare('insert into marker(id) values (?)').run('before-migration');

        const result = migrate(db, v2Dir, {
          backup: {
            dbPath,
            backupDir,
            now: new Date('2026-05-20T00:00:00.000Z'),
          },
        });

        expect(result.applied).toEqual(['002_add_name.sql']);
        expect(result.backup?.path).toBe(join(backupDir, 'stash-backup-2026-05-20T00-00-00-000Z-migration.db'));
        expect(existsSync(result.backup!.path)).toBe(true);

        const backupDb = openDatabase({ path: result.backup!.path });
        try {
          const rows = backupDb.query<{ id: string }, []>('select id from marker').all();
          const columns = backupDb.query<{ name: string }, []>('pragma table_info(marker)').all();
          expect(rows.map((r) => r.id)).toEqual(['before-migration']);
          expect(columns.map((c) => c.name)).toEqual(['id']);
        } finally {
          backupDb.close();
        }
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('migrates a seeded non-empty database while preserving user data', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-seeded-migrate-'));
    try {
      const legacyDir = join(root, 'through-009');
      mkdirSync(legacyDir);
      for (const file of listMigrationFiles(MIGRATIONS_DIR)) {
        if (file <= '009_budgets.sql') {
          cpSync(join(MIGRATIONS_DIR, file), join(legacyDir, file));
        }
      }

      const db = openDatabase({ path: ':memory:', inMemory: true });
      migrate(db, legacyDir);
      seedLegacyDb(db);

      const result = migrate(db);
      expect(result.applied).toEqual([
        '010_drop_repeat_rule.sql',
        '011_area_emoji.sql',
        '012_agent_session_cache.sql',
        '013_dispatch_runs_and_decision_candidates.sql',
        '014_ai_draft_traceability.sql',
        '015_work_item_coach_messages_and_ai_writes.sql',
        '016_meeting_triage_sources.sql',
        '017_work_item_ai_writes_checklist_destination.sql',
        '018_work_item_coach_summary_destination.sql',
        '019_calendar_field_formats.sql',
      ]);
      const cacheTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'agent_session_cache'",
        )
        .get();
      expect(cacheTable?.name).toBe('agent_session_cache');
      const dispatchRunsTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'dispatch_runs'",
        )
        .get();
      expect(dispatchRunsTable?.name).toBe('dispatch_runs');
      const decisionCandidatesTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'decision_candidates'",
        )
        .get();
      expect(decisionCandidatesTable?.name).toBe('decision_candidates');
      const aiGenerationRunsTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'ai_generation_runs'",
        )
        .get();
      expect(aiGenerationRunsTable?.name).toBe('ai_generation_runs');
      const decisionDraftsTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'decision_drafts'",
        )
        .get();
      expect(decisionDraftsTable?.name).toBe('decision_drafts');
      const coachMessagesTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'work_item_coach_messages'",
        )
        .get();
      expect(coachMessagesTable?.name).toBe('work_item_coach_messages');
      const coachMessageColumns = db
        .query<{ name: string }, []>('pragma table_info(work_item_coach_messages)')
        .all()
        .map((column) => column.name);
      expect(coachMessageColumns).toContain('summary_destination');
      const aiWritesTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'work_item_ai_writes'",
        )
        .get();
      expect(aiWritesTable?.name).toBe('work_item_ai_writes');
      const aiWritesSql = db
        .query<{ sql: string }, []>(
          "select sql from sqlite_master where type = 'table' and name = 'work_item_ai_writes'",
        )
        .get();
      expect(aiWritesSql?.sql).toContain("'checklist'");
      const meetingSourcesTable = db
        .query<{ name: string }, []>(
          "select name from sqlite_master where type = 'table' and name = 'meeting_triage_sources'",
        )
        .get();
      expect(meetingSourcesTable?.name).toBe('meeting_triage_sources');

      const workItems = new WorkItemService({ db });
      const workItem = workItems.get('wi-auth');
      expect(workItem?.title).toBe('fix auth expiry');
      expect(workItem?.labels).toEqual(['auth', 'db']);
      expect(workItem?.todayPinned).toBe(true);

      const areas = new AreaService({ db });
      const area = areas.get('area-aurora');
      expect(area?.name).toBe('aurora');
      expect(area?.emoji).toBeUndefined();

      const skills = new SkillService({ db });
      expect(skills.get('security-review')?.installed).toBe(true);
      expect(skills.listBindingsForProject('area-aurora').map((b) => b.skillId)).toEqual(['security-review']);

      const knowledge = new ProjectKnowledgeService({ db });
      expect(knowledge.getIntent('area-aurora')?.text).toContain('Ship OAuth');
      expect(knowledge.listMilestones('area-aurora').map((m) => m.name)).toEqual(['mvp']);
      expect(knowledge.listDecisions('area-aurora').map((d) => d.title)).toEqual(['Use SQLite']);
      expect(knowledge.getNotes('area-aurora')?.markdown).toContain('migration safety');
      expect(knowledge.listLessons({ projectId: 'area-aurora' }).map((l) => l.title)).toEqual(['Back up before migrate']);

      const budgets = new BudgetService({ db });
      expect(budgets.list().map((b) => [b.scope, b.capUsd])).toEqual([['aurora', 25]]);

      const links = new WorkItemSessionService({ db });
      expect(links.forWorkItem('wi-auth').map((l) => `${l.provider}:${l.sessionId}`)).toEqual(['claude:sess-1']);

      expect(db.query<CountRow, []>('select count(*) as c from work_items').get()?.c).toBe(1);
      expect(db.query<CountRow, []>('select count(*) as c from project_skills').get()?.c).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('normalizes only exact UTC-midnight calendar fields in migration 019', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-calendar-migrate-'));
    try {
      const legacy_dir = join(root, 'through-018');
      mkdirSync(legacy_dir);
      for (const file of listMigrationFiles(MIGRATIONS_DIR)) {
        if (file <= '018_work_item_coach_summary_destination.sql') {
          cpSync(join(MIGRATIONS_DIR, file), join(legacy_dir, file));
        }
      }
      const db = openDatabase({ path: ':memory:', inMemory: true });
      migrate(db, legacy_dir);
      const clock = fixedClock('2026-05-14T10:00:00.000Z');
      const work_items = new WorkItemService({ db, clock });
      const item = work_items.create({
        title: 'legacy calendar fields',
        scheduledFor: '2026-05-15',
        dueAt: '2026-05-16',
        reviewAt: '2026-05-17',
        reminderAt: '2026-05-15T09:00:00.000Z',
        startAt: '2026-05-15T10:00:00.000Z',
        recurrence: { type: 'rrule', freq: 'DAILY', until: '2026-05-20' },
      });
      const drafts = new AiDraftService({ db, clock, workItems: work_items });
      const run = drafts.createRun({
        feature: 'manual_split',
        sourceKind: 'manual_split',
        provider: 'migration-test',
        promptHash: 'migration-test',
        status: 'succeeded',
      });
      const [draft] = drafts.createDrafts(run.id, [{
        sourceKind: 'manual_split',
        proposedTitle: 'legacy draft',
        proposedScheduledFor: '2026-05-18',
        proposedDueAt: '2026-05-19',
      }]);
      db.prepare(
        `update work_items
            set scheduled_for = ?, due_at = ?, review_at = ?, recurrence_json = ?
          where id = ?`,
      ).run(
        '2026-05-15T00:00:00.000Z',
        '2026-05-16T00:00:00.000Z',
        '2026-05-17T00:00:00.000Z',
        JSON.stringify({ type: 'rrule', freq: 'DAILY', until: '2026-05-20T00:00:00.000Z' }),
        item.id,
      );
      db.prepare(
        `update decision_drafts
            set proposed_scheduled_for = ?, proposed_due_at = ?
          where id = ?`,
      ).run('2026-05-18T00:00:00.000Z', '2026-05-19T00:00:00.000Z', draft!.id);

      expect(migrate(db).applied).toEqual(['019_calendar_field_formats.sql']);
      const migrated = work_items.get(item.id);
      expect(migrated?.scheduledFor).toBe('2026-05-15');
      expect(migrated?.dueAt).toBe('2026-05-16');
      expect(migrated?.reviewAt).toBe('2026-05-17');
      expect(migrated?.reminderAt).toBe('2026-05-15T09:00:00.000Z');
      expect(migrated?.recurrence?.until).toBe('2026-05-20');
      const migrated_draft = drafts.getDraft(draft!.id);
      expect(migrated_draft?.proposedScheduledFor).toBe('2026-05-18');
      expect(migrated_draft?.proposedDueAt).toBe('2026-05-19');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('blocks ambiguous calendar values with table, row, and field evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-calendar-block-'));
    try {
      const legacy_dir = join(root, 'through-018');
      mkdirSync(legacy_dir);
      for (const file of listMigrationFiles(MIGRATIONS_DIR)) {
        if (file <= '018_work_item_coach_summary_destination.sql') {
          cpSync(join(MIGRATIONS_DIR, file), join(legacy_dir, file));
        }
      }
      const db = openDatabase({ path: ':memory:', inMemory: true });
      migrate(db, legacy_dir);
      const work_items = new WorkItemService({ db });
      const item = work_items.create({ title: 'ambiguous date', scheduledFor: '2026-05-15' });
      db.prepare('update work_items set scheduled_for = ? where id = ?')
        .run('2026-05-15T12:00:00.000Z', item.id);

      expect(() => migrate(db)).toThrow(
        `work_items[${item.id}].scheduled_for has noncanonical date`,
      );
      expect(listAppliedMigrations(db)).not.toContain('019_calendar_field_formats.sql');
      const raw = db.query<{ scheduled_for: string }, [string]>(
        'select scheduled_for from work_items where id = ?',
      ).get(item.id);
      expect(raw?.scheduled_for).toBe('2026-05-15T12:00:00.000Z');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function seedLegacyDb(db: ReturnType<typeof openDatabase>): void {
  const now = '2026-05-20T00:00:00.000Z';
  db.prepare(
    `insert into areas(id, name, description, review_cadence, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?)`,
  ).run('area-aurora', 'aurora', 'Auth project', 'weekly', now, now);

  db.prepare(
    `insert into work_items(
      id, project_id, area_id, title, description, kind, status, priority,
      labels_json, checklist_json, links_json, today_pinned, recurrence_json,
      created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'wi-auth',
    'area-aurora',
    'area-aurora',
    'fix auth expiry',
    'Keep auth migration safe',
    'bug',
    'active',
    'p1',
    JSON.stringify(['auth', 'db']),
    JSON.stringify([{ id: 'check-1', text: 'verify migration', completed: false }]),
    JSON.stringify([{ label: 'issue', url: 'https://github.com/majiayu000/stash/issues/4' }]),
    1,
    JSON.stringify({ type: 'rrule', freq: 'WEEKLY', interval: 1 }),
    now,
    now,
  );

  db.prepare(
    `insert into work_item_sessions(work_item_id, provider, session_id, linked_at)
     values (?, ?, ?, ?)`,
  ).run('wi-auth', 'claude', 'sess-1', now);

  db.prepare(
    `insert into skills(id, name, emoji, description, source, stars, installed, version, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('security-review', 'Security Review', 'lock', 'Review auth/data flows', 'official', 156, 1, '1.0.0', now, now);

  db.prepare(
    `insert into project_skills(area_id, skill_id, enabled, bound_at)
     values (?, ?, ?, ?)`,
  ).run('area-aurora', 'security-review', 1, now);

  db.prepare('insert into project_intent(area_id, text, updated_at) values (?, ?, ?)').run(
    'area-aurora',
    'Ship OAuth safely',
    now,
  );
  db.prepare(
    `insert into milestones(id, area_id, name, date, status, progress, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('ms-1', 'area-aurora', 'mvp', '2026-06-01', 'wip', 60, now, now);
  db.prepare(
    `insert into decisions(id, area_id, date, title, body, tags, session_id, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('dec-1', 'area-aurora', '2026-05-20', 'Use SQLite', 'Local-first store', JSON.stringify(['db']), 'claude:sess-1', now, now);
  db.prepare('insert into project_notes(area_id, markdown, updated_at) values (?, ?, ?)').run(
    'area-aurora',
    '# migration safety\nBack up before changing schema.',
    now,
  );
  db.prepare(
    `insert into lessons(id, area_id, title, body, tags, cross, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('lesson-1', 'area-aurora', 'Back up before migrate', 'Run backup first.', JSON.stringify(['db']), 0, now, now);

  db.prepare(
    `insert into budgets(id, scope, cap_usd, period, notes, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run('budget-1', 'aurora', 25, 'week', 'Keep agent spend bounded', now, now);
}
