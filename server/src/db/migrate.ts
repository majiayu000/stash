import type { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const MIGRATIONS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'migrations');

export interface MigrationRow {
  id: string;
  applied_at: string;
}

export function listMigrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function ensureMigrationsTable(db: Database): void {
  db.exec(`
    create table if not exists _migrations (
      id text primary key,
      applied_at text not null
    )
  `);
}

export function listAppliedMigrations(db: Database): string[] {
  const rows = db.query<MigrationRow, []>('select id, applied_at from _migrations order by id').all();
  return rows.map((r) => r.id);
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: string[];
}

export function migrate(db: Database, dir: string = MIGRATIONS_DIR): MigrateResult {
  ensureMigrationsTable(db);
  const files = listMigrationFiles(dir);
  const applied = new Set(listAppliedMigrations(db));
  const newly: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('insert into _migrations(id, applied_at) values (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
    newly.push(file);
  }

  return {
    applied: newly,
    alreadyApplied: [...applied],
  };
}
