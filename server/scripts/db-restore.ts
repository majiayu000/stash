#!/usr/bin/env bun
import { loadConfig } from '../src/config.js';
import { restoreDatabaseFromBackup } from '../src/db/backup.js';

const backupPath = process.argv[2] ?? process.env.STASH_RESTORE_PATH;

if (!backupPath) {
  process.stderr.write('usage: bun run db:restore -- /path/to/stash-backup.db\n');
  process.exit(1);
}

try {
  const config = loadConfig();
  if (config.inMemoryDb) throw new Error('cannot restore an in-memory database');
  const result = restoreDatabaseFromBackup({
    backupPath,
    dbPath: config.dbPath,
    backupDir: config.backupDir,
  });
  process.stderr.write(`[stash] restored ${result.restoredPath} from ${result.sourceBackupPath}\n`);
  if (result.preRestoreBackupPath) {
    process.stderr.write(`[stash] pre-restore backup wrote ${result.preRestoreBackupPath}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[stash] restore failed: ${message}\n`);
  process.exit(1);
}
