import { test, expect } from '@playwright/test';

/**
 * Slice 3 golden path:
 * 1. Sessions page with provider=all shows both Claude + Codex fixture sessions.
 * 2. Filter Codex-only → see Codex fixture, not Claude.
 * 3. Filter Claude-only → see Claude fixture, not Codex.
 * 4. Selecting the Codex session loads its transcript with user/assistant/tool events.
 */
test('codex adapter — provider toggle filters sessions; transcript loads', async ({ page }) => {
  await page.goto('/sessions');
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();

  const list = page.getByTestId('sessions-list');
  await expect(
    list.getByText('Auth middleware secure cookies refactor'),
  ).toBeVisible();
  await expect(
    list.getByText('Inline a fix for the demo-codex memory leak in cache.ts'),
  ).toBeVisible();

  // Codex-only.
  await page.getByTestId('provider-codex').click();
  await expect(
    list.getByText('Inline a fix for the demo-codex memory leak in cache.ts'),
  ).toBeVisible();
  await expect(
    list.getByText('Auth middleware secure cookies refactor'),
  ).toHaveCount(0);

  // Open the Codex session and verify its transcript.
  await list.getByText('Inline a fix for the demo-codex memory leak in cache.ts').click();
  const events = page.getByTestId('transcript-events');
  await expect(events.getByText('Applied the patch and verified cache no longer leaks.')).toBeVisible();

  // Claude-only.
  await page.getByTestId('provider-claude').click();
  await expect(
    list.getByText('Auth middleware secure cookies refactor'),
  ).toBeVisible();
  await expect(
    list.getByText('Inline a fix for the demo-codex memory leak in cache.ts'),
  ).toHaveCount(0);
});
