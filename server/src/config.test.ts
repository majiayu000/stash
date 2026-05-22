import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { defaultDbPath } from './config';

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
