#!/usr/bin/env bun
import { existsSync } from 'fs';
import { loadConfig } from '../src/config.js';
import { backupDatabase } from '../src/db/backup.js';
import { openDatabase } from '../src/db/connection.js';

try {
  const config = loadConfig();
  if (config.inMemoryDb) throw new Error('cannot back up an in-memory database');
  if (!existsSync(config.dbPath)) throw new Error(`database file does not exist: ${config.dbPath}`);
  const db = openDatabase({ path: config.dbPath, inMemory: config.inMemoryDb });
  try {
    const backup = backupDatabase(db, {
      dbPath: config.dbPath,
      backupDir: config.backupDir,
      reason: 'manual',
    });
    process.stdout.write(`${backup.path}\n`);
    process.stderr.write(`[stash] backup wrote ${backup.path} (${backup.bytes} bytes)\n`);
  } finally {
    db.close();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[stash] backup failed: ${message}\n`);
  process.exit(1);
}
