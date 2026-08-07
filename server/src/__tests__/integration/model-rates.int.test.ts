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
const EVENT_AT = '2026-05-14T08:00:10.000Z';
/** Deliberately absent from DEFAULT_MODEL_RATES — a proxied third-party model. */
const PROXIED_MODEL = 'qwen3.8-max-preview';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setupApp(): Hono {
  const root = mkdtempSync(join(tmpdir(), 'stash-model-rates-'));
  roots.push(root);
  const projectDir = join(root, 'projects', '-Users-test-proxy-repo');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, 'sess-rates-1.jsonl'),
    `${JSON.stringify({
      type: 'assistant',
      timestamp: EVENT_AT,
      sessionId: 'sess-rates-1',
      cwd: '/Users/test/proxy-repo',
      uuid: 'a1',
      message: {
        role: 'assistant',
        model: PROXIED_MODEL,
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      },
    })}\n`,
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

describe('/api/model-rates', () => {
  test('a configured rate prices a model the shipped card never carried', async () => {
    const app = setupApp();

    const before = await jsonReq(app, 'GET', '/api/analytics/burn?days=7');
    expect(before.status).toBe(200);
    expect(before.body.data.pricing.unknownModels).toContain(PROXIED_MODEL);
    expect(before.body.data.pricing.unpricedTokens).toBe(2_000_000);
    // #144's contract: unpriced usage is excluded from cost, never summed as $0.
    expect(before.body.data.totals.cost).toBe(0);

    const put = await jsonReq(app, 'PUT', '/api/model-rates', {
      model: PROXIED_MODEL,
      inputPerM: 2,
      outputPerM: 8,
    });
    expect(put.status).toBe(200);
    expect(put.body.data.model).toBe(PROXIED_MODEL);

    // Same process, no restart: the rate card is resolved per request.
    const after = await jsonReq(app, 'GET', '/api/analytics/burn?days=7');
    expect(after.status).toBe(200);
    expect(after.body.data.pricing.unknownModels).toEqual([]);
    expect(after.body.data.pricing.unpricedTokens).toBe(0);
    expect(after.body.data.totals.cost).toBeCloseTo(10, 10);
  });

  test('GET returns stored overrides alongside the merged card', async () => {
    const app = setupApp();
    await jsonReq(app, 'PUT', '/api/model-rates', { model: 'k3', inputPerM: 1, outputPerM: 2 });

    const res = await jsonReq(app, 'GET', '/api/model-rates');
    expect(res.status).toBe(200);
    expect(res.body.data.overrides.map((r: { model: string }) => r.model)).toEqual(['k3']);
    const effective = res.body.data.effective.map((r: { model: string }) => r.model);
    expect(effective).toContain('k3');
    expect(effective).toContain('claude-opus-4-7');
  });

  test('rejects a malformed rate and reports a missing delete', async () => {
    const app = setupApp();
    expect((await jsonReq(app, 'PUT', '/api/model-rates', { model: 'k3', inputPerM: -1, outputPerM: 2 })).status).toBe(400);
    expect((await jsonReq(app, 'PUT', '/api/model-rates', { model: '', inputPerM: 1, outputPerM: 2 })).status).toBe(400);
    expect((await jsonReq(app, 'DELETE', '/api/model-rates/ghost')).status).toBe(404);
  });

  test('deleting an override returns the model to unpriced rather than to $0', async () => {
    const app = setupApp();
    await jsonReq(app, 'PUT', '/api/model-rates', {
      model: PROXIED_MODEL, inputPerM: 2, outputPerM: 8,
    });
    expect((await jsonReq(app, 'DELETE', `/api/model-rates/${PROXIED_MODEL}`)).status).toBe(204);

    const burn = await jsonReq(app, 'GET', '/api/analytics/burn?days=7');
    expect(burn.body.data.pricing.unknownModels).toContain(PROXIED_MODEL);
    expect(burn.body.data.totals.cost).toBe(0);
  });
});
