import { test, expect } from '@playwright/test';

const API = 'http://localhost:4174/api';

/**
 * ConceptE golden path:
 * 1. Open `/` → Concept E loads with real backend data
 * 2. Topbar wordmark "stash" visible
 * 3. Command list visible
 * 4. Capture an item via the capture row → it appears in the inbox group
 */
test('Concept E capture -> item lands in command inbox list', async ({ page }) => {
  await page.goto('/');

  // Topbar
  await expect(page.locator('.topbar-title')).toContainText('stash');

  await expect(page.getByTestId('todo-view-command')).toBeVisible();
  await expect(page.locator('.todo-list-surface')).toBeVisible();

  // Capture an item
  const unique = `e2e ${Date.now()}`;
  await page.getByTestId('capture-input').fill(unique);
  await page.getByTestId('capture-submit').click();

  // Item appears in the command list
  await expect(page.locator('.todo-list-row').filter({ hasText: unique })).toBeVisible({ timeout: 10_000 });
});

test('Concept E dragging a Later task to the Done rail completes it', async ({ page, request }) => {
  const unique = `e2e later done ${Date.now()}`;
  const create = await request.post(`${API}/work-items`, {
    data: {
      title: unique,
      status: 'planned',
      scheduledFor: '2026-06-01',
      todayPinned: false,
    },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  try {
    await page.goto('/');
    await page.getByTestId('todo-view-later').click();

    const row = page.locator('.todo-row-shell').filter({ hasText: unique }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.dragTo(page.getByTestId('todo-view-done'));

    await expect.poll(async () => {
      const res = await request.get(`${API}/work-items/${id}`);
      const body = (await res.json()) as { data: { status: string } };
      return body.data.status;
    }, { timeout: 5000 }).toBe('done');
  } finally {
    await request.delete(`${API}/work-items/${id}`);
  }
});
