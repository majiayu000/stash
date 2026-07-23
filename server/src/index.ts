import { defaultConfig } from './config.js';
import { openDatabaseMigrated } from './db/connection.js';
import { createApp } from './web/app-factory.js';
import { AreaService } from './domain/area/service.js';

const config = defaultConfig;
const db = openDatabaseMigrated({
  path: config.dbPath,
  inMemory: config.inMemoryDb,
  backupDir: config.backupDir,
});

// Seed default areas on first run.
new AreaService({ db }).ensureDefaults();

const app = createApp({
  db,
  claudeRoot: config.claudeRoot,
  codexRoot: config.codexRoot,
  time_zone: config.time_zone,
  allowedOrigins: config.allowedOrigins,
  sessionSpawnMode: config.sessionSpawnMode,
  aiProvider: config.aiProvider,
  logger: (msg) => process.stderr.write(`${msg}\n`),
});

const hostForUrl = config.host.includes(':') ? `[${config.host}]` : config.host;

process.stderr.write(`[stash] listening on http://${hostForUrl}:${config.port}\n`);
process.stderr.write(`[stash] db: ${config.inMemoryDb ? ':memory:' : config.dbPath}\n`);
if (!config.inMemoryDb) process.stderr.write(`[stash] backups: ${config.backupDir}\n`);

export { app, db, config };

export default {
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
};
