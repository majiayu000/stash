import { describe, expect, test } from 'bun:test';
import { openDatabase } from './connection.js';
import { listAppliedMigrations, migrate } from './migrate.js';

interface TableRow {
  name: string;
}

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
});
