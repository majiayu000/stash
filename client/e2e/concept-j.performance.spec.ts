import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { expect, test } from '@playwright/test';

const projectDir = process.env.STASH_E2E_WEEKLY_PERF_PROJECT_DIR;
const EXPECTED_FILES = 3_000;
const UI_BUDGET_MS = 3_000;

interface WeeklyPerformanceResponse {
  data: {
    wow: {
      tokens: { now: number; prev: number };
      cost: { now: number; prev: number };
    };
  };
  cache: {
    filesDiscovered: number;
    filesSeen: number;
    filesIndexed: number;
    filesReused: number;
  };
}

test('Concept J is interactive within 3s on a cold 3,000-history root', async ({ page }) => {
  test.skip(!projectDir, 'run through the weekly performance E2E command');
  test.setTimeout(20_000);

  const histories = readdirSync(projectDir!)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => join(projectDir!, name));
  const inodes = new Set(histories.map((file) => {
    const stat = statSync(file);
    return `${stat.dev}:${stat.ino}`;
  }));
  expect(histories).toHaveLength(EXPECTED_FILES);
  expect(inodes.size).toBe(EXPECTED_FILES);

  const weeklyResponse = page.waitForResponse((response) => (
    response.url().includes('/api/analytics/weekly') && response.request().method() === 'GET'
  ));
  const started = performance.now();
  await page.goto('/c/j', { waitUntil: 'load' });
  await expect(page.locator('.wr-head .shiny-text')).toContainText(/\b\d{4}-W\d{2}\b/, {
    timeout: UI_BUDGET_MS,
  });
  const tokenKpi = page.locator('.wr-kpi', { hasText: 'tokens · 7d' });
  const costKpi = page.locator('.wr-kpi', { hasText: 'cost · 7d' });
  await expect(tokenKpi.locator('.wr-kpi-value')).toHaveText('225');
  await expect(tokenKpi.locator('.wr-kpi-wow')).toHaveText('↑ 50% vs prev');
  await expect(costKpi.locator('.wr-kpi-value')).toHaveText('$0.00');
  await expect(costKpi.locator('.wr-kpi-wow')).toHaveText('↓ 7% vs prev');
  await expect(page.getByRole('button', { name: 'previous week' })).toBeEnabled();
  const interactiveMs = performance.now() - started;
  expect(interactiveMs).toBeLessThanOrEqual(UI_BUDGET_MS);

  const response = await weeklyResponse;
  expect(response.status()).toBe(200);
  const body = await response.json() as WeeklyPerformanceResponse;
  expect(body.cache.filesDiscovered).toBe(EXPECTED_FILES);
  expect(body.cache.filesSeen).toBe(EXPECTED_FILES);
  expect(body.cache.filesIndexed + body.cache.filesReused).toBe(EXPECTED_FILES);
  expect(body.data.wow.tokens).toEqual({ now: 225, prev: 150 });
  expect(body.data.wow.cost.now).toBeCloseTo(0.000975, 9);
  expect(body.data.wow.cost.prev).toBeCloseTo(0.00105, 9);
  console.info(JSON.stringify({
    benchmark: 'concept-j-3000-independent-inodes',
    interactiveMs: Number(interactiveMs.toFixed(3)),
    ...body.cache,
  }));

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /export markdown/i }).click();
  await download;
  await expect(page.locator('.wr-action-msg')).toContainText('markdown exported');
});
