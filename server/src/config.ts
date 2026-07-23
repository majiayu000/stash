import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { assert_time_zone } from '@stash/shared';

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

function envList(name: string): string[] {
  const raw = process.env[name];
  return raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : [];
}

function envLoopbackHost(name: string, fallback: string): string {
  const raw = process.env[name];
  const host = raw && raw.length > 0 ? raw : fallback;
  if (!['127.0.0.1', '::1'].includes(host)) {
    throw new Error(`env ${name} must be a loopback host, got ${host}`);
  }
  return host;
}

export type SessionSpawnMode = 'real' | 'disabled';
export type AiProviderMode = 'disabled' | 'openai_compatible';

function envSessionSpawnMode(name: string, fallback: SessionSpawnMode): SessionSpawnMode {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (raw === 'real' || raw === 'disabled') return raw;
  throw new Error(`env ${name} must be one of real, disabled, got ${raw}`);
}

function envAiProviderMode(name: string, fallback: AiProviderMode): AiProviderMode {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (raw === 'disabled' || raw === 'openai_compatible') return raw;
  throw new Error(`env ${name} must be one of disabled, openai_compatible, got ${raw}`);
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
  host: string;
  port: number;
  dbPath: string;
  backupDir: string;
  claudeRoot: string;
  codexRoot: string;
  allowedOrigins: string[];
  time_zone: string;
  // When true, the connection layer creates an in-memory DB for tests.
  inMemoryDb: boolean;
  // Controls whether /api/sessions/start may spawn a real agent CLI.
  sessionSpawnMode: SessionSpawnMode;
  aiProvider: {
    mode: AiProviderMode;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    timeoutMs: number;
  };
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dbPath = overrides.dbPath ?? envPath('STASH_DB_PATH', defaultDbPath());
  const requested_time_zone = overrides.time_zone
    ?? envPath('STASH_TIME_ZONE', Intl.DateTimeFormat().resolvedOptions().timeZone);
  const time_zone = assert_time_zone(requested_time_zone);
  return {
    host: envLoopbackHost('STASH_HOST', '127.0.0.1'),
    port: envInt('PORT', 4174),
    dbPath,
    backupDir: overrides.backupDir ?? envPath('STASH_BACKUP_DIR', join(dirname(dbPath), 'backups')),
    claudeRoot: envPath('CLAUDE_ROOT', join(home, '.claude')),
    codexRoot: envPath('CODEX_ROOT', join(home, '.codex')),
    allowedOrigins: envList('STASH_ALLOWED_ORIGINS'),
    inMemoryDb: process.env.STASH_IN_MEMORY === '1',
    sessionSpawnMode: envSessionSpawnMode('STASH_SESSION_SPAWN_MODE', 'real'),
    aiProvider: {
      mode: envAiProviderMode('STASH_AI_PROVIDER', 'disabled'),
      baseUrl: process.env.STASH_AI_BASE_URL,
      apiKey: process.env.STASH_AI_API_KEY,
      model: process.env.STASH_AI_MODEL,
      timeoutMs: envInt('STASH_AI_TIMEOUT_MS', 30_000),
    },
    ...overrides,
    time_zone,
  };
}

export const defaultConfig = loadConfig();
