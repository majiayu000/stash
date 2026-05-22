import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { backupDatabase, restoreDatabaseFromBackup } from './backup.js';
import { openDatabase } from './connection.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stash-db-backup-'));
  tempDirs.push(dir);
  return dir;
}

describe('database backup and restore', () => {
  test('writes a consistent SQLite backup and restores from it', () => {
    const root = tempDir();
    const dbPath = join(root, 'stash.db');
    const backupDir = join(root, 'backups');

    const db = openDatabase({ path: dbPath });
    db.exec('create table entries (id text primary key, title text not null)');
    db.prepare('insert into entries(id, title) values (?, ?)').run('one', 'before backup');
    const backup = backupDatabase(db, {
      dbPath,
      backupDir,
      now: new Date('2026-05-20T00:00:00.000Z'),
      reason: 'manual',
    });
    db.prepare('insert into entries(id, title) values (?, ?)').run('two', 'after backup');
    db.close();

    const result = restoreDatabaseFromBackup({
      backupPath: backup.path,
      dbPath,
      backupDir,
      now: new Date('2026-05-20T00:01:00.000Z'),
    });

    expect(result.restoredPath).toBe(dbPath);
    expect(result.sourceBackupPath).toBe(backup.path);
    expect(result.preRestoreBackupPath).toBeDefined();
    expect(existsSync(result.preRestoreBackupPath!)).toBe(true);

    const restored = openDatabase({ path: dbPath });
    try {
      const rows = restored.query<{ title: string }, []>('select title from entries order by id').all();
      expect(rows.map((r) => r.title)).toEqual(['before backup']);
    } finally {
      restored.close();
    }

    const preRestore = openDatabase({ path: result.preRestoreBackupPath! });
    try {
      const rows = preRestore.query<{ title: string }, []>('select title from entries order by id').all();
      expect(rows.map((r) => r.title)).toEqual(['before backup', 'after backup']);
    } finally {
      preRestore.close();
    }
  });
});
