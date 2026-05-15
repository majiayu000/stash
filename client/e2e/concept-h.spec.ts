import { test, expect } from '@playwright/test';

/**
 * Concept H golden path:
 * 1. Open `/c/h` (Cost & Burn)
 * 2. Topbar renders
 * 3. Either the analytics grid loads or the "no usage data yet" empty state is shown.
 *
 * The e2e fixture JSONLs do not include token usage records, so the empty state
 * path is the expected outcome — this still proves the route, fetch, and
 * empty-state rendering all work end-to-end against the real backend.
 */
test('Concept H renders an analytics layout or the empty state', async ({ page }) => {
  await page.goto('/c/h');

  await expect(page.locator('.topbar-title')).toContainText('stash');

  // Either the empty state copy appears, or the KPI tiles do.
  const empty = page.getByText('no usage data yet');
  const kpiLabel = page.getByText('this month · spend');
  await expect(empty.or(kpiLabel).first()).toBeVisible({ timeout: 10_000 });
});
