import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

test('Task coach summarizes to journal only after confirmation', async ({ page, request }) => {
  const stamp = Date.now();
  const title = `e2e-coach-task-${stamp}`;
  const create = await request.post(`${API}/work-items`, {
    data: { title, kind: 'task', status: 'planned' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/c/l/${id}`);
  await expect(page.getByTestId('task-coach-panel')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('coach-input').fill('What is the next step?');
  await page.keyboard.press('Enter');

  await expect(page.getByText(new RegExp(`Start by clarifying the next step for ${title}`))).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('coach-summarize').click();
  await expect(page.getByText(`AI summary for ${title}`)).toBeVisible({ timeout: 10_000 });

  const beforeApply = await request.get(`${API}/work-items/${id}/journal`);
  expect(((await beforeApply.json()) as { data: unknown[] }).data).toEqual([]);

  await page.getByTestId('coach-apply-summary').click();
  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}/journal`);
    const json = await res.json() as { data: Array<{ body: string }> };
    return json.data.some((entry) => entry.body === `AI summary for ${title}`);
  }, { timeout: 10_000 }).toBe(true);
});
