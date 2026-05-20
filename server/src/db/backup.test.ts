import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabaseBackup, restoreDatabaseFile } from './backup.js';
import { openDatabase, openDatabaseMigrated } from './connection.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stash-db-'));
  tempDirs.push(dir);
  return dir;
}

describe('database backup', () => {
  test('writes a restorable sqlite snapshot', () => {
    const dir = tempDir();
    const dbPath = join(dir, 'stash.db');
    const db = openDatabase({ path: dbPath, inMemory: false });
    db.exec("create table marker (id text primary key, value text not null); insert into marker values ('one', 'alive')");

    const backupPath = createDatabaseBackup(db, {
      dbPath,
      backupDir: join(dir, 'backups'),
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });
    db.close();

    expect(existsSync(backupPath)).toBe(true);

    const backup = openDatabase({ path: backupPath, inMemory: false });
    expect(backup.query<{ value: string }, []>('select value from marker where id = "one"').get()?.value).toBe('alive');
    backup.close();
  });

  test('openDatabaseMigrated backs up an existing db before applying migrations', () => {
    const dir = tempDir();
    const dbPath = join(dir, 'stash.db');
    const backupDir = join(dir, 'backups');

    const existing = openDatabase({ path: dbPath, inMemory: false });
    existing.exec("create table marker (id text primary key, value text not null); insert into marker values ('one', 'before')");
    existing.close();

    const migrated = openDatabaseMigrated({ path: dbPath, inMemory: false, backupDir });
    migrated.close();

    const backups = readdirSync(backupDir).filter((f) => f.endsWith('.pre-migrate.bak'));
    expect(backups.length).toBe(1);

    const backup = openDatabase({ path: join(backupDir, backups[0]!), inMemory: false });
    expect(backup.query<{ value: string }, []>('select value from marker where id = "one"').get()?.value).toBe('before');
    const workItems = backup
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'work_items'")
      .all();
    expect(workItems).toEqual([]);
    backup.close();
  });

  test('restore replaces db file and removes stale wal sidecars', () => {
    const dir = tempDir();
    const dbPath = join(dir, 'stash.db');
    const backupPath = join(dir, 'backup.db');
    const db = openDatabase({ path: dbPath, inMemory: false });
    db.exec("create table marker (id text primary key, value text not null); insert into marker values ('one', 'current')");
    db.close();

    const backup = openDatabase({ path: backupPath, inMemory: false });
    backup.exec("create table marker (id text primary key, value text not null); insert into marker values ('one', 'restored')");
    backup.close();

    writeFileSync(`${dbPath}-wal`, 'stale');
    writeFileSync(`${dbPath}-shm`, 'stale');

    restoreDatabaseFile({ backupPath, dbPath });

    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);

    const restored = openDatabase({ path: dbPath, inMemory: false });
    expect(restored.query<{ value: string }, []>('select value from marker where id = "one"').get()?.value).toBe('restored');
    restored.close();
  });
});
