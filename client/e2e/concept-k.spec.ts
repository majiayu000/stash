import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

/**
 * Concept K golden path:
 * 1. Create an area + set its intent via API
 * 2. Open `/c/k/:projectId`
 * 3. Project name appears in the hero
 * 4. Intent text from the backend renders in the intent block
 */
test('Concept K renders project intent for a specific project', async ({ page, request }) => {
  // Pick a unique area name so the test is rerun-safe (areas have unique names).
  const areaName = `e2e-project-${Date.now()}`;
  const createArea = await request.post(`${API}/areas`, { data: { name: areaName } });
  expect(createArea.ok()).toBeTruthy();
  const area = await createArea.json();
  const id = area.data?.id ?? area.id;
  expect(id).toBeTruthy();

  const intentText = `e2e intent ${Date.now()}`;
  const setIntent = await request.put(`${API}/projects/${id}/intent`, { data: { text: intentText } });
  expect(setIntent.ok()).toBeTruthy();

  // WBData's projects list comes from /api/workboard, which only includes projects
  // with at least one work item. Add one so Concept K can find the project.
  const createItem = await request.post(`${API}/work-items`, {
    data: { title: `e2e seed ${Date.now()}`, projectId: id, areaId: id },
  });
  expect(createItem.ok()).toBeTruthy();

  await page.goto(`/c/k/${id}`);

  await expect(page.locator('.topbar-title')).toContainText('stash');
  await expect(page.getByText(areaName).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(intentText)).toBeVisible({ timeout: 10_000 });
});
