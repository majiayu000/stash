import { test, expect } from '@playwright/test';
import { API } from './api';

test('Quick Capture dialog traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/');

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

test('mobile viewport reaches home, capture, search, project detail, and todo detail', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const stamp = Date.now();
  const areaName = `mobile-project-${stamp}`;
  const areaRes = await request.post(`${API}/areas`, { data: { name: areaName } });
  expect(areaRes.ok()).toBeTruthy();
  const area = await areaRes.json() as { data: { id: string } };

  const itemTitle = `mobile todo ${stamp}`;
  const itemRes = await request.post(`${API}/work-items`, {
    data: { title: itemTitle, projectId: area.data.id, areaId: area.data.id },
  });
  expect(itemRes.ok()).toBeTruthy();
  const item = await itemRes.json() as { data: { id: string } };

  await page.goto('/');
  await expect(page.getByTestId('concept-e')).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('c');
  await expect(page.getByRole('dialog', { name: 'quick capture' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('/');
  await expect(page.getByRole('dialog', { name: 'search' })).toHaveAttribute('aria-modal', 'true');
  await page.getByTestId('sp-input').fill(itemTitle);
  await expect(page.getByRole('button', { name: new RegExp(itemTitle) })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');

  await page.goto(`/c/k/${area.data.id}`);
  await expect(page.getByTestId('concept-k')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(areaName).first()).toBeVisible();

  await page.goto(`/c/l/${item.data.id}`);
  await expect(page.getByTestId('concept-l')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('td-title')).toHaveValue(itemTitle);
});
