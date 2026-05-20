import type { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { backupDatabase, type BackupDatabaseResult } from './backup.js';

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
  backup?: BackupDatabaseResult;
}

export interface MigrateOptions {
  backup?: {
    dbPath: string;
    backupDir?: string;
    now?: Date;
  };
}

export function migrate(db: Database, dir: string = MIGRATIONS_DIR, options: MigrateOptions = {}): MigrateResult {
  ensureMigrationsTable(db);
  const files = listMigrationFiles(dir);
  const applied = new Set(listAppliedMigrations(db));
  const pending = files.filter((file) => !applied.has(file));
  const newly: string[] = [];
  const backup = pending.length > 0 && options.backup
    ? backupDatabase(db, { ...options.backup, reason: 'migration' })
    : undefined;

  for (const file of pending) {
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
    backup,
  };
}
