import { test, expect } from '@playwright/test';
import { clearPendingDrafts, E2E_API as API } from './helpers/ai-drafts';

test('Meeting triage imports source-spanned drafts and adopts them as work items', async ({ page, request }) => {
  await clearPendingDrafts(request);
  const note = `Priya owns launch copy ${Date.now()}`;

  await page.goto('/');
  await page.getByTestId('decision-inbox-button').click();
  await expect(page.getByTestId('decision-inbox-dialog')).toBeVisible();
  await page.getByTestId('meeting-import-text').fill(note);
  await page.getByTestId('meeting-import-submit').click();

  const card = page.getByTestId('decision-draft-card').first();
  await expect(card.getByTestId('decision-source-spans')).toContainText(note, { timeout: 10_000 });
  await expect(card.getByTestId('decision-draft-title')).toHaveValue('Follow up from meeting');

  await page.getByRole('button', { name: 'accept all' }).click();
  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items?status=inbox`);
    const json = await res.json() as { data: Array<{ title: string; parentId?: string }> };
    const found = json.data.find((item) => item.title === 'Follow up from meeting');
    return found ? (found.parentId ?? 'no-parent') : 'missing';
  }, { timeout: 10_000 }).toBe('no-parent');
});

test('Meeting triage blocks high-risk drafts from safe auto-adopt', async ({ page, request }) => {
  await clearPendingDrafts(request);

  await page.goto('/');
  await page.getByTestId('decision-inbox-button').click();
  await page.getByTestId('meeting-import-text').fill('Alex said delete production database after export.');
  await page.getByTestId('meeting-import-submit').click();

  const card = page.getByTestId('decision-draft-card').first();
  await expect(card.getByTestId('decision-review-flags')).toContainText('high risk', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'accept safe' })).toBeDisabled();
});
