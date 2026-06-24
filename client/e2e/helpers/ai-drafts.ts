import type { APIRequestContext } from '@playwright/test';

export const E2E_API = process.env.STASH_E2E_API_URL ?? 'http://localhost:4174/api';

export async function clearPendingDrafts(request: APIRequestContext) {
  const list = await request.get(`${E2E_API}/work-items/ai-drafts?status=draft`);
  if (!list.ok()) return;
  const json = await list.json() as { data: Array<{ id: string }> };
  for (const draft of json.data) {
    await request.post(`${E2E_API}/work-items/ai-drafts/${draft.id}/reject`, {
      data: { reason: 'e2e cleanup' },
    });
  }
}
