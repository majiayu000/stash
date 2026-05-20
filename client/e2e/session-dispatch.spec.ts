import { test, expect } from '@playwright/test';
import { API } from './api';

/**
 * v1.0 — Concept O dispatch button composes a real prompt and either spawns
 * the CLI or returns the prompt + suggested command. We don't assert on
 * spawn-success (CI machines have no `claude` binary), only that the
 * round-trip happens and the result modal shows the composed prompt
 * containing the todo title.
 */
test('Concept O dispatch composes a prompt from a real todo', async ({ page, request }) => {
  const stamp = Date.now();
  const create = await request.post(`${API}/work-items`, {
    data: { title: `e2e-dispatch-${stamp}`, description: 'do the thing.' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/c/o?todoId=${id}`);

  const promptPreview = page.getByTestId('ss-prompt');
  await expect(promptPreview).toContainText(`e2e-dispatch-${stamp}`, { timeout: 10_000 });

  await page.getByTestId('dispatch-now').click();

  // Result modal renders the composed prompt — assertion proves the
  // /api/sessions/start round-trip succeeded.
  await expect(page.locator('pre').filter({ hasText: `# Task: e2e-dispatch-${stamp}` }).last()).toBeVisible({ timeout: 5000 });
});
