import { afterEach, describe, expect, test } from 'bun:test';
import type { Hono } from 'hono';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fixedClock } from '@stash/shared';
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

  test('404s for a session that does not exist', async () => {
    const app = setupApp([
      { model: 'claude-sonnet-4-6', input: 1_000, output: 1_000, at: '2026-05-14T08:00:00.000Z' },
    ]);
    const res = await jsonReq(app, 'GET', '/api/agent-sessions/claude/ghost/usage');
    expect(res.status).toBe(404);
  });
});
