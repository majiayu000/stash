import { test, expect } from '@playwright/test';

/**
 * Concept J golden path:
 * 1. Open `/c/j` (Weekly review)
 * 2. Topbar renders
 * 3. The week summary header is visible (ISO-week label) — proves the
 *    `/api/analytics/weekly` fetch resolved.
 */
test('Concept J renders the weekly review with an ISO-week label', async ({ page }) => {
  const started = performance.now();
  await page.goto('/c/j');

  await expect(page.locator('.topbar-title')).toContainText('stash');

  // The header contains `<year>-W<week>` once the snapshot loads.
  await expect(page.locator('.wr-head .shiny-text')).toContainText(/\b\d{4}-W\d{2}\b/, {
    timeout: 3_000,
  });
  expect(performance.now() - started).toBeLessThanOrEqual(3_000);
});
