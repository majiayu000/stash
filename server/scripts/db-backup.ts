#!/usr/bin/env bun
import { loadConfig } from '../src/config.js';
import { createDatabaseBackup } from '../src/db/backup.js';
import { openDatabase } from '../src/db/connection.js';

const config = loadConfig();
if (config.inMemoryDb) {
  throw new Error('STASH_IN_MEMORY=1 has no database file to back up');
}

const db = openDatabase({ path: config.dbPath, inMemory: false });
try {
  const backupPath = createDatabaseBackup(db, { dbPath: config.dbPath });
  process.stdout.write(`${backupPath}\n`);
} finally {
  db.close();
}
