import { test, expect } from '@playwright/test';

/**
 * Slice 1 golden path:
 * 1. Open app → land on Overview.
 * 2. Navigate to Inbox.
 * 3. Capture a new thought.
 * 4. Select it and Plan today.
 * 5. Navigate to Todo, switch to Today view, verify it appears.
 */
test('capture → plan today → appears in Todo Today view', async ({ page }) => {
  await page.goto('/');

  // Land on Overview by default.
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // Navigate to Inbox.
  await page.getByRole('link', { name: 'Inbox', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

  // Capture a new thought.
  const unique = `e2e ${Date.now()}`;
  await page.getByTestId('capture-input').fill(unique);
  await page.getByTestId('capture-submit').click();

  // The new item should appear in the inbox list.
  const list = page.getByTestId('inbox-list');
  await expect(list.getByText(unique)).toBeVisible();

  // Plan today.
  await list.getByText(unique).click();
  await page.getByTestId('plan-today').click();

  // After planning today, the item leaves the inbox list.
  await expect(list.getByText(unique)).toHaveCount(0);

  // Navigate to Todo, switch to Today view.
  await page.getByRole('link', { name: 'Todo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Todo' })).toBeVisible();
  await page.getByTestId('view-today').click();

  // The item should appear in the today list.
  const taskList = page.getByTestId('task-list');
  await expect(taskList.getByText(unique)).toBeVisible();
});
