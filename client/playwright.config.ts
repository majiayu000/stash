import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CLAUDE_FIXTURE_ROOT = resolve(here, '../server/src/adapters/claude/fixtures');
const CODEX_FIXTURE_ROOT = resolve(here, '../server/src/adapters/codex/fixtures');

const CLIENT_PORT = 5173;
const SERVER_PORT = 4174;
const E2E_DB_PATH = resolve(here, '.playwright/stash-e2e.db');
const RESET_E2E_DB_COMMAND = `bun -e "import { rmSync } from 'fs'; for (const suffix of ['', '-journal', '-shm', '-wal']) rmSync(process.env.STASH_DB_PATH + suffix, { force: true });"`;

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
      command: `${RESET_E2E_DB_COMMAND} && bun run start`,
      cwd: '../server',
      port: SERVER_PORT,
      env: {
        STASH_DB_PATH: E2E_DB_PATH,
        PORT: String(SERVER_PORT),
        CLAUDE_ROOT: CLAUDE_FIXTURE_ROOT,
        CODEX_ROOT: CODEX_FIXTURE_ROOT,
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `bun run dev -- --port ${CLIENT_PORT}`,
      port: CLIENT_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
