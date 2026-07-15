import { test, expect } from '@playwright/test';

/**
 * Weekly review golden path:
 * 1. Open `/review` (Weekly review)
 * 2. Topbar renders
 * 3. The week summary header is visible (ISO-week label) — proves the
 *    `/api/analytics/weekly` fetch resolved.
 */
test('Weekly review renders an ISO-week label', async ({ page }) => {
  const started = performance.now();
  await page.goto('/review');

  await expect(page.locator('.topbar-title')).toContainText('stash');

  // The header contains `<year>-W<week>` once the snapshot loads.
  await expect(page.locator('.wr-head .shiny-text')).toContainText(/\b\d{4}-W\d{2}\b/, {
    timeout: 3_000,
  });
  expect(performance.now() - started).toBeLessThanOrEqual(3_000);
});
