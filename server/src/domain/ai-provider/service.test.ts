import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { AiDraftService } from '../ai-draft/service.js';
import { WorkItemService } from '../work-item/service.js';
import {
  AiProviderInvalidOutputError,
  AiProviderService,
  AiProviderUnavailableError,
  OpenAiCompatibleJsonClient,
  type AiJsonClient,
  type JsonCompletionRequest,
  type JsonCompletionResult,
} from './service.js';
import {
  buildCoachSummaryPrompt,
  buildIdeaDecompositionPrompt,
  buildTaskCoachPrompt,
} from './prompts.js';

const at = '2026-06-24T10:00:00.000Z';

function setup(client: AiJsonClient, config = {}) {
  const db = freshDb();
  const clock = fixedClock(at);
  const workItems = new WorkItemService({ db, clock });
  const drafts = new AiDraftService({ db, clock, workItems });
  const ai = new AiProviderService({
    config: {
      mode: 'openai_compatible',
      model: 'json-model',
      timeoutMs: 1000,
      ...config,
    },
    workItems,
    drafts,
    client,
  });
  return { db, workItems, drafts, ai };
}

class StaticClient implements AiJsonClient {
  requests: JsonCompletionRequest[] = [];

  constructor(private readonly result: JsonCompletionResult | Error) {}

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    this.requests.push(request);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe('AI provider prompts', () => {
  test('prompt builders require JSON-only reviewable outputs', () => {
    const idea = new WorkItemService({ db: freshDb(), clock: fixedClock(at) })
      .create({ title: 'Launch AI capture flow', kind: 'idea', description: 'Split into reviewable tasks.' });

    expect(buildIdeaDecompositionPrompt({ idea })).toContain('Return only JSON');
    expect(buildIdeaDecompositionPrompt({ idea })).toContain('"drafts"');
    expect(buildTaskCoachPrompt({ task: idea, question: 'What next?' })).toContain('"reply"');
    expect(buildCoachSummaryPrompt({
      task: idea,
      messages: ['Focus on onboarding first.'],
      destination: 'journal',
    })).toContain('"summary"');
  });
});

describe('AiProviderService', () => {
  test('decomposes an idea into persisted drafts with source provenance', async () => {
    const client = new StaticClient({
      raw: '{"choices":[{"message":{"content":"unused"}}]}',
      text: JSON.stringify({
        drafts: [{
          title: 'Interview five users',
          description: 'Validate the capture workflow.',
          priority: 'p1',
          labels: ['research'],
          checklist: [{ text: 'write screener' }],
          sourceSpans: [{ text: 'Launch AI capture flow' }],
        }],
      }),
    });
    const { workItems, drafts, ai } = setup(client);
    const idea = workItems.create({ title: 'Launch AI capture flow', kind: 'idea' });

    const result = await ai.decomposeIdea({ ideaId: idea.id });

    expect(result.run.status).toBe('succeeded');
    expect(result.run.provider).toBe('openai_compatible');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.proposedTitle).toBe('Interview five users');
    expect(result.drafts[0]?.sourceWorkItemId).toBe(idea.id);
    expect(result.drafts[0]?.sourceSpans).toEqual([{ text: 'Launch AI capture flow' }]);
    expect(drafts.listDrafts({ runId: result.run.id })).toHaveLength(1);
    expect(client.requests[0]?.prompt).toContain('These are drafts for human review');
  });

  test('records failed run and raises typed error for provider unavailable', async () => {
    const client = new StaticClient(new AiProviderUnavailableError('missing key'));
    const { db, workItems, drafts, ai } = setup(client);
    const idea = workItems.create({ title: 'Needs AI help', kind: 'idea' });

    await expect(ai.decomposeIdea({ ideaId: idea.id })).rejects.toThrow(AiProviderUnavailableError);

    const runs = db.query<{ status: string; error: string | null }, []>(
      'select status, error from ai_generation_runs',
    ).all();
    expect(runs).toEqual([{ status: 'failed', error: 'missing key' }]);
    expect(drafts.listDrafts()).toEqual([]);
  });

  test('keeps failed provider runs inspectable', async () => {
    const client = new StaticClient(new AiProviderUnavailableError('missing key'));
    const { workItems, drafts, ai } = setup(client);
    const idea = workItems.create({ title: 'Needs AI help', kind: 'idea' });

    await expect(ai.decomposeIdea({ ideaId: idea.id })).rejects.toThrow('missing key');

    const draftRows = drafts.listDrafts();
    expect(draftRows).toEqual([]);
  });

  test('rejects invalid JSON output without creating drafts', async () => {
    const client = new StaticClient({ text: 'not json', raw: '{"provider":"raw"}' });
    const { workItems, drafts, ai } = setup(client);
    const idea = workItems.create({ title: 'Parse this', kind: 'idea' });

    await expect(ai.decomposeIdea({ ideaId: idea.id })).rejects.toThrow(AiProviderInvalidOutputError);
    expect(drafts.listDrafts()).toEqual([]);
  });

  test('coach reply and summary validate typed JSON shapes', async () => {
    const replyClient = new StaticClient({
      raw: '{"reply":true}',
      text: JSON.stringify({ reply: 'Do the smallest testable slice.', suggestedActions: ['write test'] }),
    });
    const { workItems, ai } = setup(replyClient);
    const task = workItems.create({ title: 'Build coach flow', kind: 'task' });

    const reply = await ai.coachTask({ workItemId: task.id, question: 'What next?' });
    expect(reply.reply).toBe('Do the smallest testable slice.');
    expect(reply.suggestedActions).toEqual(['write test']);

    const summaryClient = new StaticClient({
      raw: '{"summary":true}',
      text: JSON.stringify({
        summary: 'User chose the smallest testable slice.',
        destination: 'description',
        sourceSpans: [{ text: 'smallest testable slice' }],
      }),
    });
    const summarySetup = setup(summaryClient);
    const summaryTask = summarySetup.workItems.create({ title: 'Summarize coach', kind: 'task' });
    const summary = await summarySetup.ai.summarizeTask({
      workItemId: summaryTask.id,
      messages: ['smallest testable slice'],
      destination: 'journal',
    });
    expect(summary.summary).toBe('User chose the smallest testable slice.');
    expect(summary.destination).toBe('journal');
    expect(summary.sourceSpans).toEqual([{ text: 'smallest testable slice' }]);
  });
});

describe('OpenAiCompatibleJsonClient', () => {
  test('keeps API key server-side and extracts JSON message content', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"reply":"ok"}' } }],
      }), { status: 200 });
    }) as typeof fetch;
    const client = new OpenAiCompatibleJsonClient({
      mode: 'openai_compatible',
      baseUrl: 'https://provider.example/chat',
      apiKey: 'server-secret',
      model: 'json-model',
      timeoutMs: 1000,
    }, fetchImpl);

    const result = await client.completeJson({
      prompt: 'Return JSON',
      model: 'json-model',
      timeoutMs: 1000,
    });

    expect(result.text).toBe('{"reply":"ok"}');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('server-secret');
    expect((calls[0]?.headers as Record<string, string>).authorization).toBe('Bearer server-secret');
  });
});
