import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkBunVersion, formatChecks, runDoctor, type FetchLike } from './doctor';
import type { Config } from '../server/src/config';

describe('doctor checks', () => {
  test('validates the required Bun version', () => {
    expect(checkBunVersion('1.1.0').status).toBe('ok');
    expect(checkBunVersion('1.0.30').status).toBe('fail');
    expect(checkBunVersion('not-a-version').status).toBe('fail');
  });

  test('strict mode fails on missing first-run state and unreachable services', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'stash-doctor-'));
    const config = testConfig({
      dbPath: join(tmp, 'missing-dir', 'stash.db'),
      claudeRoot: join(tmp, 'missing-claude'),
      codexRoot: join(tmp, 'missing-codex'),
    });

    try {
      const checks = await runDoctor({
        config,
        strict: true,
        bunVersion: '1.3.0',
        httpTimeoutMs: 1,
        fetchImpl: offlineFetch,
      });

      expect(statusFor(checks, 'db dir')).toBe('fail');
      expect(statusFor(checks, 'db file')).toBe('fail');
      expect(statusFor(checks, 'Claude root')).toBe('fail');
      expect(statusFor(checks, 'Codex root')).toBe('fail');
      expect(statusFor(checks, 'server health')).toBe('fail');
      expect(statusFor(checks, 'client dev server')).toBe('fail');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('non-strict mode keeps diagnostics advisory and prints next steps', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'stash-doctor-'));
    const dbDir = join(tmp, 'data');
    const claudeRoot = join(tmp, 'claude');
    const codexRoot = join(tmp, 'codex');
    mkdirSync(dbDir);
    mkdirSync(claudeRoot);
    mkdirSync(codexRoot);

    const dbPath = join(dbDir, 'stash.db');
    const config = testConfig({ dbPath, claudeRoot, codexRoot });

    try {
      const checks = await runDoctor({
        config,
        strict: false,
        bunVersion: '1.3.0',
        httpTimeoutMs: 1,
        fetchImpl: offlineFetch,
      });

      expect(statusFor(checks, 'db dir')).toBe('ok');
      expect(statusFor(checks, 'db file')).toBe('warn');
      expect(statusFor(checks, 'server health')).toBe('warn');

      const output = formatChecks(checks);
      expect(output).toContain('WARN db file');
      expect(output).toContain('next:');
      expect(output).toContain('STASH_DB_PATH');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('existing DB and roots pass path checks', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'stash-doctor-'));
    const claudeRoot = join(tmp, 'claude');
    const codexRoot = join(tmp, 'codex');
    mkdirSync(claudeRoot);
    mkdirSync(codexRoot);
    const dbPath = join(tmp, 'stash.db');
    writeFileSync(dbPath, '');

    try {
      const checks = await runDoctor({
        config: testConfig({ dbPath, claudeRoot, codexRoot }),
        strict: true,
        bunVersion: '1.3.0',
        httpTimeoutMs: 1,
        fetchImpl: onlineFetch,
      });

      expect(statusFor(checks, 'db dir')).toBe('ok');
      expect(statusFor(checks, 'db file')).toBe('ok');
      expect(statusFor(checks, 'Claude root')).toBe('ok');
      expect(statusFor(checks, 'Codex root')).toBe('ok');
      expect(statusFor(checks, 'server health')).toBe('ok');
      expect(statusFor(checks, 'client dev server')).toBe('ok');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function testConfig(overrides: Partial<Config>): Config {
  return {
    port: 4174,
    dbPath: '/tmp/stash.db',
    backupDir: '/tmp/backups',
    claudeRoot: '/tmp/claude',
    codexRoot: '/tmp/codex',
    time_zone: 'UTC',
    inMemoryDb: false,
    ...overrides,
  };
}

function statusFor(checks: Awaited<ReturnType<typeof runDoctor>>, name: string): string | undefined {
  return checks.find((check) => check.name === name)?.status;
}

const offlineFetch: FetchLike = async () => {
  throw new Error('offline');
};

const onlineFetch: FetchLike = async () => new Response('ok', { status: 200 });
