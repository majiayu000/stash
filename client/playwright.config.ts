import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CLAUDE_FIXTURE_ROOT = resolve(here, '../server/src/adapters/claude/fixtures');
const CODEX_FIXTURE_ROOT = resolve(here, '../server/src/adapters/codex/fixtures');

const CLIENT_PORT = Number(process.env.STASH_E2E_CLIENT_PORT ?? 5173);
const SERVER_PORT = Number(process.env.STASH_E2E_SERVER_PORT ?? 4174);
const DB_PATH = process.env.STASH_E2E_DB_PATH ?? '/tmp/stash-e2e.db';
const reuseExistingServer = process.env.STASH_REUSE_E2E_SERVER === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'bun run start',
      cwd: '../server',
      port: SERVER_PORT,
      env: {
        STASH_DB_PATH: DB_PATH,
        PORT: String(SERVER_PORT),
        CLAUDE_ROOT: CLAUDE_FIXTURE_ROOT,
        CODEX_ROOT: CODEX_FIXTURE_ROOT,
      },
      reuseExistingServer,
      timeout: 30_000,
    },
    {
      command: `bun run dev -- --port ${CLIENT_PORT}`,
      port: CLIENT_PORT,
      env: {
        STASH_E2E_SERVER_PORT: String(SERVER_PORT),
      },
      reuseExistingServer,
      timeout: 30_000,
    },
  ],
});
