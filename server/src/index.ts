import { defaultConfig } from './config.js';
import { openDatabaseMigrated } from './db/connection.js';
import { createApp } from './web/app-factory.js';
import { AreaService } from './domain/area/service.js';

const config = defaultConfig;
const db = openDatabaseMigrated({ path: config.dbPath, inMemory: config.inMemoryDb });

// Seed default areas on first run.
new AreaService({ db }).ensureDefaults();

const app = createApp({
  db,
  claudeRoot: config.claudeRoot,
  codexRoot: config.codexRoot,
  allowedOrigins: config.allowedOrigins,
  logger: (msg) => process.stderr.write(`${msg}\n`),
});

const hostForUrl = config.host.includes(':') ? `[${config.host}]` : config.host;

process.stderr.write(`[stash] listening on http://${hostForUrl}:${config.port}\n`);
process.stderr.write(`[stash] db: ${config.inMemoryDb ? ':memory:' : config.dbPath}\n`);

export { app, db, config };

export default {
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
};
