import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

test('Systems: run template, complete run, and return to history', async ({ page, request }) => {
  const stamp = Date.now();
  const create = await request.post(`${API}/work-items`, {
    data: {
      title: `e2e-system-${stamp}`,
      kind: 'system',
      status: 'planned',
      checklist: [
        { id: `prep-${stamp}`, text: 'prep', completed: false },
        { id: `pack-${stamp}`, text: 'pack', completed: false },
      ],
    },
  });
  expect(create.ok()).toBeTruthy();
  const system = ((await create.json()) as { data: { id: string; title: string } }).data;

  await page.goto(`/c/l/${system.id}`);
  await expect(page.getByTestId('td-title')).toHaveValue(system.title, { timeout: 10_000 });
  await expect(page.getByTestId('td-done')).toBeDisabled();
  await expect(page.getByTestId('td-done')).toHaveText(/template only/);
  await expect(page.getByTestId('system-history')).toBeVisible();

  await page.getByTestId('system-run-button').click();

  let runId = '';
  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items?parentId=${system.id}&includeDropped=true`);
    const json = (await res.json()) as { data: Array<{ id: string; parentId?: string; kind: string; status: string; checklist: Array<{ id: string; completed: boolean }> }> };
    const run = json.data.find((item) => item.parentId === system.id);
    runId = run?.id ?? '';
    return run ? {
      kind: run.kind,
      status: run.status,
      unchecked: run.checklist.every((step) => step.completed === false),
    } : undefined;
  }, { timeout: 5000 }).toEqual({ kind: 'chore', status: 'active', unchecked: true });

  await expect(page).toHaveURL(new RegExp(`/c/l/${runId}`));

  const runRes = await request.get(`${API}/work-items/${runId}`);
  const run = ((await runRes.json()) as { data: { checklist: Array<{ id: string }> } }).data;
  await page.getByTestId(`td-cl-toggle-${run.checklist[0]!.id}`).click();
  await page.getByTestId('td-done').click();

  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${runId}`);
    const json = (await res.json()) as { data: { status: string; checklist: Array<{ completed: boolean }> } };
    return {
      status: json.data.status,
      firstDone: json.data.checklist[0]?.completed,
    };
  }, { timeout: 5000 }).toEqual({ status: 'done', firstDone: true });

  await page.goto(`/c/l/${system.id}`);
  await expect(page.getByTestId('system-history-run')).toContainText('done');
});

test('Quick Capture can create a System template with :system token', async ({ page, request }) => {
  const title = `e2e-capture-system-${Date.now()}`;
  await page.goto('/');
  await expect(page.getByTestId('board-col-inbox')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('c');
  await page.getByTestId('qc-input').fill(`${title} :system @routine`);

  await expect(page.locator('.qc-chip-kind')).toContainText('kind:system');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('qc-toast')).toBeVisible();

  const res = await request.get(`${API}/work-items?kind=system`);
  const json = await res.json() as { data: Array<{ title: string; kind: string; labels: string[] }> };
  const found = json.data.find((item) => item.title === title);
  expect(found).toBeTruthy();
  expect(found?.kind).toBe('system');
  expect(found?.labels).toContain('routine');
});
