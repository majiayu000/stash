import { Database } from 'bun:sqlite';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';

export interface BackupDatabaseOptions {
  dbPath: string;
  backupDir?: string;
  now?: Date;
  reason?: string;
}

export interface BackupDatabaseResult {
  path: string;
  bytes: number;
}

export interface RestoreDatabaseOptions {
  backupPath: string;
  dbPath: string;
  backupDir?: string;
  now?: Date;
}

export interface RestoreDatabaseResult {
  restoredPath: string;
  sourceBackupPath: string;
  preRestoreBackupPath?: string;
}

interface QuickCheckRow {
  quick_check: string;
}

export function defaultBackupDir(dbPath: string): string {
  assertOnDiskPath(dbPath, 'database path');
  return join(dirname(resolve(dbPath)), 'backups');
}

export function backupDatabase(db: Database, options: BackupDatabaseOptions): BackupDatabaseResult {
  assertOnDiskPath(options.dbPath, 'database path');
  const backupDir = options.backupDir ? resolve(options.backupDir) : defaultBackupDir(options.dbPath);
  mkdirSync(backupDir, { recursive: true });

  const backupPath = uniqueBackupPath(backupDir, options.now ?? new Date(), options.reason);
  db.prepare('vacuum main into ?').run(backupPath);

  const bytes = statSync(backupPath).size;
  if (bytes <= 0) {
    throw new Error(`backup ${backupPath} is empty`);
  }

  return { path: backupPath, bytes };
}

export function restoreDatabaseFromBackup(options: RestoreDatabaseOptions): RestoreDatabaseResult {
  assertOnDiskPath(options.dbPath, 'database path');
  assertOnDiskPath(options.backupPath, 'backup path');

  const sourceBackupPath = resolve(options.backupPath);
  const restoredPath = resolve(options.dbPath);
  if (!existsSync(sourceBackupPath)) {
    throw new Error(`backup file does not exist: ${sourceBackupPath}`);
  }
  assertSqliteOk(sourceBackupPath);

  mkdirSync(dirname(restoredPath), { recursive: true });

  let preRestoreBackupPath: string | undefined;
  if (existsSync(restoredPath)) {
    const current = new Database(restoredPath, { readwrite: true, create: false });
    try {
      preRestoreBackupPath = backupDatabase(current, {
        dbPath: restoredPath,
        backupDir: options.backupDir,
        now: options.now,
        reason: 'pre-restore',
      }).path;
    } finally {
      current.close();
    }
  }

  rmSync(restoredPath, { force: true });
  rmSync(`${restoredPath}-wal`, { force: true });
  rmSync(`${restoredPath}-shm`, { force: true });
  copyFileSync(sourceBackupPath, restoredPath);
  assertSqliteOk(restoredPath);

  return {
    restoredPath,
    sourceBackupPath,
    preRestoreBackupPath,
  };
}

function uniqueBackupPath(dir: string, now: Date, reason: string | undefined): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const reasonSuffix = reason ? `-${sanitizeReason(reason)}` : '';
  const base = `stash-backup-${stamp}${reasonSuffix}`;
  let candidate = join(dir, `${base}.db`);
  let suffix = 1;
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}-${suffix}.db`);
    suffix++;
  }
  return candidate;
}

function sanitizeReason(reason: string): string {
  const sanitized = reason.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  return sanitized || 'manual';
}

function assertSqliteOk(path: string): void {
  const db = new Database(path, { readonly: true, create: false });
  try {
    const rows = db.query<QuickCheckRow, []>('pragma quick_check').all();
    const result = rows[0]?.quick_check;
    if (result !== 'ok') {
      throw new Error(`sqlite quick_check failed for ${path}: ${result ?? 'no result'}`);
    }
  } finally {
    db.close();
  }
}

function assertOnDiskPath(path: string, label: string): void {
  if (!path || path === ':memory:') {
    throw new Error(`${label} must be an on-disk SQLite file`);
  }
}
