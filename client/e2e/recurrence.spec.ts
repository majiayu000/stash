import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

/**
 * v0.6 — recurrence + reminder pickers on ConceptL save through to API.
 *
 * 1. Create a work item via API.
 * 2. Open /c/l/:id, change "repeats" to "daily".
 * 3. API reports recurrence.type === 'rrule' AND freq === 'DAILY'.
 */
test('ConceptL: recurrence picker writes recurrence to API', async ({ page, request }) => {
  const stamp = Date.now();
  const create = await request.post(`${API}/work-items`, { data: { title: `e2e-recur-${stamp}` } });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/c/l/${id}`);
  const select = page.getByTestId('td-repeat');
  await expect(select).toBeVisible({ timeout: 10_000 });

  await select.selectOption('daily');

  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}`);
    const json = (await res.json()) as { data: { recurrence?: { type: string; freq?: string } } };
    return json.data.recurrence;
  }, { timeout: 5000 }).toMatchObject({ type: 'rrule', freq: 'DAILY' });
});
