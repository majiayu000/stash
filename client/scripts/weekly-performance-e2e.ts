#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  seedWeeklyPerformanceFixture,
  WEEKLY_PERFORMANCE_FILE_COUNT,
} from '../../server/src/testing/weekly-performance-fixture.ts';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(here, '..');
const root = mkdtempSync(join(tmpdir(), 'stash-weekly-performance-e2e-'));

let exitCode = 1;
try {
  const claudeRoot = join(root, 'claude');
  const projectDir = join(claudeRoot, 'projects', '-Users-test-weekly-performance');
  const codexRoot = join(root, 'codex');
  mkdirSync(join(codexRoot, 'sessions'), { recursive: true });

  const now = new Date();
  const currentWeekStartMs = currentWeekMondayMs(now);
  const fixture = seedWeeklyPerformanceFixture({
    projectDir,
    oldTimestamp: new Date(currentWeekStartMs - 180 * 86_400_000).toISOString(),
    previousTimestamp: new Date(currentWeekStartMs - 6 * 86_400_000).toISOString(),
    currentTimestamp: new Date(currentWeekStartMs + 8 * 3_600_000).toISOString(),
    candidateMtime: now,
  });
  const serverPort = Number(process.env.STASH_E2E_SERVER_PORT ?? await freePort());
  const clientPort = Number(process.env.STASH_E2E_CLIENT_PORT ?? await freePort());
  const aiProviderPort = Number(process.env.STASH_E2E_AI_PROVIDER_PORT ?? await freePort());

  process.stdout.write(`${JSON.stringify({
    fixtureRoot: root,
    files: fixture.files.length,
    uniqueInodes: fixture.uniqueInodes,
    oldFileBytes: fixture.oldFileBytes,
  })}\n`);

  const child = Bun.spawn(
    [process.execPath, 'x', 'playwright', 'test', 'e2e/weekly-review.performance.spec.ts'],
    {
      cwd: clientRoot,
      env: {
        ...process.env,
        STASH_E2E_SERVER_PORT: String(serverPort),
        STASH_E2E_CLIENT_PORT: String(clientPort),
        STASH_E2E_AI_PROVIDER_PORT: String(aiProviderPort),
        STASH_E2E_API_URL: `http://localhost:${serverPort}/api`,
        STASH_E2E_DB_PATH: join(root, 'stash-weekly-performance-e2e.db'),
        STASH_E2E_CLAUDE_ROOT: claudeRoot,
        STASH_E2E_CODEX_ROOT: codexRoot,
        STASH_E2E_WEEKLY_PERF_PROJECT_DIR: projectDir,
        STASH_E2E_CLIENT_MODE: 'preview',
      },
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    },
  );
  exitCode = await child.exited;
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (exitCode !== 0) process.exit(exitCode);
process.stdout.write(`weekly performance e2e passed (${WEEKLY_PERFORMANCE_FILE_COUNT} files)\n`);

function currentWeekMondayMs(date: Date): number {
  const day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    - day * 86_400_000;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('unable to allocate a weekly performance E2E port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}
