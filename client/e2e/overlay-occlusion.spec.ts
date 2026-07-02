import { test, expect, type Locator } from '@playwright/test';

/**
 * GH #102 — fixed overlays must not cover page content.
 * The concept/theme switcher stack sits over the topbar stats, and the
 * AI-drafts affordance sits over the bottom of the board columns unless
 * the shell reserves space for them.
 */

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, `expected bounding box for ${String(locator)}`).not.toBeNull();
  return b!;
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.use({ viewport: { width: 1440, height: 900 } });

test('floating switcher stack does not cover topbar stats', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('board-col-inbox')).toBeVisible({ timeout: 10_000 });

  const floating = await box(page.getByTestId('workbench-floating'));
  const stats = await box(page.getByTestId('topbar-stats'));

  expect(intersects(floating, stats)).toBe(false);
});

test('AI drafts affordance does not cover board column content', async ({ page }) => {
  await page.goto('/');
  const inboxCol = page.getByTestId('board-col-inbox');
  await expect(inboxCol).toBeVisible({ timeout: 10_000 });

  // the pill is position:fixed — the column only needs to clear it once the
  // page is scrolled to its end. Poll because late data loads grow the board
  // after an early scroll, which would leave the viewport off the bottom.
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const pill = await box(page.getByTestId('decision-inbox-button'));
      const col = await box(inboxCol);
      return intersects(pill, col);
    }, { timeout: 10_000 })
    .toBe(false);
});
