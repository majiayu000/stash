import { test, expect } from '@playwright/test';

const API = 'http://localhost:4174/api';

test('invalid concept ids render a recoverable state', async ({ page }) => {
  await page.goto('/c/unknown');

  const recovery = page.getByTestId('unknown-concept-state');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('/c/unknown is not a valid workbench page');
  await expect(page.getByRole('link', { name: /open default/i })).toHaveAttribute('href', '/');
});

test('G detail route renders a session by sessionId', async ({ page, request }) => {
  const res = await request.get(`${API}/agent-sessions`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: Array<{ id: string; title: string }> };
  expect(body.data.length).toBeGreaterThan(0);
  const session = body.data[0]!;

  await page.goto(`/c/g/${session.id}`);

  await expect(page.locator('.sd-head')).toContainText(session.title, { timeout: 10_000 });
});

test('K detail route renders a project by projectId', async ({ page, request }) => {
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

  await page.goto(`/c/k/${projectId}`);

  await expect(page.getByText(areaName).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(intentText)).toBeVisible({ timeout: 10_000 });
});

test('L detail route renders a work item by workItemId', async ({ page, request }) => {
  const stamp = Date.now();
  const title = `e2e-route-work-item-${stamp}`;
  const create = await request.post(`${API}/work-items`, { data: { title } });
  expect(create.ok()).toBeTruthy();
  const body = (await create.json()) as { data: { id: string } };

  await page.goto(`/c/l/${body.data.id}`);

  await expect(page.getByTestId('td-title')).toHaveValue(title, { timeout: 10_000 });
});
