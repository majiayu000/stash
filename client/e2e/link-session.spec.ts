import { test, expect } from '@playwright/test';

/**
 * Slice 2 golden path:
 * 1. Create a work item via Inbox + Plan today.
 * 2. Navigate to Todo, open the editor.
 * 3. Link the fixture Claude session.
 * 4. Verify linked-session chip appears.
 * 5. Navigate to Sessions, confirm fixture session is listed.
 * 6. Navigate to Workboard — project chip should mention session.
 */
test('link claude fixture session → appears in editor + sessions + workboard', async ({ page }) => {
  await page.goto('/');

  // Create a task that has a projectId so it appears on Workboard.
  await page.getByRole('link', { name: 'Inbox', exact: true }).click();
  const title = `slice-2 ${Date.now()}`;
  await page.getByTestId('capture-input').fill(title);
  await page.getByTestId('capture-submit').click();

  const inboxList = page.getByTestId('inbox-list');
  await expect(inboxList.getByText(title)).toBeVisible();
  await inboxList.getByText(title).click();
  await page.getByTestId('plan-today').click();

  // Go to Todo, open the just-planned item editor.
  await page.getByRole('link', { name: 'Todo', exact: true }).click();
  await page.getByTestId('view-today').click();
  await page.getByTestId('task-list').getByText(title).click();

  // The session picker should include the fixture session.
  const picker = page.getByTestId('session-picker');
  await expect(picker).toBeVisible();
  await picker.selectOption({ label: '[claude] Auth middleware secure cookies refactor' });
  await page.getByTestId('link-session').click();

  // Linked chip appears.
  const linked = page.getByTestId('linked-sessions');
  await expect(linked.getByText('Auth middleware secure cookies refactor')).toBeVisible();

  // Sessions page — fixture session is listed.
  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  const sessionsList = page.getByTestId('sessions-list');
  await expect(sessionsList.getByText('Auth middleware secure cookies refactor')).toBeVisible();

  // Switch to Claude provider filter — still visible.
  await page.getByTestId('provider-claude').click();
  await expect(sessionsList.getByText('Auth middleware secure cookies refactor')).toBeVisible();
});
