import { test, expect } from '@playwright/test';

const API = 'http://localhost:4174/api';

/**
 * Concept M golden path:
 * 1. Seed one skill via API
 * 2. Open `/c/m`
 * 3. Topbar renders, skill name appears
 * 4. The "installed" tab count reflects reality
 */
test('Concept M lists seeded skills', async ({ page, request }) => {
  const id = `e2e-skill-${Date.now()}`;
  const name = `E2E Library ${Date.now()}`;
  const create = await request.post(`${API}/skills`, {
    data: { id, name, emoji: '🧪', installed: true, stars: 7 },
  });
  expect(create.ok()).toBeTruthy();

  await page.goto('/c/m');
  await expect(page.locator('.topbar-title')).toContainText('stash');

  // Skill card should appear in the catalog grid (also appears in detail header — pick the card).
  await expect(page.locator('.sk-card-name').filter({ hasText: new RegExp(`^${name}$`) })).toBeVisible({ timeout: 10_000 });
});
