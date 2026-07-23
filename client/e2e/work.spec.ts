import { test, expect } from '@playwright/test';

/**
 * Work page golden path:
 * 1. Open `/` with real backend data
 * 2. Topbar wordmark "stash" visible
 * 3. 4 board columns visible: inbox / today / doing / later
 * 4. Capture an item via the capture row → it appears in the inbox column
 */
test('Work capture adds an item to Inbox', async ({ page }) => {
  await page.goto('/');

  // Topbar
  await expect(page.locator('.topbar-title')).toContainText('stash');

  // Four columns present
  await expect(page.getByTestId('board-col-inbox')).toBeVisible();
  await expect(page.getByTestId('board-col-today')).toBeVisible();
  await expect(page.getByTestId('board-col-doing')).toBeVisible();
  await expect(page.getByTestId('board-col-later')).toBeVisible();
  await expect(page.locator('.capture-placeholder')).toContainText('fix oauth callback edge case');
  await expect(page.getByTestId('capture-input')).toHaveAttribute('placeholder', '');

  // Capture an item
  const unique = `e2e ${Date.now()}`;
  await page.getByTestId('capture-input').fill(unique);
  await page.getByTestId('capture-submit').click();

  // Item appears in inbox column
  const inbox = page.getByTestId('board-col-inbox');
  await expect(inbox.getByText(unique)).toBeVisible();
});

test('Work column add uses the in-app dialog', async ({ page }) => {
  let nativeDialogSeen = false;
  page.on('dialog', async (dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  });

  await page.goto('/');
  const today = page.getByTestId('board-col-today');
  const unique = `e2e today ${Date.now()}`;

  await today.getByRole('button', { name: '+ add' }).click();
  await expect(page.getByRole('dialog', { name: 'new todo in today' })).toBeVisible();
  await page.getByTestId('ui-dialog-input').fill(unique);
  await page.getByTestId('ui-dialog-confirm').click();

  await expect(today.getByText(unique)).toBeVisible({ timeout: 10_000 });
  expect(nativeDialogSeen).toBe(false);
});

/**
 * GH #103 — the hero capture legend must teach the same grammar the parser
 * implements (#project / @tag / ^p0..^p3 priority / !today schedule).
 */
test('Work capture legend matches the parser grammar end-to-end', async ({ page }) => {
  const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

  await page.goto('/');
  const hints = page.locator('.capture-hints');
  await expect(hints).toBeVisible();

  // legend advertises the real tokens…
  await expect(hints).toContainText('^p0..^p3');
  await expect(hints).toContainText('!today');
  await expect(hints).toContainText('@tag');
  // …and no longer the contradictory ones (`!` as priority, `@today` as when)
  await expect(hints).not.toContainText('@today');
  await expect(hints).not.toContainText('💡');
  await expect(page.locator('.capture-placeholder')).not.toContainText('!high');

  // capturing with the advertised grammar produces the advertised result
  const unique = `e2e legend ${Date.now()}`;
  await page.getByTestId('capture-input').fill(`${unique} ^p1 !today @legendcheck`);
  await page.getByTestId('capture-submit').click();
  await expect(page.getByTestId('board-col-inbox').getByText(unique)).toBeVisible();

  const res = await page.request.get(`${API}/work-items`);
  expect(res.ok()).toBe(true);
  const { data } = await res.json();
  const item = data.find((w: { title: string }) => w.title === unique);
  expect(item, 'captured item should be queryable').toBeTruthy();
  expect(item.priority).toBe('p1');
  expect(item.labels).toContain('legendcheck');
  const runtimeRes = await page.request.get(`${API}/runtime`);
  expect(runtimeRes.ok()).toBe(true);
  const runtime = await runtimeRes.json() as { calendarDate: string };
  expect(item.scheduledFor).toBe(runtime.calendarDate);
});

/**
 * GH #104/#105 — the default home prioritizes capture + board, while context
 * cards stay available behind a persisted disclosure and priority is readable
 * without color.
 */
test('Work first viewport is task-first with semantic priority labels', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('stash:e2e:insights-init') === '1') return;
    window.localStorage.removeItem('stash:work:insights-open');
    window.sessionStorage.setItem('stash:e2e:insights-init', '1');
  });
  await page.goto('/', { waitUntil: 'networkidle' });

  const topbarStats = page.getByTestId('topbar-stats');
  await expect(topbarStats).toContainText('inbox');
  await expect(topbarStats).toContainText('today');
  await expect(topbarStats).toContainText('p0/p1');
  await expect(topbarStats).not.toContainText('tokens');
  await expect(topbarStats).not.toContainText('cost');

  const board = page.getByTestId('work-board-shell');
  await expect(board).toBeVisible();
  const boardBox = await board.boundingBox();
  expect(boardBox, 'board should have a stable first-viewport box').toBeTruthy();
  expect((boardBox?.y ?? 0) + (boardBox?.height ?? 0)).toBeLessThanOrEqual(900);

  const insights = page.getByTestId('ce-insights');
  await expect(insights.locator('.ce-insights-summary')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('connected-flow')).toBeHidden();

  await insights.locator('.ce-insights-summary').click();
  await expect(insights.locator('.ce-insights-summary')).toHaveAttribute('aria-expanded', 'true');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('ce-insights').locator('.ce-insights-summary')).toHaveAttribute('aria-expanded', 'true');

  const unique = `e2e priority ${Date.now()}`;
  await page.getByTestId('capture-input').fill(`${unique} ^p1`);
  await page.getByTestId('capture-submit').click();
  const row = page.getByTestId('board-col-inbox').getByText(unique).locator('xpath=ancestor::*[contains(@class, "todo")]');
  await expect(row.locator('.todo-prio')).toHaveText('P1');
});

test('Work scroll regions stay subtle and project cards align with the live summary', async ({ page }) => {
  await page.setViewportSize({ width: 1848, height: 1072 });
  await page.addInitScript(() => window.localStorage.setItem('stash:theme', 'mono'));
  await page.goto('/');

  const projectRegion = page.getByTestId('project-scroll-region');
  const project = projectRegion.locator('.proj-chip').first();
  const liveSummary = page.locator('.ce-side-rail .surface');
  await expect(project).toBeVisible({ timeout: 10_000 });
  await expect(liveSummary).toBeVisible();

  const geometry = await page.evaluate(() => {
    const region = document.querySelector<HTMLElement>('[data-testid="project-scroll-region"]')!;
    const projectRect = region.querySelector<HTMLElement>('.proj-chip')!.getBoundingClientRect();
    const liveRect = document.querySelector<HTMLElement>('.ce-side-rail .surface')!.getBoundingClientRect();
    const scrollbar = getComputedStyle(region, '::-webkit-scrollbar');
    return {
      rightEdgeDifference: Math.abs(projectRect.right - liveRect.right),
      standardWidth: getComputedStyle(region).scrollbarWidth,
      webkitWidth: scrollbar.width,
      laterUsesSharedStyle: document.querySelector('[data-testid="board-col-later"] .board-col-body')?.classList.contains('work-scroll-region'),
      doneUsesSharedStyle: document.querySelector('.done-drop-list')?.classList.contains('work-scroll-region'),
    };
  });

  expect(geometry.rightEdgeDifference).toBeLessThan(1);
  expect(geometry.standardWidth).toBe('thin');
  expect(geometry.webkitWidth).toBe('4px');
  expect(geometry.laterUsesSharedStyle).toBe(true);
  expect(geometry.doneUsesSharedStyle).toBe(true);
});
