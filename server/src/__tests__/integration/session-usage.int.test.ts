import { afterEach, describe, expect, test } from 'bun:test';
import type { Hono } from 'hono';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fixedClock, summarizeUsage } from '@stash/shared';
import { openDatabase } from '../../db/connection.js';
import { migrate } from '../../db/migrate.js';
import { createApp } from '../../web/app-factory.js';

const NOW = '2026-05-14T10:00:00.000Z';
const SESSION_ID = 'sess-usage-1';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Turn { model: string; input: number; output: number; at: string }

function setupApp(turns: Turn[]): Hono {
  const root = mkdtempSync(join(tmpdir(), 'stash-session-usage-'));
  roots.push(root);
  const projectDir = join(root, 'projects', '-Users-test-usage-repo');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, `${SESSION_ID}.jsonl`),
    turns
      .map((turn, index) => JSON.stringify({
        type: 'assistant',
        timestamp: turn.at,
        sessionId: SESSION_ID,
        cwd: '/Users/test/usage-repo',
        uuid: `a${index}`,
        message: {
          role: 'assistant',
          model: turn.model,
          usage: { input_tokens: turn.input, output_tokens: turn.output },
        },
      }))
      .join('\n') + '\n',
  );

  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  return createApp({ db, clock: fixedClock(NOW), claudeRoot: root, codexRoot: join(root, 'absent') });
}

function setupCodexApp(): Hono {
  const root = mkdtempSync(join(tmpdir(), 'stash-codex-session-usage-'));
  roots.push(root);
  const sessionsDir = join(root, 'sessions', '2026', '05', '14');
  mkdirSync(sessionsDir, { recursive: true });
  const token = (timestamp: string, input: number, output: number, cached: number) => ({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: {
        input_tokens: input,
        output_tokens: output,
        cached_input_tokens: cached,
        total_tokens: input + output,
      } },
    },
  });
  const records = [
    { timestamp: '2026-05-14T08:00:00.000Z', type: 'session_meta', payload: { id: SESSION_ID, cwd: '/Users/test/usage-repo' } },
    { timestamp: '2026-05-14T08:01:00.000Z', type: 'turn_context', payload: { model: 'gpt-5' } },
    token('2026-05-14T08:02:00.000Z', 1_000_000, 0, 500_000),
    { timestamp: '2026-05-14T08:03:00.000Z', type: 'turn_context', payload: { model: 'gpt-4.1' } },
    token('2026-05-14T08:04:00.000Z', 2_000_000, 1_000_000, 750_000),
  ];
  writeFileSync(
    join(sessionsDir, `rollout-${SESSION_ID}.jsonl`),
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );

  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  return createApp({ db, clock: fixedClock(NOW), claudeRoot: join(root, 'absent'), codexRoot: root });
}

async function jsonReq(app: Hono, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const usagePath = `/api/agent-sessions/claude/${SESSION_ID}/usage`;

describe('GET /api/agent-sessions/:provider/:id/usage', () => {
  test('returns measured totals and a per-model split for one session', async () => {
    const app = setupApp([
      { model: 'claude-sonnet-4-6', input: 1_000_000, output: 500_000, at: '2026-05-14T08:00:00.000Z' },
      { model: 'claude-sonnet-4-6', input: 1_000_000, output: 500_000, at: '2026-05-14T09:00:00.000Z' },
    ]);

    const res = await jsonReq(app, 'GET', usagePath);
    expect(res.status).toBe(200);
    expect(res.body.data.totals.inputTokens).toBe(2_000_000);
    expect(res.body.data.totals.outputTokens).toBe(1_000_000);
    expect(res.body.data.totals.tokens).toBe(3_000_000);
    // 2M input @ $3/M + 1M output @ $15/M.
    expect(res.body.data.totals.cost).toBeCloseTo(21, 10);
    expect(res.body.data.pricing.unknownModels).toEqual([]);
    expect(res.body.data.sessionLastActiveAt).toBe('2026-05-14T09:00:00.000Z');
    expect(res.body.data.sessionStatus).toBe('lost');
    expect(res.body.data.modelMix).toEqual([
      { model: 'claude-sonnet-4-6', tokens: 3_000_000, cost: 21 },
    ]);
  });

  test('counts the whole session, including events outside the rolling burn window', async () => {
    const app = setupApp([
      // Months before the default burn window — a per-session total must still
      // include it, or the number contradicts the transcript above it.
      { model: 'claude-sonnet-4-6', input: 1_000_000, output: 0, at: '2026-01-02T08:00:00.000Z' },
      { model: 'claude-sonnet-4-6', input: 1_000_000, output: 0, at: '2026-05-14T09:00:00.000Z' },
    ]);

    const res = await jsonReq(app, 'GET', usagePath);
    expect(res.status).toBe(200);
    expect(res.body.data.totals.inputTokens).toBe(2_000_000);
  });

  test('reuses the discovered source path instead of rescanning on every usage poll', async () => {
    const app = setupApp([
      { model: 'claude-sonnet-4-6', input: 1_000, output: 500, at: '2026-05-14T08:00:00.000Z' },
    ]);

    const first = await jsonReq(app, 'GET', usagePath);
    const second = await jsonReq(app, 'GET', usagePath);

    expect(first.status).toBe(200);
    expect(first.body.cache).toBeDefined();
    expect(second.status).toBe(200);
    expect(second.body.cache).toBeUndefined();
  });

  test('reports an unpriced model instead of counting it as free', async () => {
    const app = setupApp([
      { model: 'claude-sonnet-4-6', input: 1_000_000, output: 0, at: '2026-05-14T08:00:00.000Z' },
      { model: 'k3', input: 1_000_000, output: 0, at: '2026-05-14T09:00:00.000Z' },
    ]);

    const res = await jsonReq(app, 'GET', usagePath);
    expect(res.status).toBe(200);
    expect(res.body.data.pricing.unknownModels).toEqual(['k3']);
    expect(res.body.data.pricing.unpricedTokens).toBe(1_000_000);
    // Cost covers the priced half only, and says so through `pricing`.
    expect(res.body.data.totals.cost).toBeCloseTo(3, 10);
    const k3 = res.body.data.modelMix.find((m: { model: string }) => m.model === 'k3');
    expect(k3.cost).toBeUndefined();
  });

  test('keeps a model split incomplete regardless of priced event order', () => {
    const base = {
      ts: '2026-05-14T08:00:00.000Z',
      model: 'k3',
      inputTokens: 1_000_000,
      outputTokens: 0,
      sourcePath: '/tmp/session.jsonl',
    };
    const rates = [{ model: 'k3', inputPerM: 1, outputPerM: 2 }];
    const priced = base;
    const unpriced_cache = { ...base, cacheReadTokens: 500_000 };

    for (const events of [[priced, unpriced_cache], [unpriced_cache, priced]]) {
      const summary = summarizeUsage(events, rates);
      expect(summary.modelMix).toEqual([{ model: 'k3', tokens: 2_000_000, cost: undefined }]);
      expect(summary.pricing.unpricedTokens).toBe(1_500_000);
    }
  });

  test('a rate configured in Settings prices the session without a restart', async () => {
    const app = setupApp([
      { model: 'k3', input: 1_000_000, output: 1_000_000, at: '2026-05-14T08:00:00.000Z' },
    ]);

    expect((await jsonReq(app, 'GET', usagePath)).body.data.totals.cost).toBe(0);

    await jsonReq(app, 'PUT', '/api/model-rates', { model: 'k3', inputPerM: 2, outputPerM: 8 });

    const after = await jsonReq(app, 'GET', usagePath);
    expect(after.body.data.pricing.unknownModels).toEqual([]);
    expect(after.body.data.totals.cost).toBeCloseTo(10, 10);
  });

  test('prices cached Codex input and preserves model changes', async () => {
    const app = setupCodexApp();

    const res = await jsonReq(app, 'GET', `/api/agent-sessions/codex/${SESSION_ID}/usage`);

    expect(res.status).toBe(200);
    expect(res.body.data.modelMix.map((entry: { model: string }) => entry.model).sort())
      .toEqual(['gpt-4.1', 'gpt-5']);
    expect(res.body.data.totals.cacheReadTokens).toBe(750_000);
    expect(res.body.data.pricing.unknownModels).toEqual([]);
    // Codex input totals include cache: gpt-5 has .5M uncached + .5M cache;
    // gpt-4.1 adds .75M uncached + 1M output + .25M cache.
    expect(res.body.data.totals.cost).toBeCloseTo(10.3125, 10);
  });

  test('404s for a session that does not exist', async () => {
    const app = setupApp([
      { model: 'claude-sonnet-4-6', input: 1_000, output: 1_000, at: '2026-05-14T08:00:00.000Z' },
    ]);
    const res = await jsonReq(app, 'GET', '/api/agent-sessions/claude/ghost/usage');
    expect(res.status).toBe(404);
  });
});
