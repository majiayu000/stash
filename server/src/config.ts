import { existsSync } from 'fs';
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

export interface DefaultDbPathOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
  xdgDataHome?: string;
  pathExists?: (path: string) => boolean;
}

export function defaultDbPath(options: DefaultDbPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? home;
  const xdgDataHome =
    options.xdgDataHome ?? process.env.XDG_DATA_HOME ?? join(homeDir, '.local', 'share');
  const defaultDataRoot =
    platform === 'darwin' ? join(homeDir, 'Library', 'Application Support') : xdgDataHome;
  const dbDir = join(defaultDataRoot, 'stash');
  const currentPath = join(dbDir, 'stash.db');

  if (platform === 'darwin') {
    const priorXdgPath = join(xdgDataHome, 'stash', 'stash.db');
    const legacyPath = join(dbDir, 'app.db');
    const pathExists = options.pathExists ?? existsSync;
    if (!pathExists(currentPath)) {
      if (pathExists(priorXdgPath)) {
        return priorXdgPath;
      }
      if (pathExists(legacyPath)) {
        return legacyPath;
      }
    }
  }

  return currentPath;
}

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
  const dbPath = overrides.dbPath ?? envPath('STASH_DB_PATH', defaultDbPath());
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
