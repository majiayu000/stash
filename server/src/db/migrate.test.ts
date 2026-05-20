import { describe, expect, test } from 'bun:test';
import { openDatabase } from './connection.js';
import { listAppliedMigrations, migrate } from './migrate.js';

interface TableRow {
  name: string;
}

const seededTables = [
  'areas',
  'work_items',
  'work_item_sessions',
  'skills',
  'project_skills',
  'project_intent',
  'milestones',
  'decisions',
  'project_notes',
  'lessons',
  'budgets',
] as const;

type SeededTable = (typeof seededTables)[number];

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

  test('reruns safely against a seeded non-empty database', () => {
    const db = openDatabase({ path: ':memory:', inMemory: true });
    migrate(db);

    const now = '2026-05-20T00:00:00.000Z';
    db.exec(`
      insert into areas (id, name, description, review_cadence, created_at, updated_at, emoji)
      values ('area-1', 'aurora', 'demo area', 'weekly', '${now}', '${now}', 'A');

      insert into work_items (
        id, project_id, area_id, parent_id, title, description, kind, status,
        priority, source, confidence, assignee, labels_json, checklist_json,
        outcome, context, estimate_minutes, reminder_at, blocked_by, waiting_on,
        links_json, review_at, start_at, due_at, scheduled_for, created_at,
        updated_at, completed_at, today_pinned, sort_order, recurrence_json,
        raw_input
      )
      values (
        'item-1', 'area-1', 'area-1', null, 'seeded task', null, 'task', 'done',
        'p1', 'manual', 'explicit', 'human', '["seed"]', '[]',
        null, null, 30, null, null, null,
        '[]', null, null, null, '2026-05-20', '${now}',
        '${now}', '${now}', 1, 10.5, '{"freq":"daily"}',
        'seeded task #aurora'
      );

      insert into work_item_sessions (work_item_id, provider, session_id, linked_at)
      values ('item-1', 'codex', 'session-1', '${now}');

      insert into skills (id, name, emoji, description, source, stars, installed, version, created_at, updated_at)
      values ('skill-1', 'Seed Skill', 'S', 'seeded skill', 'community', 7, 1, '1.0.0', '${now}', '${now}');

      insert into project_skills (area_id, skill_id, enabled, bound_at)
      values ('area-1', 'skill-1', 1, '${now}');

      insert into project_intent (area_id, text, updated_at)
      values ('area-1', 'ship safely', '${now}');

      insert into milestones (id, area_id, name, date, status, progress, created_at, updated_at)
      values ('milestone-1', 'area-1', 'migration proof', '2026-05-21', 'wip', 40, '${now}', '${now}');

      insert into decisions (id, area_id, date, title, body, tags, session_id, created_at, updated_at)
      values ('decision-1', 'area-1', '2026-05-20', 'keep sqlite', 'local-first', '["db"]', 'codex:session-1', '${now}', '${now}');

      insert into project_notes (area_id, markdown, updated_at)
      values ('area-1', '# Notes', '${now}');

      insert into lessons (id, area_id, title, body, tags, cross, created_at, updated_at)
      values ('lesson-1', 'area-1', 'back up first', 'migration safety', '["db"]', 1, '${now}', '${now}');

      insert into budgets (id, scope, cap_usd, period, notes, created_at, updated_at)
      values ('budget-1', 'all', 100, 'month', 'demo', '${now}', '${now}');
    `);

    const second = migrate(db);
    expect(second.applied).toEqual([]);
    for (const table of seededTables) {
      expect(countRows(db, table)).toBe(1);
    }
  });
});

function countRows(db: ReturnType<typeof openDatabase>, table: SeededTable): number {
  return db.query<{ count: number }, []>(`select count(*) as count from ${table}`).get()?.count ?? 0;
}
