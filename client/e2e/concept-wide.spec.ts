import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

type ConceptMarker =
  | 'e'
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'prd';

interface SeededState {
  projectId: string;
  workItemId: string;
  sessionId: string;
}

const CONCEPT_MARKERS: Record<ConceptMarker, (page: Page) => Locator> = {
  e: (page) => page.getByTestId('board-col-inbox'),
  a: (page) => page.getByTestId('ca-capture-form'),
  b: (page) => page.locator('.sec-head', { hasText: 'session history' }),
  c: (page) => page.locator('.sec-head', { hasText: 'live stream' }),
  d: (page) => page.locator('.const-stage'),
  f: (page) => page.getByTestId('cf-name'),
  g: (page) => page.locator('.sec-head', { hasText: 'tokens' }),
  h: (page) => page.getByText(/no usage data yet|this month/i).first(),
  i: (page) => page.getByTestId('palette-input'),
  j: (page) => page.getByText(/\b\d{4}-W\d{2}\b/).first(),
  k: (page) => page.getByTestId('kw-intent'),
  l: (page) => page.getByTestId('td-title'),
  m: (page) => page.locator('.sk-tabs'),
  n: (page) => page.locator('h2', { hasText: 'appearance' }),
  o: (page) => page.getByTestId('ss-prompt'),
  prd: (page) => page.getByText(/Product Requirements/).first(),
};

async function seedState(request: APIRequestContext): Promise<SeededState> {
  const stamp = Date.now();
  const projectId = await createArea(request, `e2e-wide-${stamp}`);
  const workItemId = await createWorkItem(request, projectId, `e2e wide item ${stamp}`);
  const sessionId = await firstSessionId(request);
  return { projectId, workItemId, sessionId };
}

async function createArea(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post(`${API}/areas`, {
    data: { name, description: 'e2e concept-wide seed' },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data?: { id?: string }; id?: string };
  const id = body.data?.id ?? body.id;
  expect(id).toBeTruthy();
  return id!;
}

async function createWorkItem(
  request: APIRequestContext,
  projectId: string,
  title: string,
): Promise<string> {
  const res = await request.post(`${API}/work-items`, {
    data: { title, projectId, areaId: projectId, kind: 'task' },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data?: { id?: string }; id?: string };
  const id = body.data?.id ?? body.id;
  expect(id).toBeTruthy();
  return id!;
}

async function firstSessionId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/agent-sessions?provider=all`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const id = body.data?.[0]?.id;
  expect(id).toBeTruthy();
  return id!;
}

function fillRoute(route: string, state: SeededState): string {
  return route
    .replace(':projectId', encodeURIComponent(state.projectId))
    .replace(':workItemId', encodeURIComponent(state.workItemId))
    .replace(':sessionId', encodeURIComponent(state.sessionId));
}

async function expectRoute(page: Page, route: string, markerId: ConceptMarker) {
  await page.goto(route);
  await expect.poll(() => new URL(page.url()).pathname).toBe(route);
  await expect(page.locator('.dashboard-canvas')).toBeVisible({ timeout: 10_000 });
  await expect(CONCEPT_MARKERS[markerId](page)).toBeVisible({ timeout: 10_000 });
}

test('A/B/C/D/F/I/N/PRD golden routes render concept-specific UI', async ({ page, request }) => {
  await seedState(request);

  for (const [route, markerId] of [
    ['/c/a', 'a'],
    ['/c/b', 'b'],
    ['/c/c', 'c'],
    ['/c/d', 'd'],
    ['/c/f', 'f'],
    ['/c/i', 'i'],
    ['/c/n', 'n'],
    ['/c/prd', 'prd'],
  ] as const) {
    await expectRoute(page, route, markerId);
  }
});

test('connected object view links the main product pages', async ({ page, request }) => {
  await seedState(request);
  await page.goto('/');

  await expect(page.getByTestId('connected-flow')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary workflow' })).toHaveCount(0);
  await expect(page.getByTestId('concept-switcher')).toContainText(/Concepts · E/i);

  await page.getByTestId('flow-todo').click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/c\/l\//);
  await expect(CONCEPT_MARKERS.l(page)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('td-run').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/c/o');
  await expect(CONCEPT_MARKERS.o(page)).toBeVisible({ timeout: 10_000 });

  await page.goto('/');
  await page.getByTestId('flow-project').click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/c\/k\//);
  await expect(CONCEPT_MARKERS.k(page)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('kw-open-skills').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/c/m');
  await expect(CONCEPT_MARKERS.m(page)).toBeVisible({ timeout: 10_000 });

  await page.goto('/');
  await page.getByTestId('flow-project').click();
  await page.getByTestId('kw-start-session').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/c/o');
  await expect(CONCEPT_MARKERS.o(page)).toBeVisible({ timeout: 10_000 });

  await page.goto('/');
  await page.getByTestId('flow-session').click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/c\/g\//);
  await expect(CONCEPT_MARKERS.g(page)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'open analytics' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/c/h');
  await expect(CONCEPT_MARKERS.h(page)).toBeVisible({ timeout: 10_000 });

  await page.goto('/');
  await page.getByTestId('flow-review').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/c/j');
  await expect(CONCEPT_MARKERS.j(page)).toBeVisible({ timeout: 10_000 });

  await page.goto('/');
  await page.getByTestId('flow-burn').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/c/h');
  await expect(CONCEPT_MARKERS.h(page)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('burn-settings').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/c/n');
  await expect(CONCEPT_MARKERS.n(page)).toBeVisible({ timeout: 10_000 });
});

test('ConceptSwitcher clicks through all 16 concept entries', async ({ page, request }) => {
  await seedState(request);
  await page.goto('/');

  for (const entry of [
    { id: 'e', route: '/', marker: 'e' },
    { id: 'b', route: '/c/b', marker: 'b' },
    { id: 'a', route: '/c/a', marker: 'a' },
    { id: 'k', route: '/c/k', marker: 'k' },
    { id: 'g', route: '/c/g', marker: 'g' },
    { id: 'h', route: '/c/h', marker: 'h' },
    { id: 'l', route: '/c/l', marker: 'l' },
    { id: 'f', route: '/c/f', marker: 'f' },
    { id: 'm', route: '/c/m', marker: 'm' },
    { id: 'o', route: '/c/o', marker: 'o' },
    { id: 'i', route: '/c/i', marker: 'i' },
    { id: 'j', route: '/c/j', marker: 'j' },
    { id: 'd', route: '/c/d', marker: 'd' },
    { id: 'c', route: '/c/c', marker: 'c' },
    { id: 'n', route: '/c/n', marker: 'n' },
    { id: 'prd', route: '/c/prd', marker: 'prd' },
  ] as const) {
    const switcher = page.getByTestId('concept-switcher');
    if (!(await switcher.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await switcher.locator('summary').click();
    }
    await page.getByTestId(`concept-${entry.id}`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(entry.route);
    await expect(CONCEPT_MARKERS[entry.marker](page)).toBeVisible({ timeout: 10_000 });
  }
});

test('README concept route table resolves, including documented deep links', async ({ page, request }) => {
  const state = await seedState(request);

  for (const [routeTemplate, markerId] of [
    ['/', 'e'],
    ['/c/a', 'a'],
    ['/c/b', 'b'],
    ['/c/c', 'c'],
    ['/c/d', 'd'],
    ['/c/e', 'e'],
    ['/c/f', 'f'],
    ['/c/g/:sessionId', 'g'],
    ['/c/h', 'h'],
    ['/c/i', 'i'],
    ['/c/j', 'j'],
    ['/c/k/:projectId', 'k'],
    ['/c/l/:workItemId', 'l'],
    ['/c/m', 'm'],
    ['/c/n', 'n'],
    ['/c/o', 'o'],
    ['/c/prd', 'prd'],
  ] as const) {
    await expectRoute(page, fillRoute(routeTemplate, state), markerId);
  }
});
