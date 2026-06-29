import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import type { AiJsonClient, JsonCompletionRequest, JsonCompletionResult } from '../../domain/ai-provider/service.js';
import { createApp } from '../app-factory.js';

const NOW = '2026-06-24T12:00:00.000Z';

class SequenceClient implements AiJsonClient {
  requests: JsonCompletionRequest[] = [];

  constructor(private readonly results: JsonCompletionResult[]) {}

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    this.requests.push(request);
    const next = this.results.shift();
    if (!next) throw new Error('unexpected AI request');
    return next;
  }
}

function setupCoachApp(client: AiJsonClient) {
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

async function postCoachJson(app: ReturnType<typeof createApp>, path: string, body?: unknown): Promise<Response> {
  return app.fetch(new Request(`http://test${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('work item coach routes', () => {
  test('persists chat messages and applies a confirmed journal summary with provenance', async () => {
    const client = new SequenceClient([
      {
        raw: '{"reply":"ok"}',
        text: JSON.stringify({ reply: 'Write the smallest test.', suggestedActions: ['add a route test'] }),
      },
      {
        raw: '{"summary":"ok"}',
        text: JSON.stringify({ summary: 'Coach summary for the journal.', destination: 'description' }),
      },
    ]);
    const { db, app } = setupCoachApp(client);
    const create = await postCoachJson(app, '/api/work-items', { title: 'Build coach panel', kind: 'task' });
    const taskId = ((await create.json()) as any).data.id;

    const ask = await postCoachJson(app, `/api/work-items/${taskId}/coach/messages`, { body: 'What next?' });
    const askJson = await ask.json() as any;
    expect(ask.status).toBe(201);
    expect(askJson.data.userMessage.body).toBe('What next?');
    expect(askJson.data.assistantMessage.body).toBe('Write the smallest test.');
    expect(askJson.data.suggestedActions).toEqual(['add a route test']);

    const messages = await app.fetch(new Request(`http://test/api/work-items/${taskId}/coach/messages`));
    expect(((await messages.json()) as any).data).toHaveLength(2);

    const summary = await postCoachJson(app, `/api/work-items/${taskId}/coach/summarize`, { destination: 'journal' });
    const summaryJson = await summary.json() as any;
    expect(summary.status).toBe(201);
    expect(summaryJson.data.message.purpose).toBe('summary');
    expect(summaryJson.data.destination).toBe('journal');
    expect(summaryJson.data.message.destination).toBe('journal');

    const beforeApplyJournal = await app.fetch(new Request(`http://test/api/work-items/${taskId}/journal`));
    expect(((await beforeApplyJournal.json()) as any).data).toEqual([]);

    const apply = await postCoachJson(app, `/api/work-items/${taskId}/coach/apply-summary`, {
      runId: summaryJson.data.run.id,
      sourceMessageId: summaryJson.data.message.id,
      destination: 'journal',
    });
    const applyJson = await apply.json() as any;
    expect(apply.status).toBe(200);
    expect(applyJson.data.write.runId).toBe(summaryJson.data.run.id);
    expect(applyJson.data.journalEntry.body).toBe('Coach summary for the journal.');

    const writes = await app.fetch(new Request(`http://test/api/work-items/${taskId}/ai-writes`));
    const writesJson = await writes.json() as any;
    expect(writesJson.data[0].runId).toBe(summaryJson.data.run.id);
    expect(writesJson.data[0].createdJournalEntryId).toBe(applyJson.data.journalEntry.id);
    expect(db.query<{ status: string }, [string]>('select status from ai_generation_runs where id = ?').get(summaryJson.data.run.id)?.status).toBe('accepted');
  });

  test('summary generation does not mutate description until the user confirms', async () => {
    const client = new SequenceClient([
      {
        raw: '{"reply":"ok"}',
        text: JSON.stringify({ reply: 'Clarify the scope.' }),
      },
      {
        raw: '{"summary":"ok"}',
        text: JSON.stringify({ summary: 'Append this to the description.', destination: 'description' }),
      },
    ]);
    const { app } = setupCoachApp(client);
    const create = await postCoachJson(app, '/api/work-items', { title: 'Summarize into description', description: 'Existing note.', kind: 'task' });
    const taskId = ((await create.json()) as any).data.id;

    await postCoachJson(app, `/api/work-items/${taskId}/coach/messages`, { body: 'Help me summarize.' });
    const summary = await postCoachJson(app, `/api/work-items/${taskId}/coach/summarize`, { destination: 'description' });
    const summaryJson = await summary.json() as any;

    const beforeApply = await app.fetch(new Request(`http://test/api/work-items/${taskId}`));
    expect(((await beforeApply.json()) as any).data.description).toBe('Existing note.');

    const apply = await postCoachJson(app, `/api/work-items/${taskId}/coach/apply-summary`, {
      runId: summaryJson.data.run.id,
      sourceMessageId: summaryJson.data.message.id,
      destination: 'description',
    });
    const applyJson = await apply.json() as any;
    expect(applyJson.data.item.description).toContain('Existing note.');
    expect(applyJson.data.item.description).toContain('Append this to the description.');
  });

  test('applies confirmed system coach summary to template checklist only after confirmation', async () => {
    const client = new SequenceClient([
      {
        raw: '{"reply":"ok"}',
        text: JSON.stringify({ reply: 'I can simplify the routine.' }),
      },
      {
        raw: '{"summary":"ok"}',
        text: JSON.stringify({
          summary: 'Open windows\nPack the bag\nCheck the calendar',
          destination: 'checklist',
        }),
      },
    ]);
    const { app } = setupCoachApp(client);
    const create = await postCoachJson(app, '/api/work-items', {
      title: 'Morning routine',
      kind: 'system',
      checklist: [{ id: 'old-step', text: 'old step', completed: true }],
    });
    const systemId = ((await create.json()) as any).data.id;

    await postCoachJson(app, `/api/work-items/${systemId}/coach/messages`, { body: 'Optimize this routine.' });
    const summary = await postCoachJson(app, `/api/work-items/${systemId}/coach/summarize`, { destination: 'checklist' });
    const summaryJson = await summary.json() as any;

    const beforeApply = await app.fetch(new Request(`http://test/api/work-items/${systemId}`));
    expect(((await beforeApply.json()) as any).data.checklist.map((item: any) => item.text)).toEqual(['old step']);

    const apply = await postCoachJson(app, `/api/work-items/${systemId}/coach/apply-summary`, {
      runId: summaryJson.data.run.id,
      sourceMessageId: summaryJson.data.message.id,
      destination: 'checklist',
    });
    const applyJson = await apply.json() as any;
    expect(apply.status).toBe(200);
    expect(applyJson.data.item.checklist.map((item: any) => item.text)).toEqual([
      'Open windows',
      'Pack the bag',
      'Check the calendar',
    ]);
    expect(applyJson.data.item.checklist.every((item: any) => item.completed === false)).toBe(true);

    const mismatch = await postCoachJson(app, `/api/work-items/${systemId}/coach/apply-summary`, {
      runId: summaryJson.data.run.id,
      sourceMessageId: summaryJson.data.message.id,
      destination: 'journal',
    });
    expect(mismatch.status).toBe(409);
  });

  test('rejects applying legacy summaries that do not record a destination', async () => {
    const client = new SequenceClient([
      {
        raw: '{"reply":"ok"}',
        text: JSON.stringify({ reply: 'Clarify the scope.' }),
      },
      {
        raw: '{"summary":"ok"}',
        text: JSON.stringify({ summary: 'Legacy summary body.', destination: 'journal' }),
      },
    ]);
    const { db, app } = setupCoachApp(client);
    const create = await postCoachJson(app, '/api/work-items', { title: 'Legacy summary target', kind: 'task' });
    const taskId = ((await create.json()) as any).data.id;

    await postCoachJson(app, `/api/work-items/${taskId}/coach/messages`, { body: 'Help me summarize.' });
    const summary = await postCoachJson(app, `/api/work-items/${taskId}/coach/summarize`, { destination: 'journal' });
    const summaryJson = await summary.json() as any;
    db.prepare('update work_item_coach_messages set summary_destination = null where id = ?').run(summaryJson.data.message.id);

    const apply = await postCoachJson(app, `/api/work-items/${taskId}/coach/apply-summary`, {
      runId: summaryJson.data.run.id,
      sourceMessageId: summaryJson.data.message.id,
      destination: 'journal',
    });
    expect(apply.status).toBe(409);
  });
});
