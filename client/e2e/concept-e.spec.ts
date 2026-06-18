import { test, expect } from '@playwright/test';

/**
 * ConceptE golden path:
 * 1. Open `/` → Concept E loads with real backend data
 * 2. Topbar wordmark "stash" visible
 * 3. 4 board columns visible: inbox / today / doing / later
 * 4. Capture an item via the capture row → it appears in the inbox column
 */
test('Concept E capture → item lands in inbox column', async ({ page }) => {
  await page.goto('/');

  // Topbar
  await expect(page.locator('.topbar-title')).toContainText('stash');

  // Four columns present
  await expect(page.getByTestId('board-col-inbox')).toBeVisible();
  await expect(page.getByTestId('board-col-today')).toBeVisible();
  await expect(page.getByTestId('board-col-doing')).toBeVisible();
  await expect(page.getByTestId('board-col-later')).toBeVisible();
  await expect(page.locator('.capture-placeholder')).toContainText('fix oauth callback edge case');
  await expect(page.getByTestId('capture-input')).toHaveAttribute('placeholder', '');

  // Capture an item
  const unique = `e2e ${Date.now()}`;
  await page.getByTestId('capture-input').fill(unique);
  await page.getByTestId('capture-submit').click();

  // Item appears in inbox column
  const inbox = page.getByTestId('board-col-inbox');
  await expect(inbox.getByText(unique)).toBeVisible();
});

test('Concept E column add uses the in-app dialog', async ({ page }) => {
  let nativeDialogSeen = false;
  page.on('dialog', async (dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  });

  await page.goto('/');
  const today = page.getByTestId('board-col-today');
  const unique = `e2e today ${Date.now()}`;

  await today.getByRole('button', { name: '+ add' }).click();
  await expect(page.getByRole('dialog', { name: 'new todo in today' })).toBeVisible();
  await page.getByTestId('ui-dialog-input').fill(unique);
  await page.getByTestId('ui-dialog-confirm').click();

  await expect(today.getByText(unique)).toBeVisible({ timeout: 10_000 });
  expect(nativeDialogSeen).toBe(false);
});
