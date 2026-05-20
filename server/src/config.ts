import { homedir } from 'os';
import { dirname, join } from 'path';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`env ${name} must be an integer, got ${raw}`);
  }
  return n;
}

function envPath(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.length > 0 ? raw : fallback;
}

const home = homedir();
const xdgData = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share');

export interface Config {
  port: number;
  dbPath: string;
  backupDir: string;
  claudeRoot: string;
  codexRoot: string;
  // When true, the connection layer creates an in-memory DB for tests.
  inMemoryDb: boolean;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dbPath = overrides.dbPath ?? envPath('STASH_DB_PATH', join(xdgData, 'stash', 'stash.db'));
  return {
    port: envInt('PORT', 4174),
    dbPath,
    backupDir: overrides.backupDir ?? envPath('STASH_BACKUP_DIR', join(dirname(dbPath), 'backups')),
    claudeRoot: envPath('CLAUDE_ROOT', join(home, '.claude')),
    codexRoot: envPath('CODEX_ROOT', join(home, '.codex')),
    inMemoryDb: process.env.STASH_IN_MEMORY === '1',
    ...overrides,
  };
}

export const defaultConfig = loadConfig();
