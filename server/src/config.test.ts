import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'path';
import { defaultDbPath, loadConfig } from './config';

const originalStashHost = process.env.STASH_HOST;
const originalAllowedOrigins = process.env.STASH_ALLOWED_ORIGINS;
const originalSessionSpawnMode = process.env.STASH_SESSION_SPAWN_MODE;
const originalAiProvider = process.env.STASH_AI_PROVIDER;
const originalAiBaseUrl = process.env.STASH_AI_BASE_URL;
const originalAiApiKey = process.env.STASH_AI_API_KEY;
const originalAiModel = process.env.STASH_AI_MODEL;
const originalAiTimeoutMs = process.env.STASH_AI_TIMEOUT_MS;
const originalTimeZone = process.env.STASH_TIME_ZONE;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv('STASH_HOST', originalStashHost);
  restoreEnv('STASH_ALLOWED_ORIGINS', originalAllowedOrigins);
  restoreEnv('STASH_SESSION_SPAWN_MODE', originalSessionSpawnMode);
  restoreEnv('STASH_AI_PROVIDER', originalAiProvider);
  restoreEnv('STASH_AI_BASE_URL', originalAiBaseUrl);
  restoreEnv('STASH_AI_API_KEY', originalAiApiKey);
  restoreEnv('STASH_AI_MODEL', originalAiModel);
  restoreEnv('STASH_AI_TIMEOUT_MS', originalAiTimeoutMs);
  restoreEnv('STASH_TIME_ZONE', originalTimeZone);
});

describe('defaultDbPath', () => {
  test('keeps existing macOS XDG users on the prior default until they migrate', () => {
    const homeDir = '/Users/alex';
    const priorPath = join(homeDir, '.local', 'share', 'stash', 'stash.db');

    const dbPath = defaultDbPath({
      platform: 'darwin',
      homeDir,
      pathExists: (path) => path === priorPath,
    });

    expect(dbPath).toBe(priorPath);
  });

  test('keeps existing macOS app.db users on the legacy default until they migrate', () => {
    const homeDir = '/Users/alex';
    const legacyPath = join(homeDir, 'Library', 'Application Support', 'stash', 'app.db');

    const dbPath = defaultDbPath({
      platform: 'darwin',
      homeDir,
      pathExists: (path) => path === legacyPath,
    });

    expect(dbPath).toBe(legacyPath);
  });

  test('uses the new macOS stash.db default when no legacy DB exists', () => {
    const homeDir = '/Users/alex';

    const dbPath = defaultDbPath({
      platform: 'darwin',
      homeDir,
      pathExists: () => false,
    });

    expect(dbPath).toBe(join(homeDir, 'Library', 'Application Support', 'stash', 'stash.db'));
  });

  test('uses the new macOS stash.db default when it already exists', () => {
    const homeDir = '/Users/alex';
    const currentPath = join(homeDir, 'Library', 'Application Support', 'stash', 'stash.db');
    const priorPath = join(homeDir, '.local', 'share', 'stash', 'stash.db');

    const dbPath = defaultDbPath({
      platform: 'darwin',
      homeDir,
      pathExists: (path) => path === currentPath || path === priorPath,
    });

    expect(dbPath).toBe(currentPath);
  });

  test('uses XDG data home on non-macOS platforms', () => {
    const dbPath = defaultDbPath({
      platform: 'linux',
      homeDir: '/home/alex',
      xdgDataHome: '/data/xdg',
    });

    expect(dbPath).toBe('/data/xdg/stash/stash.db');
  });
});

describe('loadConfig local API security', () => {
  test('uses an explicit IANA time zone and rejects offsets or legacy aliases', () => {
    process.env.STASH_TIME_ZONE = 'Asia/Shanghai';
    expect(loadConfig({ dbPath: ':memory:' }).time_zone).toBe('Asia/Shanghai');

    process.env.STASH_TIME_ZONE = '+01:00';
    expect(() => loadConfig({ dbPath: ':memory:' })).toThrow('unsupported IANA time zone');

    process.env.STASH_TIME_ZONE = 'US/Pacific';
    expect(() => loadConfig({ dbPath: ':memory:' })).toThrow('unsupported IANA time zone');
  });

  test('binds to 127.0.0.1 by default', () => {
    delete process.env.STASH_HOST;

    expect(loadConfig({ dbPath: ':memory:' }).host).toBe('127.0.0.1');
  });

  test('allows explicit IPv6 loopback host', () => {
    process.env.STASH_HOST = '::1';

    expect(loadConfig({ dbPath: ':memory:' }).host).toBe('::1');
  });

  test('rejects non-loopback hosts', () => {
    process.env.STASH_HOST = '0.0.0.0';

    expect(() => loadConfig({ dbPath: ':memory:' })).toThrow(
      'env STASH_HOST must be a loopback host, got 0.0.0.0',
    );
  });

  test('parses explicit allowed origins', () => {
    process.env.STASH_ALLOWED_ORIGINS = 'http://localhost:5273, http://127.0.0.1:5273';

    expect(loadConfig({ dbPath: ':memory:' }).allowedOrigins).toEqual([
      'http://localhost:5273',
      'http://127.0.0.1:5273',
    ]);
  });

  test('allows disabling session spawn for deterministic e2e runs', () => {
    process.env.STASH_SESSION_SPAWN_MODE = 'disabled';

    expect(loadConfig({ dbPath: ':memory:' }).sessionSpawnMode).toBe('disabled');
  });

  test('defaults session spawn mode to real runtime behavior', () => {
    delete process.env.STASH_SESSION_SPAWN_MODE;

    expect(loadConfig({ dbPath: ':memory:' }).sessionSpawnMode).toBe('real');
  });

  test('rejects invalid session spawn mode', () => {
    process.env.STASH_SESSION_SPAWN_MODE = 'stub';

    expect(() => loadConfig({ dbPath: ':memory:' })).toThrow(
      'env STASH_SESSION_SPAWN_MODE must be one of real, disabled, got stub',
    );
  });

  test('keeps AI provider disabled by default', () => {
    delete process.env.STASH_AI_PROVIDER;
    delete process.env.STASH_AI_API_KEY;

    expect(loadConfig({ dbPath: ':memory:' }).aiProvider).toEqual({
      mode: 'disabled',
      baseUrl: undefined,
      apiKey: undefined,
      model: undefined,
      timeoutMs: 30_000,
    });
  });

  test('parses server-side AI provider configuration from env', () => {
    process.env.STASH_AI_PROVIDER = 'openai_compatible';
    process.env.STASH_AI_BASE_URL = 'https://local-llm.example/v1/chat/completions';
    process.env.STASH_AI_API_KEY = 'test-secret';
    process.env.STASH_AI_MODEL = 'local-json-model';
    process.env.STASH_AI_TIMEOUT_MS = '1500';

    expect(loadConfig({ dbPath: ':memory:' }).aiProvider).toEqual({
      mode: 'openai_compatible',
      baseUrl: 'https://local-llm.example/v1/chat/completions',
      apiKey: 'test-secret',
      model: 'local-json-model',
      timeoutMs: 1500,
    });
  });

  test('rejects invalid AI provider mode', () => {
    process.env.STASH_AI_PROVIDER = 'browser_local_storage';

    expect(() => loadConfig({ dbPath: ':memory:' })).toThrow(
      'env STASH_AI_PROVIDER must be one of disabled, openai_compatible, got browser_local_storage',
    );
  });
});
