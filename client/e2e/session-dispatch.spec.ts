import { test, expect } from '@playwright/test';

const API = 'http://localhost:4174/api';

/**
 * v1.1 — Concept O dispatch button composes a real prompt through
 * /api/sessions/start while Playwright runs the server with agent spawning
 * disabled. The assertion proves the result modal renders without launching
 * a local Claude/Codex CLI.
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

  // Result modal renders the composed prompt without a spawned CLI.
  await expect(page.getByText('prompt composed (cli not spawned)')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('dispatch-result-prompt')).toContainText(`# Task: e2e-dispatch-${stamp}`);
});
