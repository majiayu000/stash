import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import type { AiJsonClient, JsonCompletionRequest, JsonCompletionResult } from '../../domain/ai-provider/service.js';
import { createApp } from '../app-factory.js';

const NOW = '2026-06-24T12:30:00.000Z';

class StaticMeetingClient implements AiJsonClient {
  requests: JsonCompletionRequest[] = [];

  constructor(private readonly result: JsonCompletionResult) {}

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    this.requests.push(request);
    return this.result;
  }
}

function meetingApp(client: AiJsonClient) {
  const db = freshDb();
  return {
    db,
    app: createApp({
      db,
      clock: fixedClock(NOW),
      aiProvider: { mode: 'openai_compatible', model: 'json-model', timeoutMs: 1000 },
      aiClient: client,
    }),
  };
}

async function postMeetingJson(app: ReturnType<typeof createApp>, path: string, body: unknown): Promise<Response> {
  return app.fetch(new Request(`http://test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('POST /api/meeting-triage/import', () => {
  test('stores meeting text and creates source-spanned review drafts only', async () => {
    const client = new StaticMeetingClient({
      raw: '{"drafts":[]}',
      text: JSON.stringify({
        drafts: [{
          title: 'Follow up with Sam',
          description: 'Send Sam the launch notes.',
          priority: 'p1',
          labels: ['meeting'],
          sourceSpans: [{ text: 'Sam owns launch notes' }],
        }],
      }),
    });
    const { db, app } = meetingApp(client);

    const res = await postMeetingJson(app, '/api/meeting-triage/import', {
      title: 'Launch sync',
      text: 'Sam owns launch notes. Priya will review copy.',
      sourcePath: '/meetings/launch.md',
    });
    const json = await res.json() as any;

    expect(res.status).toBe(201);
    expect(json.data.source.title).toBe('Launch sync');
    expect(json.data.run.sourceKind).toBe('meeting_triage');
    expect(json.data.drafts[0].sourceSpans).toEqual([{ text: 'Sam owns launch notes' }]);
    expect(json.data.drafts[0].reviewFlags).toEqual([]);
    expect(db.query<{ c: number }, []>('select count(*) as c from work_items').get()?.c).toBe(0);
    expect(client.requests[0]?.prompt).toContain('Meeting notes');
  });

  test('flags high-risk meeting drafts so they are not auto-adoptable', async () => {
    const client = new StaticMeetingClient({
      raw: '{"drafts":[]}',
      text: JSON.stringify({
        drafts: [{
          title: 'Delete production database',
          sourceSpans: [{ text: 'delete production database' }],
        }],
      }),
    });
    const { app } = meetingApp(client);

    const res = await postMeetingJson(app, '/api/meeting-triage/import', {
      text: 'Alex said delete production database after export.',
    });
    const json = await res.json() as any;

    expect(res.status).toBe(201);
    expect(json.data.drafts[0].reviewFlags).toContain('high_risk');
    expect(json.data.drafts[0].reviewReason).toContain('High-risk');
  });

  test('classifies risk from draft body without matching product as prod', async () => {
    const client = new StaticMeetingClient({
      raw: '{"drafts":[]}',
      text: JSON.stringify({
        drafts: [
          {
            title: 'Product roadmap follow-up',
            description: 'Discuss product launch sequencing.',
            sourceSpans: [{ text: 'product roadmap follow-up' }],
          },
          {
            title: 'Follow up with ops',
            description: 'Delete production database after export.',
            sourceSpans: [{ text: 'follow up with ops' }],
          },
        ],
      }),
    });
    const { app } = meetingApp(client);

    const res = await postMeetingJson(app, '/api/meeting-triage/import', {
      text: 'product roadmap follow-up. follow up with ops.',
    });
    const json = await res.json() as any;

    expect(res.status).toBe(201);
    expect(json.data.drafts[0].reviewFlags).not.toContain('high_risk');
    expect(json.data.drafts[1].reviewFlags).toContain('high_risk');
  });
});
