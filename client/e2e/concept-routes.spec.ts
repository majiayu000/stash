import { test, expect, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:4174/api';

const CONCEPTS = [
  'e',
  'b',
  'a',
  'k',
  'g',
  'h',
  'l',
  'f',
  'm',
  'o',
  'i',
  'j',
  'd',
  'c',
  'n',
  'prd',
] as const;

function routeFor(id: (typeof CONCEPTS)[number]): string {
  return id === 'e' ? '/' : `/c/${id}`;
}

const ROUTES = [
  { id: 'e', path: '/' },
  { id: 'e', path: '/c/e' },
  ...CONCEPTS.filter((id) => id !== 'e').map((id) => ({ id, path: routeFor(id) })),
] as const;

interface RouteSeed {
  areaId: string;
  areaName: string;
  itemId: string;
  itemTitle: string;
}

async function seedRouteSmoke(request: APIRequestContext, prefix = 'route-smoke'): Promise<RouteSeed> {
  const stamp = Date.now();
  const areaName = `${prefix}-${stamp}`;
  const itemTitle = `${prefix} item ${stamp}`;
  const area = await request.post(`${API}/areas`, { data: { name: areaName } });
  expect(area.ok()).toBeTruthy();
  const areaId = ((await area.json()) as { data: { id: string } }).data.id;
  const item = await request.post(`${API}/work-items`, {
    data: { title: itemTitle, projectId: areaId, areaId },
  });
  expect(item.ok()).toBeTruthy();
  const itemId = ((await item.json()) as { data: { id: string } }).data.id;
  return { areaId, areaName, itemId, itemTitle };
}

test.beforeEach(async ({ request }) => {
  await seedRouteSmoke(request);
});

test('all concept routes render a dashboard canvas', async ({ page }) => {
  for (const { id, path } of ROUTES) {
    await page.goto(path);
    await expect(page.getByTestId(`concept-${id}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.dashboard-canvas')).toBeVisible();
    await expect(page.getByText('Failed to load data')).toHaveCount(0);
  }
});

test('concept switcher can click through all 16 entries', async ({ page }) => {
  await page.goto('/');

  for (const id of CONCEPTS) {
    await page.getByTestId(`concept-${id}`).click();
    await expect(page).toHaveURL(new RegExp(`${routeFor(id).replace('/', '\\/')}$`));
    await expect(page.locator('.dashboard-canvas')).toBeVisible();
  }
});

test('session detail deep link resolves with the canonical route', async ({ page, request }) => {
  const res = await request.get(`${API}/agent-sessions?provider=all`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as { data: Array<{ id: string; title: string }> };
  const session = body.data[0];
  if (!session) {
    throw new Error('expected at least one fixture agent session');
  }

  await page.goto(`/c/g/${encodeURIComponent(session.id)}`);

  await expect(page.locator('.topbar-title')).toContainText('stash');
  await expect(page.getByText(session.title || '(untitled session)').first()).toBeVisible({ timeout: 10_000 });
});

test('invalid concept ids render a recoverable state instead of a blank page', async ({ page }) => {
  await page.goto('/c/unknown');

  await expect(page.getByTestId('unknown-concept')).toBeVisible();
  await expect(page.getByText('unknown concept')).toBeVisible();
  await expect(page.getByRole('link', { name: 'open daily home' })).toHaveAttribute('href', '/');
});

test('project and todo detail deep links resolve semantic route params', async ({ page, request }) => {
  const seed = await seedRouteSmoke(request, 'route-detail');

  await page.goto(`/c/k/${encodeURIComponent(seed.areaId)}`);
  await expect(page.locator('.dashboard-canvas')).toBeVisible();
  await expect(page.getByText(seed.areaName).first()).toBeVisible({ timeout: 10_000 });

  await page.goto(`/c/l/${encodeURIComponent(seed.itemId)}`);
  await expect(page.locator('.dashboard-canvas')).toBeVisible();
  await expect(page.getByTestId('td-title')).toHaveValue(seed.itemTitle, { timeout: 10_000 });
});
