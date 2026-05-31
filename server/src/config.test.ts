import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'path';
import { defaultDbPath, loadConfig } from './config';

const originalStashHost = process.env.STASH_HOST;
const originalAllowedOrigins = process.env.STASH_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalStashHost === undefined) {
    delete process.env.STASH_HOST;
  } else {
    process.env.STASH_HOST = originalStashHost;
  }
  if (originalAllowedOrigins === undefined) {
    delete process.env.STASH_ALLOWED_ORIGINS;
  } else {
    process.env.STASH_ALLOWED_ORIGINS = originalAllowedOrigins;
  }
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
});
