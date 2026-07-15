import { test, expect } from '@playwright/test';

const API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

/**
 * v0.4 — verify the real task editing surface end-to-end.
 *
 * 1. Capture a todo via API.
 * 2. Navigate to /todos/:id.
 * 3. Edit the title via the input. Blur. Verify via API the title persisted.
 * 4. Click ✓ mark done. Verify status='done' via API.
 * 5. Verify the footer button flipped to ↶ reopen.
 */
test('Task detail title editing and completion round-trip to the API', async ({ page, request }) => {
  const stamp = Date.now();
  const create = await request.post(`${API}/work-items`, {
    data: { title: `e2e-edit-${stamp}` },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/todos/${id}`);

  // Title input populates from the loaded WorkItem
  const titleInput = page.getByTestId('td-title');
  await expect(titleInput).toBeVisible({ timeout: 10_000 });
  await expect(titleInput).toHaveValue(`e2e-edit-${stamp}`);

  // Edit and blur → autosaves
  await titleInput.fill(`e2e-edit-${stamp}-RENAMED`);
  await titleInput.blur();

  // API confirms persistence
  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}`);
    const json = (await res.json()) as { data: { title: string } };
    return json.data.title;
  }, { timeout: 5000 }).toBe(`e2e-edit-${stamp}-RENAMED`);

  // Mark done
  const doneBtn = page.getByTestId('td-done');
  await expect(doneBtn).toHaveText(/mark done/);
  await doneBtn.click();

  // API confirms status=done
  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}`);
    const json = (await res.json()) as { data: { status: string } };
    return json.data.status;
  }, { timeout: 5000 }).toBe('done');

  // Footer flipped to reopen
  await expect(doneBtn).toHaveText(/reopen/);
});

test('Task detail keeps drop behind a confirmed secondary action', async ({ page, request }) => {
  const create = await request.post(`${API}/work-items`, {
    data: { title: `e2e-drop-confirm-${Date.now()}` },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/todos/${id}`);
  await expect(page.getByTestId('td-title')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('td-drop')).not.toBeVisible();

  await page.getByText('More actions', { exact: true }).click();
  await page.getByTestId('td-drop').click();
  const confirm = page.getByTestId('ui-confirm-dialog');
  await expect(confirm).toContainText('drop this task?');
  await confirm.getByRole('button', { name: 'drop task' }).click();

  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}`);
    const json = (await res.json()) as { data: { status: string } };
    return json.data.status;
  }, { timeout: 5000 }).toBe('dropped');
});

test('Task detail delayed subtask reads show a truthful loading state', async ({ page, request }) => {
  const create = await request.post(`${API}/work-items`, {
    data: { title: `e2e-subtask-loading-${Date.now()}` },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  let releaseSubtasks: (() => void) | undefined;
  const subtasksReleased = new Promise<void>((resolve) => { releaseSubtasks = resolve; });
  await page.route(`**/api/work-items/${id}/subtasks`, async (route) => {
    await subtasksReleased;
    await route.continue();
  });

  await page.goto(`/todos/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('td-title')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('subtasks-loading')).toHaveText('loading sub-tasks…');
  await expect(page.getByText('sketch the smallest viable version', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ add sub-task' })).toBeDisabled();

  releaseSubtasks?.();
  await expect(page.getByTestId('subtasks-loading')).toHaveCount(0);
  await expect(page.getByText(/no sub-tasks/)).toBeVisible();
});

test('Weekly review opens completed task detail', async ({ page, request }) => {
  const stamp = Date.now();
  const title = `e2e-weekly-done-${stamp}`;
  const create = await request.post(`${API}/work-items`, {
    data: { title, status: 'done' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto('/review');
  const doneItem = page.getByRole('button', { name: new RegExp(title) });
  await expect(doneItem).toBeVisible({ timeout: 10_000 });
  await doneItem.click();

  await expect(page).toHaveURL(new RegExp(`/todos/${id}`));
  await expect(page.getByTestId('td-title')).toHaveValue(title, { timeout: 10_000 });
});

test('Work drag to Done persists completion', async ({ page, request }) => {
  const stamp = Date.now();
  const title = `e2e-done-drop-${stamp}`;
  const create = await request.post(`${API}/work-items`, {
    data: { title, status: 'active' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto('/');
  await expect(page.getByTestId('board-col-doing')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.todo').filter({ hasText: title })).toBeVisible();
  await page.getByTestId('done-drop-zone').evaluate((target, todoId) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/stash-todo', todoId);
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, id);

  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}`);
    const json = (await res.json()) as { data: { status: string } };
    return json.data.status;
  }, { timeout: 5000 }).toBe('done');
  await expect(page.getByTestId('ce-feedback')).toHaveText(/Marked done/);
});
