import { afterEach, describe, expect, test } from 'bun:test';
import type { Hono } from 'hono';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MAX_MODEL_RATE_PER_M, fixedClock } from '@stash/shared';
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

function setupApp(model = PROXIED_MODEL, cache_usage = {}): Hono {
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
        model,
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, ...cache_usage },
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
  for (const cache_rates of [{}, { cacheReadPerM: 0.5 }, { cacheWritePerM: 6.25 }]) {
    test(`a shipped override preserves missing cache prices ${JSON.stringify(cache_rates)}`, async () => {
      const model = 'claude-opus-4-7';
      const app = setupApp(model, { cache_read_input_tokens: 500_000, cache_creation_input_tokens: 250_000 });
      const burn_path = '/api/analytics/burn?days=7';
      const usage_path = '/api/agent-sessions/claude/sess-rates-1/usage';
      const before = await jsonReq(app, 'GET', burn_path);
      expect(before.body.data.totals.cost).toBeCloseTo(31.8125, 10);
      expect(before.body.data.pricing.unknownModels).toEqual([]);

      const put = await jsonReq(app, 'PUT', '/api/model-rates', {
        model, inputPerM: 2, outputPerM: 8, ...cache_rates,
      });
      expect(put.status).toBe(200);
      const card = await jsonReq(app, 'GET', '/api/model-rates');
      expect(card.body.data.overrides[0].cacheReadPerM).toBe(cache_rates.cacheReadPerM);
      expect(card.body.data.overrides[0].cacheWritePerM).toBe(cache_rates.cacheWritePerM);
      const effective = card.body.data.effective.find((rate: { model: string }) => rate.model === model);
      expect(effective.cacheReadPerM).toBe(cache_rates.cacheReadPerM);
      expect(effective.cacheWritePerM).toBe(cache_rates.cacheWritePerM);
      for (const path of [burn_path, usage_path]) {
        const after = await jsonReq(app, 'GET', path);
        expect(after.status).toBe(200);
        expect(after.body.data.pricing).toEqual({ unknownModels: [model], unpricedTokens: 2_750_000 });
        expect(after.body.data.totals.cost).toBe(0);
        expect(after.body.data.modelMix[0].cost).toBeUndefined();
      }

      expect((await jsonReq(app, 'DELETE', `/api/model-rates/${model}`)).status).toBe(204);
      const restored = await jsonReq(app, 'GET', burn_path);
      expect(restored.body.data.totals.cost).toBeCloseTo(31.8125, 10);
      expect(restored.body.data.pricing.unknownModels).toEqual([]);
    });
  }

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
    expect((await jsonReq(app, 'PUT', '/api/model-rates', { model: '   ', inputPerM: 1, outputPerM: 2 })).status).toBe(400);
    expect((await jsonReq(app, 'PUT', '/api/model-rates', {
      model: '-20260401', inputPerM: 1, outputPerM: 2,
    })).status).toBe(400);
    expect((await jsonReq(app, 'PUT', '/api/model-rates', {
      model: 'k3', inputPerM: MAX_MODEL_RATE_PER_M + 1, outputPerM: 2,
    })).status).toBe(400);
    expect((await jsonReq(app, 'DELETE', '/api/model-rates/ghost')).status).toBe(404);
  });

  test('maps malformed JSON to validation instead of an internal error', async () => {
    const app = setupApp();
    const res = await app.request('/api/model-rates', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"model":',
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION');
  });

  test('deletes a literal percent sequence without decoding it twice', async () => {
    const app = setupApp();
    const model = 'proxy%2Fmodel';
    await jsonReq(app, 'PUT', '/api/model-rates', { model, inputPerM: 1, outputPerM: 2 });

    expect((await jsonReq(app, 'DELETE', `/api/model-rates/${encodeURIComponent(model)}`)).status).toBe(204);
    const card = await jsonReq(app, 'GET', '/api/model-rates');
    expect(card.body.data.overrides).toEqual([]);
  });

  test('deletes a canonical row through the same dated id accepted by PUT', async () => {
    const app = setupApp();
    await jsonReq(app, 'PUT', '/api/model-rates', {
      model: ' deepseek-v4-20260401 ', inputPerM: 1, outputPerM: 2,
    });

    expect((await jsonReq(app, 'DELETE', '/api/model-rates/deepseek-v4-20260401')).status).toBe(204);
    const card = await jsonReq(app, 'GET', '/api/model-rates');
    expect(card.body.data.overrides).toEqual([]);
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
