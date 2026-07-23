import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

test('obsolete letter routes show an explicit not-found state', async ({ page }) => {
  await page.goto('/c/unknown');
  await expect(page.getByTestId('not-found')).toContainText('This route is no longer part of stash.');
  await expect(page.getByRole('link', { name: 'Return to Work' })).toHaveAttribute('href', '/');
});

test('session detail renders by provider-qualified session identity', async ({ page, request }) => {
  const res = await request.get(`${API}/agent-sessions`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: Array<{ id: string; provider: string; title: string }> };
  expect(body.data.length).toBeGreaterThan(0);
  const session = body.data[0]!;

  await page.goto(`/sessions/${session.provider}/${session.id}`);

  await expect(page.locator('.sd-head')).toContainText(session.title, { timeout: 10_000 });
  await expect.poll(() => new URL(page.url()).pathname)
    .toBe(`/sessions/${session.provider}/${session.id}`);
});

test('project detail renders by projectId', async ({ page, request }) => {
  const stamp = Date.now();
  const areaName = `e2e-route-project-${stamp}`;
  const createArea = await request.post(`${API}/areas`, { data: { name: areaName } });
  expect(createArea.ok()).toBeTruthy();
  const area = (await createArea.json()) as { data: { id: string } };
  const projectId = area.data.id;

  const intentText = `e2e route intent ${stamp}`;
  const setIntent = await request.put(`${API}/projects/${projectId}/intent`, { data: { text: intentText } });
  expect(setIntent.ok()).toBeTruthy();

  const createItem = await request.post(`${API}/work-items`, {
    data: { title: `e2e route seed ${stamp}`, projectId, areaId: projectId },
  });
  expect(createItem.ok()).toBeTruthy();

  await page.goto(`/projects/${projectId}`);

  await expect(page.getByText(areaName).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(intentText)).toBeVisible({ timeout: 10_000 });
});

test('task detail renders by workItemId', async ({ page, request }) => {
  const stamp = Date.now();
  const title = `e2e-route-work-item-${stamp}`;
  const create = await request.post(`${API}/work-items`, { data: { title } });
  expect(create.ok()).toBeTruthy();
  const body = (await create.json()) as { data: { id: string } };

  await page.goto(`/todos/${body.data.id}`);

  await expect(page.getByTestId('td-title')).toHaveValue(title, { timeout: 10_000 });
});
