import { test, expect, type APIRequestContext } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

async function clearSkills(request: APIRequestContext) {
  const res = await request.get(`${API}/skills`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as { data: { id: string }[] };
  await Promise.all(body.data.map((skill) => request.delete(`${API}/skills/${skill.id}`)));
}

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

test('Concept M empty state creates a skill through the UI', async ({ page, request }) => {
  await clearSkills(request);

  let nativeDialogSeen = false;
  page.on('dialog', async (dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  });

  await page.goto('/c/m');
  await expect(page.getByText('no skills registered')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('POST /api/skills')).toHaveCount(0);

  await page.getByTestId('cm-empty-create').click();
  await expect(page.getByRole('dialog', { name: 'New skill' })).toBeVisible();
  await page.getByTestId('cm-skill-name').fill('Inbox Cleaner');
  await expect(page.getByTestId('cm-skill-id')).toHaveValue('inbox-cleaner');
  await page.getByTestId('cm-skill-description').fill('Clean incoming notes');
  await page.getByTestId('cm-create-submit').click();

  await expect(page.locator('.sk-card-name', { hasText: 'Inbox Cleaner' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('cm-notice')).toContainText('Created Inbox Cleaner');
  await expect(page.getByTestId('cm-status-summary')).toContainText(/availability/i);
  await expect(page.getByTestId('cm-status-summary')).toContainText('installed');
  await expect(page.getByTestId('cm-status-summary')).toContainText(/activation/i);

  await page.getByTestId('cm-delete').click();
  await expect(page.getByRole('dialog', { name: 'Delete skill?' })).toBeVisible();
  await page.getByTestId('cm-delete-confirm').click();
  await expect(page.getByText('no skills registered')).toBeVisible({ timeout: 10_000 });
  expect(nativeDialogSeen).toBe(false);
});
