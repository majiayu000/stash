import { test, expect } from '@playwright/test';
import { clearPendingDrafts, E2E_API as API } from './helpers/ai-drafts';

test('Decision Inbox reviews AI decomposition drafts before creating child tasks', async ({ page, request }) => {
  await clearPendingDrafts(request);

  let nativeDialogSeen = false;
  page.on('dialog', async (dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  });

  const stamp = Date.now();
  const title = `e2e-ai-idea-${stamp}`;
  const create = await request.post(`${API}/work-items`, {
    data: { title, kind: 'idea', status: 'inbox' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/c/l/${id}`);
  await expect(page.getByTestId('td-title')).toHaveValue(title, { timeout: 10_000 });
  await page.getByTestId('td-ai-decompose').click();

  await expect(page.getByTestId('decision-inbox-dialog')).toBeVisible({ timeout: 10_000 });
  const card = page.getByTestId('decision-draft-card').first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('decision-draft-title')).toHaveValue(`Review ${title}`);
  await expect(card.getByTestId('decision-source-spans')).toContainText(title);

  await card.getByTestId('decision-draft-title').fill(`Accepted child for ${title}`);
  await page.getByRole('button', { name: 'accept selected' }).click();
  await expect(page.getByTestId('decision-inbox-dialog')).not.toBeVisible({ timeout: 10_000 });

  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}/subtasks`);
    const json = await res.json() as { data: Array<{ title: string; parentId?: string }> };
    return json.data.find((item) => item.title === `Accepted child for ${title}`)?.parentId;
  }, { timeout: 10_000 }).toBe(id);

  expect(nativeDialogSeen).toBe(false);
});

test('Idea decompose action shows provider errors inline', async ({ page, request }) => {
  await clearPendingDrafts(request);

  const stamp = Date.now();
  const title = `e2e-ai-provider-down-${stamp}`;
  const create = await request.post(`${API}/work-items`, {
    data: { title, kind: 'idea', status: 'inbox' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.route(`**/api/work-items/${id}/decompose`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider is unavailable' },
      }),
    });
  });

  await page.goto(`/c/l/${id}`);
  await page.getByTestId('td-ai-decompose').click();
  await expect(page.getByText(/AI provider is unavailable/)).toBeVisible({ timeout: 10_000 });
});
