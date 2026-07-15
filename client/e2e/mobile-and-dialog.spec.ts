import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

test('Quick Capture dialog traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('board-col-inbox')).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: 'quick capture' });
  const input = page.getByTestId('qc-input');

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(input).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Search dialog traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('board-col-inbox')).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'search' });
  const input = page.getByTestId('sp-input');

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(input).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('mobile viewport reaches home, capture, search, project detail, and todo detail', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const stamp = Date.now();
  const areaName = `mobile-project-${stamp}`;
  const areaRes = await request.post(`${API}/areas`, { data: { name: areaName } });
  expect(areaRes.ok()).toBeTruthy();
  const area = (await areaRes.json()) as { data: { id: string } };

  const itemTitle = `mobile todo ${stamp}`;
  const itemRes = await request.post(`${API}/work-items`, {
    data: { title: itemTitle, projectId: area.data.id, areaId: area.data.id },
  });
  expect(itemRes.ok()).toBeTruthy();
  const item = (await itemRes.json()) as { data: { id: string } };

  await page.goto('/');
  await expect(page.getByTestId('board-col-inbox')).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('c');
  await expect(page.getByRole('dialog', { name: 'quick capture' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('/');
  const searchDialog = page.getByRole('dialog', { name: 'search' });
  await expect(searchDialog).toHaveAttribute('aria-modal', 'true');
  await page.getByTestId('sp-input').fill(itemTitle);
  await expect(searchDialog.getByRole('button', { name: new RegExp(itemTitle) })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');

  await page.goto(`/projects/${area.data.id}`);
  await expect(page.getByText(areaName).first()).toBeVisible();
  const intent = page.getByTestId('kw-intent');
  await intent.scrollIntoViewIfNeeded();
  await expect(intent).toBeVisible({ timeout: 10_000 });

  await page.goto(`/todos/${item.data.id}`);
  await expect(page.getByTestId('td-title')).toHaveValue(itemTitle, { timeout: 10_000 });
});

test('todo detail has one page scroll and a responsive context rail', async ({ page, request }) => {
  const title = `responsive todo ${Date.now()}`;
  const itemRes = await request.post(`${API}/work-items`, { data: { title } });
  expect(itemRes.ok()).toBeTruthy();
  const item = (await itemRes.json()) as { data: { id: string } };

  await page.setViewportSize({ width: 1848, height: 1072 });
  await page.goto(`/todos/${item.data.id}`);
  await expect(page.getByTestId('todo-detail-page')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.td-overlay')).toHaveCount(0);

  const desktop = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.td-modal-main')!;
    const rail = document.querySelector<HTMLElement>('.td-modal-meta')!;
    const run = document.querySelector<HTMLElement>('.td-run')!;
    const promote = document.querySelector<HTMLElement>('.td-promote')!;
    const railRect = rail.getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
      mainOverflowY: getComputedStyle(main).overflowY,
      railOverflowY: getComputedStyle(rail).overflowY,
      railRight: railRect.right,
      viewportWidth: window.innerWidth,
      runBeforePromote: run.getBoundingClientRect().top < promote.getBoundingClientRect().top,
    };
  });
  expect(desktop.documentFits).toBe(true);
  expect(desktop.mainOverflowY).not.toBe('auto');
  expect(desktop.railOverflowY).not.toBe('auto');
  expect(desktop.railRight).toBeLessThanOrEqual(desktop.viewportWidth);
  expect(desktop.runBeforePromote).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.td-modal-main')!.getBoundingClientRect();
    const rail = document.querySelector<HTMLElement>('.td-modal-meta')!.getBoundingClientRect();
    const footer = document.querySelector<HTMLElement>('.td-modal-foot')!.getBoundingClientRect();
    const drafts = document.querySelector<HTMLElement>('.decision-inbox-affordance')!.getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
      railBelowMain: rail.top >= main.bottom - 1,
      railAligned: Math.abs(rail.left - main.left) < 1,
      footerVisibleAboveNav: footer.bottom <= window.innerHeight - 60,
      floatingControlsClearFooter: drafts.bottom <= footer.top,
    };
  });
  expect(mobile.documentFits).toBe(true);
  expect(mobile.railBelowMain).toBe(true);
  expect(mobile.railAligned).toBe(true);
  expect(mobile.footerVisibleAboveNav).toBe(true);
  expect(mobile.floatingControlsClearFooter).toBe(true);
});

test('narrow home and settings keep primary cards readable without column overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  const lanes = ['inbox', 'today', 'doing', 'later'].map((name) => page.getByTestId(`board-col-${name}`));
  for (const lane of lanes) {
    await expect(lane).toBeVisible({ timeout: 10_000 });
    const box = await lane.boundingBox();
    expect(box?.width).toBeGreaterThan(330);
  }
  const laneBoxes = await Promise.all(lanes.map((lane) => lane.boundingBox()));
  expect(laneBoxes[1]!.y).toBeGreaterThan(laneBoxes[0]!.y + laneBoxes[0]!.height - 1);

  await page.goto('/settings');
  const theme = page.getByTestId('theme-preview-cyber');
  await expect(theme).toBeVisible({ timeout: 10_000 });
  expect((await theme.boundingBox())?.width).toBeGreaterThan(330);
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();
});

test('mobile session detail stacks the transcript before its context sidebar', async ({ page, request }) => {
  const response = await request.get(`${API}/agent-sessions?provider=all`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: Array<{ id: string }> };
  expect(body.data.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/sessions/${body.data[0]!.id}`);
  await expect(page.getByTestId('session-detail-layout')).toBeVisible({ timeout: 10_000 });

  const geometry = await page.evaluate(() => {
    const transcript = document.querySelector<HTMLElement>('.transcript')!.getBoundingClientRect();
    const sidebar = document.querySelector<HTMLElement>('.sd-sidebar')!.getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
      transcriptWidth: transcript.width,
      sidebarBelowTranscript: sidebar.top >= transcript.bottom - 1,
      aligned: Math.abs(sidebar.left - transcript.left) < 1,
    };
  });

  expect(geometry.documentFits).toBe(true);
  expect(geometry.transcriptWidth).toBeGreaterThan(330);
  expect(geometry.sidebarBelowTranscript).toBe(true);
  expect(geometry.aligned).toBe(true);
});
