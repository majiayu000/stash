import { test, expect } from '@playwright/test';

const API = 'http://localhost:4174/api';

/**
 * v0.4 — verify the real editing surface in ConceptL works end-to-end.
 *
 * 1. Capture a todo via API.
 * 2. Navigate to /c/l/:id.
 * 3. Edit the title via the input. Blur. Verify via API the title persisted.
 * 4. Click ✓ mark done. Verify status='done' via API.
 * 5. Verify the footer button flipped to ↶ reopen.
 */
test('ConceptL: title editable + mark done round-trips to API', async ({ page, request }) => {
  const stamp = Date.now();
  const create = await request.post(`${API}/work-items`, {
    data: { title: `e2e-edit-${stamp}` },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/c/l/${id}`);

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
