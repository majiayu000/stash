import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { migrate } from './migrate.js';

export interface OpenDbOptions {
  path: string;
  inMemory?: boolean;
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
  const existedBeforeOpen = !options.inMemory && existsSync(options.path);
  const db = openDatabase(options);
  migrate(
    db,
    undefined,
    existedBeforeOpen ? { backup: { dbPath: options.path, backupDir: options.backupDir } } : {},
  );
  return db;
}
