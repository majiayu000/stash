import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, copyFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

export interface DatabaseBackupOptions {
  dbPath: string;
  backupDir?: string;
  now?: () => Date;
  label?: string;
}

export function defaultBackupDir(dbPath: string): string {
  return join(dirname(dbPath), 'backups');
}

export function createDatabaseBackup(db: Database, options: DatabaseBackupOptions): string {
  const backupDir = options.backupDir ?? defaultBackupDir(options.dbPath);
  mkdirSync(backupDir, { recursive: true });

  const stamp = (options.now ?? (() => new Date()))()
    .toISOString()
    .replace(/[:.]/g, '-');
  const label = options.label ? `.${options.label.replace(/[^a-zA-Z0-9_-]/g, '-')}` : '';
  const backupPath = join(backupDir, `${basename(options.dbPath)}.${stamp}${label}.bak`);

  writeFileSync(backupPath, db.serialize());
  return backupPath;
}

export interface RestoreDatabaseOptions {
  backupPath: string;
  dbPath: string;
}

export function restoreDatabaseFile(options: RestoreDatabaseOptions): void {
  const backupPath = resolve(options.backupPath);
  if (!existsSync(backupPath)) {
    throw new Error(`backup file does not exist: ${backupPath}`);
  }

  mkdirSync(dirname(options.dbPath), { recursive: true });
  copyFileSync(backupPath, options.dbPath);
  removeIfExists(`${options.dbPath}-wal`);
  removeIfExists(`${options.dbPath}-shm`);
}

function removeIfExists(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}
