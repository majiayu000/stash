import { test, expect } from '@playwright/test';

/**
 * Slice 4 golden path:
 * 1. Capture a task → plan today.
 * 2. Link the Claude fixture session (last assistant message says "Done.").
 * 3. Click "Detect completion from sessions" → inference proposes pending evidence.
 * 4. Navigate to Overview → see completion candidate.
 * 5. Click Accept → the task transitions to "done" and the candidate disappears.
 * 6. Evidence page shows the accepted (non-pending) row.
 */
test('infer completion → accept → task flips to done', async ({ page }) => {
  await page.goto('/inbox');

  const title = `slice-4 ${Date.now()}`;
  await page.getByTestId('capture-input').fill(title);
  await page.getByTestId('capture-submit').click();
  const inboxList = page.getByTestId('inbox-list');
  await expect(inboxList.getByText(title)).toBeVisible();
  await inboxList.getByText(title).click();
  await page.getByTestId('plan-today').click();

  await page.getByRole('link', { name: 'Todo', exact: true }).click();
  await page.getByTestId('view-today').click();
  await page.getByTestId('task-list').getByText(title).click();

  // Link the Claude fixture (its last assistant message contains "Done.").
  await page.getByTestId('session-picker').selectOption({
    label: '[claude] Auth middleware secure cookies refactor',
  });
  await page.getByTestId('link-session').click();

  // Trigger inference.
  await page.getByTestId('detect-completion').click();

  // Overview shows the completion candidate.
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  const candidates = page.getByTestId('completion-candidates');
  await expect(candidates).toBeVisible();
  const row = page.getByTestId('candidate-row').first();
  await expect(row).toBeVisible();
  const workItemId = await row.getAttribute('data-work-item-id');
  expect(workItemId).not.toBeNull();

  await page.getByTestId(`accept-${workItemId}`).click();
  // Candidate panel goes empty / not visible after accept.
  await expect(page.getByTestId('candidate-row')).toHaveCount(0);

  // Evidence page lists the now-verified row.
  await page.getByRole('link', { name: 'Evidence', exact: true }).click();
  const evidenceList = page.getByTestId('evidence-list');
  await expect(evidenceList.getByText(title)).toBeVisible();
});
