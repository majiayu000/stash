import { test, expect, type Locator } from '@playwright/test';
import { clearPendingDrafts, E2E_API as API } from './helpers/ai-drafts';

async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate((node) => {
    type Rgba = [number, number, number, number];

    function rgba(value: string): Rgba {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
    }

    function composite(foreground: Rgba, background: Rgba): Rgba {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
        alpha,
      ];
    }

    function luminance(color: Rgba): number {
      const linear = color.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      const [red = 0, green = 0, blue = 0] = linear;
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    }

    const layers: Element[] = [];
    for (let current: Element | null = node; current; current = current.parentElement) layers.push(current);
    const background = layers.reverse().reduce(
      (result, layer) => composite(rgba(getComputedStyle(layer).backgroundColor), result),
      [255, 255, 255, 1] as Rgba,
    );
    const foreground = rgba(getComputedStyle(node).color);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  });
}

test('Decision Inbox stays readable in light themes', async ({ page }) => {
  await page.goto('/');

  for (const theme of ['glacier', 'paper', 'mono']) {
    await page.getByTestId(`theme-${theme}`).click();

    const affordance = page.getByTestId('decision-inbox-button');
    await expect(affordance).toBeVisible();
    expect(await contrastRatio(affordance), `${theme} affordance contrast`).toBeGreaterThanOrEqual(4.5);

    await affordance.click();
    const dialog = page.getByTestId('decision-inbox-dialog');
    await expect(dialog).toBeVisible();
    expect(await contrastRatio(dialog), `${theme} dialog contrast`).toBeGreaterThanOrEqual(4.5);
    await page.getByRole('button', { name: 'close Decision Inbox' }).click();
  }
});

test('Decision Inbox reviews AI decomposition drafts before creating child tasks', async ({ page, request }) => {
  await clearPendingDrafts(request);

  let nativeDialogSeen = false;
  page.on('dialog', async (dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  });

  const stamp = Date.now();
  const title = `e2e-ai-idea-${stamp}`;
  const create = await request.post(`${API}/work-items`, {
    data: { title, kind: 'idea', status: 'inbox' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.goto(`/todos/${id}`);
  await expect(page.getByTestId('td-title')).toHaveValue(title, { timeout: 10_000 });
  await page.getByTestId('td-ai-decompose').click();

  await expect(page.getByTestId('decision-inbox-dialog')).toBeVisible({ timeout: 10_000 });
  const card = page.getByTestId('decision-draft-card').first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('decision-draft-title')).toHaveValue(`Review ${title}`);
  await expect(card.getByTestId('decision-source-spans')).toContainText(title);

  await card.getByTestId('decision-draft-title').fill(`Accepted child for ${title}`);
  await page.getByRole('button', { name: 'accept selected' }).click();
  await expect(page.getByTestId('decision-inbox-dialog')).not.toBeVisible({ timeout: 10_000 });

  await expect.poll(async () => {
    const res = await request.get(`${API}/work-items/${id}/subtasks`);
    const json = await res.json() as { data: Array<{ title: string; parentId?: string }> };
    return json.data.find((item) => item.title === `Accepted child for ${title}`)?.parentId;
  }, { timeout: 10_000 }).toBe(id);

  expect(nativeDialogSeen).toBe(false);
});

test('Idea decompose action shows provider errors inline', async ({ page, request }) => {
  await clearPendingDrafts(request);

  const stamp = Date.now();
  const title = `e2e-ai-provider-down-${stamp}`;
  const create = await request.post(`${API}/work-items`, {
    data: { title, kind: 'idea', status: 'inbox' },
  });
  expect(create.ok()).toBeTruthy();
  const id = ((await create.json()) as { data: { id: string } }).data.id;

  await page.route(`**/api/work-items/${id}/decompose`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider is unavailable' },
      }),
    });
  });

  await page.goto(`/todos/${id}`);
  await page.getByTestId('td-ai-decompose').click();
  await expect(page.getByText(/AI provider is unavailable/)).toBeVisible({ timeout: 10_000 });
});
