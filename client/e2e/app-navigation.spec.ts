import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

type PageMarker =
  | 'work'
  | 'projects'
  | 'project-form'
  | 'project-detail'
  | 'sessions'
  | 'session-start'
  | 'session-detail'
  | 'review'
  | 'usage'
  | 'settings'
  | 'skills'
  | 'todo-detail';

interface SeededState {
  projectId: string;
  workItemId: string;
  sessionId: string;
}

const PAGE_MARKERS: Record<PageMarker, (page: Page) => Locator> = {
  work: (page) => page.getByTestId('board-col-inbox'),
  projects: (page) => page.locator('.projects-page'),
  'project-form': (page) => page.getByTestId('cf-name'),
  'project-detail': (page) => page.getByTestId('kw-intent'),
  sessions: (page) => page.locator('.sessions-page'),
  'session-start': (page) => page.getByTestId('ss-prompt'),
  'session-detail': (page) => page.getByTestId('estimated-session-metrics'),
  review: (page) => page.getByText(/\b\d{4}-W\d{2}\b/).first(),
  usage: (page) => page.getByText(/no usage data yet|last 30 days/i).first(),
  settings: (page) => page.locator('h2', { hasText: 'appearance' }),
  skills: (page) => page.locator('.sk-tabs'),
  'todo-detail': (page) => page.getByTestId('td-title'),
};

async function seedState(request: APIRequestContext): Promise<SeededState> {
  const stamp = Date.now();
  const projectId = await createArea(request, `e2e-navigation-${stamp}`);
  const workItemId = await createWorkItem(request, projectId, `e2e navigation item ${stamp}`);
  await createSkill(request, stamp);
  const sessionId = await firstSessionId(request);
  return { projectId, workItemId, sessionId };
}

async function createSkill(request: APIRequestContext, stamp: number): Promise<void> {
  const response = await request.post(`${API}/skills`, {
    data: { id: `e2e-navigation-${stamp}`, name: `Navigation skill ${stamp}`, emoji: '🧭', installed: true },
  });
  expect(response.ok()).toBeTruthy();
}

async function createArea(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.post(`${API}/areas`, {
    data: { name, description: 'navigation seed' },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data?: { id?: string }; id?: string };
  const id = body.data?.id ?? body.id;
  expect(id).toBeTruthy();
  return id!;
}

async function createWorkItem(request: APIRequestContext, projectId: string, title: string): Promise<string> {
  const response = await request.post(`${API}/work-items`, {
    data: { title, projectId, areaId: projectId, kind: 'task' },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data?: { id?: string }; id?: string };
  const id = body.data?.id ?? body.id;
  expect(id).toBeTruthy();
  return id!;
}

async function firstSessionId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API}/agent-sessions?provider=all`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  const id = body.data?.[0]?.id;
  expect(id).toBeTruthy();
  return id!;
}

async function expectRoute(page: Page, route: string, marker: PageMarker) {
  await page.goto(route);
  await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(route, 'http://stash.local').pathname);
  await expect(PAGE_MARKERS[marker](page)).toBeVisible({ timeout: 10_000 });
}

async function openWorkContext(page: Page) {
  const connectedFlow = page.getByTestId('connected-flow');
  if (!(await connectedFlow.isVisible())) {
    await page.getByTestId('ce-insights').locator('.ce-insights-summary').click();
  }
  await expect(connectedFlow).toBeVisible({ timeout: 10_000 });
}

test('primary navigation exposes only the five stable product sections', async ({ page, request }) => {
  await seedState(request);
  await page.goto('/');

  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveCount(6); // brand + five sections
  for (const entry of [
    { id: 'work', route: '/', marker: 'work' },
    { id: 'projects', route: '/projects', marker: 'projects' },
    { id: 'sessions', route: '/sessions', marker: 'sessions' },
    { id: 'review', route: '/review', marker: 'review' },
    { id: 'settings', route: '/settings', marker: 'settings' },
  ] as const) {
    await page.getByTestId(`nav-${entry.id}`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(entry.route);
    await expect(PAGE_MARKERS[entry.marker](page)).toBeVisible({ timeout: 10_000 });
  }
});

test('semantic routes cover sections, entity details, and contextual actions', async ({ page, request }) => {
  const state = await seedState(request);

  for (const [route, marker] of [
    ['/', 'work'],
    ['/projects', 'projects'],
    ['/projects/new', 'project-form'],
    [`/projects/${state.projectId}`, 'project-detail'],
    [`/projects/${state.projectId}/settings`, 'project-detail'],
    ['/sessions', 'sessions'],
    [`/sessions/new?todoId=${state.workItemId}`, 'session-start'],
    [`/sessions/${state.sessionId}`, 'session-detail'],
    [`/todos/${state.workItemId}`, 'todo-detail'],
    ['/review', 'review'],
    ['/review/usage', 'usage'],
    ['/settings', 'settings'],
    ['/settings/skills', 'skills'],
  ] as const) {
    const expectedMarker = route.includes('/settings') && route.includes(state.projectId)
      ? 'project-detail'
      : marker;
    if (route === `/projects/${state.projectId}/settings`) {
      await page.goto(route);
      await expect(page.getByTestId('cf-edit-name')).toBeVisible({ timeout: 10_000 });
    } else {
      await expectRoute(page, route, expectedMarker);
    }
  }

  await page.goto('/c/a');
  await expect(page.getByTestId('not-found')).toBeVisible();
});

test('project creation persists only durable fields and opens the created project', async ({ page, request }) => {
  await seedState(request);
  await page.goto('/projects/new');

  const name = `e2e-durable-project-${Date.now()}`;
  await page.getByTestId('cf-name').fill(name);
  await page.getByTestId('cf-desc').fill('durable settings only');
  await page.getByTestId('cf-cadence-daily').click();
  await page.getByTestId('cf-scaffold').click();

  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/projects\//);
  await expect(page.locator('.kw-name')).toHaveText(name, { timeout: 10_000 });
  await expect.poll(async () => {
    const response = await request.get(`${API}/areas`);
    const body = (await response.json()) as { data: Array<{ name: string; description?: string; reviewCadence: string }> };
    return body.data.find((area) => area.name === name);
  }).toMatchObject({ name, description: 'durable settings only', reviewCadence: 'daily' });
});

test('connected work cards preserve task, project, session, and review context', async ({ page, request }) => {
  const state = await seedState(request);
  await page.goto('/');
  await openWorkContext(page);

  await page.getByTestId('flow-todo').click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/todos\//);
  await expect(PAGE_MARKERS['todo-detail'](page)).toBeVisible();
  await page.getByTestId('td-run').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/sessions/new');
  await expect(PAGE_MARKERS['session-start'](page)).toBeVisible();

  await page.goto('/');
  await openWorkContext(page);
  await page.getByTestId('flow-project').click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/projects\//);
  await expect(PAGE_MARKERS['project-detail'](page)).toBeVisible();
  await page.getByTestId('kw-open-skills').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/settings/skills');
  await expect.poll(() => new URL(page.url()).searchParams.get('projectId')).toBe(state.projectId);
  await expect(PAGE_MARKERS.skills(page)).toBeVisible();
  await expect(page.getByTestId('skills-project-context')).toHaveAttribute('data-project-id', state.projectId, { timeout: 10_000 });
  await expect(page.getByTestId(`skill-binding-${state.projectId}`).first()).toHaveAttribute('data-focused', 'true');

  await page.goto('/');
  await openWorkContext(page);
  await page.getByTestId('flow-session').click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/sessions\//);
  await page.getByRole('button', { name: 'open analytics' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/review/usage');

  await page.goto('/');
  await openWorkContext(page);
  await page.getByTestId('flow-review').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/review');
});
