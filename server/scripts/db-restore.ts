#!/usr/bin/env bun
import { existsSync } from 'fs';
import { loadConfig } from '../src/config.js';
import { createDatabaseBackup, restoreDatabaseFile } from '../src/db/backup.js';
import { openDatabase, openDatabaseMigrated } from '../src/db/connection.js';

const backupPath = process.argv[2];
if (!backupPath) {
  throw new Error('usage: bun run db:restore -- /path/to/stash.db.<timestamp>.bak');
}

const config = loadConfig();
if (config.inMemoryDb) {
  throw new Error('STASH_IN_MEMORY=1 has no database file to restore');
}

if (existsSync(config.dbPath)) {
  const current = openDatabase({ path: config.dbPath, inMemory: false });
  try {
    const safetyBackup = createDatabaseBackup(current, {
      dbPath: config.dbPath,
      label: 'pre-restore',
    });
    process.stderr.write(`[restore] current database backed up to ${safetyBackup}\n`);
  } finally {
    current.close();
  }
}

restoreDatabaseFile({ backupPath, dbPath: config.dbPath });

const restored = openDatabaseMigrated({
  path: config.dbPath,
  inMemory: false,
  backupBeforeMigrate: false,
});
restored.close();

process.stdout.write(`${config.dbPath}\n`);
