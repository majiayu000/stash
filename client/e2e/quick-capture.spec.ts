import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

/**
 * SPEC v0.3 §3f — Quick Capture modal end-to-end.
 *
 * 1. Open Work at `/`.
 * 2. Press `c` — modal opens.
 * 3. Type a token-rich title.
 * 4. See token preview chips.
 * 5. Press Enter — toast appears.
 * 6. Verify via API that the item landed with parsed fields.
 */
test('Quick Capture parses inline tokens and lands a structured work item', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('.topbar-title')).toContainText('stash');

  const unique = `e2e-cap-${Date.now()}`;
  await page.keyboard.press('c');
  await expect(page.getByTestId('qc-input')).toBeVisible();

  await page.getByTestId('qc-input').fill(`${unique} ^p1 !tomorrow 20:30 @e2e *45m`);

  // Server-owned normalized chips render in preview.
  await expect(page.locator('.qc-chip-pri')).toContainText('^p1');
  await expect(page.locator('.qc-chip-date')).toContainText('scheduled');
  await expect(page.locator('.qc-chip-time')).toContainText('20:30');
  await expect(page.locator('.qc-chip-tag')).toContainText('@e2e');
  await expect(page.locator('.qc-chip-est')).toContainText('45m');

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('qc-toast')).toBeVisible();

  // Verify via API
  const res = await request.get(`${API}/work-items?status=inbox`);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const found = (json.data as Array<{ title: string; priority: string; labels: string[]; estimateMinutes?: number; scheduledFor?: string; startAt?: string }>)
    .find((it) => it.title === unique);
  expect(found).toBeTruthy();
  expect(found?.priority).toBe('p1');
  expect(found?.labels).toContain('e2e');
  expect(found?.estimateMinutes).toBe(45);
  expect(found?.scheduledFor).toBeTruthy();
  expect(found?.startAt).toContain('20:30');
});
