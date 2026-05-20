import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createDatabaseBackup } from './backup.js';
import { listPendingMigrations, migrate } from './migrate.js';

export interface OpenDbOptions {
  path: string;
  inMemory?: boolean;
  backupBeforeMigrate?: boolean;
  backupDir?: string;
}

export function openDatabase(options: OpenDbOptions): Database {
  const path = options.inMemory ? ':memory:' : options.path;
  if (!options.inMemory) {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db = new Database(path, { create: true });
  // WAL improves single-process concurrency; safe to set every open.
  if (!options.inMemory) db.exec('pragma journal_mode = wal');
  db.exec('pragma foreign_keys = on');
  return db;
}

export function openDatabaseMigrated(options: OpenDbOptions): Database {
  const hadExistingDb = !options.inMemory && existsSync(options.path);
  const db = openDatabase(options);
  const shouldBackup = hadExistingDb && options.backupBeforeMigrate !== false;
  if (shouldBackup && listPendingMigrations(db).length > 0) {
    createDatabaseBackup(db, {
      dbPath: options.path,
      backupDir: options.backupDir,
      label: 'pre-migrate',
    });
  }
  migrate(db);
  return db;
}
