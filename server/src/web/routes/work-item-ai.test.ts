import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import type { AiJsonClient, JsonCompletionRequest, JsonCompletionResult } from '../../domain/ai-provider/service.js';
import { createApp } from '../app-factory.js';

const NOW = '2026-06-24T10:00:00.000Z';

class StaticClient implements AiJsonClient {
  requests: JsonCompletionRequest[] = [];

  constructor(private readonly result: JsonCompletionResult) {}

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    this.requests.push(request);
    return this.result;
  }
}

function setupApp(client?: AiJsonClient) {
  return createApp({
    db: freshDb(),
    clock: fixedClock(NOW),
    aiProvider: client
      ? { mode: 'openai_compatible', model: 'json-model', timeoutMs: 1000 }
      : { mode: 'disabled', timeoutMs: 1000 },
    aiClient: client,
  });
}

async function postJson(app: ReturnType<typeof createApp>, path: string, body?: unknown): Promise<Response> {
  return app.fetch(new Request(`http://test${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('POST /api/work-items/:id/decompose', () => {
  test('returns visible provider-unavailable error when AI is disabled', async () => {
    const app = setupApp();
    const create = await postJson(app, '/api/work-items', { title: 'No provider yet', kind: 'idea' });
    const id = ((await create.json()) as any).data.id;

    const res = await postJson(app, `/api/work-items/${id}/decompose`);
    const json = await res.json() as any;

    expect(res.status).toBe(503);
    expect(json.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
  });

  test('returns typed invalid-output error for malformed model JSON', async () => {
    const app = setupApp(new StaticClient({ raw: 'not-json', text: 'not-json' }));
    const create = await postJson(app, '/api/work-items', { title: 'Bad JSON idea', kind: 'idea' });
    const id = ((await create.json()) as any).data.id;

    const res = await postJson(app, `/api/work-items/${id}/decompose`);
    const json = await res.json() as any;

    expect(res.status).toBe(422);
    expect(json.error.code).toBe('AI_INVALID_OUTPUT');
  });

  test('creates reviewable drafts from valid provider output without exposing secrets', async () => {
    const client = new StaticClient({
      raw: '{"provider":"raw"}',
      text: JSON.stringify({
        drafts: [{
          title: 'Write the review flow test',
          description: 'Cover accept and reject.',
          priority: 'p1',
          labels: ['ai'],
          checklist: [{ text: 'mock the provider' }],
          sourceSpans: [{ text: 'review flow' }],
        }],
      }),
    });
    const app = setupApp(client);
    const create = await postJson(app, '/api/work-items', { title: 'Build review flow', kind: 'idea' });
    const id = ((await create.json()) as any).data.id;

    const res = await postJson(app, `/api/work-items/${id}/decompose`, {
      projectContext: 'Keep writes human-approved.',
    });
    const json = await res.json() as any;

    expect(res.status).toBe(201);
    expect(json.data.run.status).toBe('succeeded');
    expect(json.data.drafts).toHaveLength(1);
    expect(json.data.drafts[0].proposedTitle).toBe('Write the review flow test');
    expect(json.data.drafts[0].sourceWorkItemId).toBe(id);
    expect(JSON.stringify(json)).not.toContain('STASH_AI_API_KEY');
    expect(client.requests[0]?.prompt).toContain('Keep writes human-approved');
  });

  test('lists, edits, and accepts pending drafts into child work items', async () => {
    const client = new StaticClient({
      raw: '{"provider":"raw"}',
      text: JSON.stringify({
        drafts: [{
          title: 'Draft task',
          description: 'Original draft body.',
          priority: 'p2',
          labels: ['ai'],
          sourceSpans: [{ text: 'source idea' }],
        }],
      }),
    });
    const app = setupApp(client);
    const create = await postJson(app, '/api/work-items', {
      title: 'source idea',
      kind: 'idea',
      status: 'inbox',
    });
    const ideaId = ((await create.json()) as any).data.id;
    const decompose = await postJson(app, `/api/work-items/${ideaId}/decompose`);
    const decomposeJson = await decompose.json() as any;
    const runId = decomposeJson.data.run.id;
    const draftId = decomposeJson.data.drafts[0].id;

    const list = await app.fetch(new Request('http://test/api/work-items/ai-drafts?status=draft'));
    const listJson = await list.json() as any;
    expect(list.status).toBe(200);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.runs[0].id).toBe(runId);

    const accept = await postJson(app, `/api/work-items/ai-runs/${runId}/accept-drafts`, {
      sourceIdeaStatus: 'planned',
      drafts: [{
        draftId,
        title: 'Edited accepted task',
        description: 'Reviewer approved.',
        labels: ['reviewed'],
      }],
    });
    const acceptJson = await accept.json() as any;
    expect(accept.status).toBe(200);
    expect(acceptJson.data[0].status).toBe('edited');

    const subtasks = await app.fetch(new Request(`http://test/api/work-items/${ideaId}/subtasks`));
    const subtasksJson = await subtasks.json() as any;
    expect(subtasksJson.data).toHaveLength(1);
    expect(subtasksJson.data[0].title).toBe('Edited accepted task');
    expect(subtasksJson.data[0].parentId).toBe(ideaId);
  });

  test('rejects a pending draft without creating a work item', async () => {
    const client = new StaticClient({
      raw: '{"provider":"raw"}',
      text: JSON.stringify({
        drafts: [{ title: 'Discard me', sourceSpans: [{ text: 'source idea' }] }],
      }),
    });
    const app = setupApp(client);
    const create = await postJson(app, '/api/work-items', {
      title: 'source idea',
      kind: 'idea',
      status: 'inbox',
    });
    const ideaId = ((await create.json()) as any).data.id;
    const decompose = await postJson(app, `/api/work-items/${ideaId}/decompose`);
    const draftId = (((await decompose.json()) as any).data.drafts[0].id);

    const reject = await postJson(app, `/api/work-items/ai-drafts/${draftId}/reject`, { reason: 'not actionable' });
    const rejectJson = await reject.json() as any;
    expect(reject.status).toBe(200);
    expect(rejectJson.data.status).toBe('rejected');

    const subtasks = await app.fetch(new Request(`http://test/api/work-items/${ideaId}/subtasks`));
    const subtasksJson = await subtasks.json() as any;
    expect(subtasksJson.data).toEqual([]);
  });
});
