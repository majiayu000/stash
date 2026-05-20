import { homedir } from 'os';
import { join } from 'path';

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

export type SessionSpawnMode = 'real' | 'disabled';

function envSessionSpawnMode(name: string, fallback: SessionSpawnMode): SessionSpawnMode {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (raw === 'real' || raw === 'disabled') return raw;
  throw new Error(`env ${name} must be one of real, disabled, got ${raw}`);
}

const home = homedir();
const xdgData = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share');

export interface Config {
  port: number;
  dbPath: string;
  claudeRoot: string;
  codexRoot: string;
  // When true, the connection layer creates an in-memory DB for tests.
  inMemoryDb: boolean;
  // Controls whether /api/sessions/start may spawn a real agent CLI.
  sessionSpawnMode: SessionSpawnMode;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: envInt('PORT', 4174),
    dbPath: envPath('STASH_DB_PATH', join(xdgData, 'stash', 'stash.db')),
    claudeRoot: envPath('CLAUDE_ROOT', join(home, '.claude')),
    codexRoot: envPath('CODEX_ROOT', join(home, '.codex')),
    inMemoryDb: process.env.STASH_IN_MEMORY === '1',
    sessionSpawnMode: envSessionSpawnMode('STASH_SESSION_SPAWN_MODE', 'real'),
    ...overrides,
  };
}

export const defaultConfig = loadConfig();
