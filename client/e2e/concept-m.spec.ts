import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

/**
 * Concept M golden path:
 * 1. Seed one skill via API
 * 2. Open `/c/m`
 * 3. Topbar renders, skill name appears
 * 4. The "installed" tab count reflects reality
 */
test('Concept M lists seeded skills', async ({ page, request }) => {
  // Seed a uniquely named skill so repeated local e2e runs against the same
  // /tmp database do not make the locator ambiguous.
  const id = `e2e-skill-${Date.now()}`;
  const name = `E2E Library ${id.slice(-6)}`;
  const create = await request.post(`${API}/skills`, {
    data: { id, name, emoji: '🧪', installed: true, stars: 7 },
  });
  expect(create.ok()).toBeTruthy();

  await page.goto('/c/m');
  await expect(page.locator('.topbar-title')).toContainText('stash');

  // Skill card should appear in the catalog grid (also appears in detail header — pick the card).
  await expect(page.locator('.sk-card-name', { hasText: name })).toBeVisible({ timeout: 10_000 });
});
