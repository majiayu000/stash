import { beforeEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_MODEL_RATES,
  MAX_MODEL_RATE_PER_M,
  eventCost,
  fixedClock,
  findModelRate,
  mergeModelRates,
} from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { ModelRateNotFoundError, ModelRateService } from './service.js';

describe('ModelRateService', () => {
  let svc: ModelRateService;
  const at = '2026-08-07T10:00:00.000Z';

  beforeEach(() => {
    svc = new ModelRateService({ db: freshDb(), clock: fixedClock(at) });
  });

  test('upsert + list round-trip, including optional cache rates', () => {
    const stored = svc.upsert({
      model: 'qwen3.8-max-preview',
      inputPerM: 1.2,
      outputPerM: 6,
      cacheReadPerM: 0.12,
    });
    expect(stored.model).toBe('qwen3.8-max-preview');
    expect(stored.inputPerM).toBe(1.2);
    expect(stored.cacheReadPerM).toBe(0.12);
    expect(stored.cacheWritePerM).toBeUndefined();
    expect(stored.createdAt).toBe(at);
    expect(svc.list().length).toBe(1);
  });

  test('upsert replaces an existing row rather than duplicating it', () => {
    svc.upsert({ model: 'k3', inputPerM: 1, outputPerM: 2 });
    svc.upsert({ model: 'k3', inputPerM: 3, outputPerM: 9 });
    const rows = svc.list();
    expect(rows.length).toBe(1);
    expect(rows[0]!.inputPerM).toBe(3);
    expect(rows[0]!.outputPerM).toBe(9);
  });

  test('rejects an empty model id and negative or non-finite rates', () => {
    expect(() => svc.upsert({ model: '  ', inputPerM: 1, outputPerM: 2 })).toThrow();
    expect(() => svc.upsert({ model: 'k3', inputPerM: -1, outputPerM: 2 })).toThrow();
    expect(() => svc.upsert({ model: 'k3', inputPerM: 1, outputPerM: Number.NaN })).toThrow();
    expect(() => svc.upsert({ model: 'k3', inputPerM: 1, outputPerM: 2, cacheReadPerM: -0.5 })).toThrow();
    expect(() => svc.upsert({ model: 'k3', inputPerM: MAX_MODEL_RATE_PER_M + 1, outputPerM: 2 })).toThrow();
  });

  test('a zero rate is storable — free is a price, absence is not', () => {
    const stored = svc.upsert({ model: 'local-llama', inputPerM: 0, outputPerM: 0 });
    expect(stored.inputPerM).toBe(0);
    expect(eventCost(usage('local-llama'), svc.effectiveRates())).toBe(0);
  });

  test('delete removes the override and reports a missing one', () => {
    svc.upsert({ model: 'k3', inputPerM: 1, outputPerM: 2 });
    svc.delete('k3');
    expect(svc.list().length).toBe(0);
    expect(() => svc.delete('k3')).toThrow(ModelRateNotFoundError);
  });

  test('effectiveRates adds a model the shipped card will never carry', () => {
    expect(findModelRate('qwen3.8-max-preview', DEFAULT_MODEL_RATES)).toBeUndefined();
    expect(eventCost(usage('qwen3.8-max-preview'), DEFAULT_MODEL_RATES)).toBeUndefined();

    svc.upsert({ model: 'qwen3.8-max-preview', inputPerM: 2, outputPerM: 8 });
    const rates = svc.effectiveRates();

    // 1M input + 1M output at 2/8 per million.
    expect(eventCost(usage('qwen3.8-max-preview'), rates)).toBeCloseTo(10, 10);
    // The shipped entries survive alongside it.
    expect(findModelRate('claude-opus-4-7', rates)?.inputPerM).toBe(5);
  });

  test('effectiveRates lets an override correct a stale shipped rate', () => {
    expect(findModelRate('gpt-5', DEFAULT_MODEL_RATES)?.inputPerM).toBe(1.25);
    svc.upsert({ model: 'gpt-5', inputPerM: 1.5, outputPerM: 11 });
    const rate = findModelRate('gpt-5', svc.effectiveRates());
    expect(rate?.inputPerM).toBe(1.5);
    expect(rate?.outputPerM).toBe(11);
  });

  test('an override covers the dated model ids that appear in transcripts', () => {
    const stored = svc.upsert({ model: 'deepseek-v4-20260401', inputPerM: 0.5, outputPerM: 1.5 });
    expect(stored.model).toBe('deepseek-v4');
    expect(findModelRate('deepseek-v4-20260401', svc.effectiveRates())?.inputPerM).toBe(0.5);
    expect(findModelRate('deepseek-v4-2026-04-01', svc.effectiveRates())?.inputPerM).toBe(0.5);
  });

  test('upsert removes a legacy dated row that would otherwise shadow the canonical rate', () => {
    const db = freshDb();
    const service = new ModelRateService({ db, clock: fixedClock(at) });
    db.prepare(`
      insert into model_rates(
        model, input_per_m, output_per_m, created_at, updated_at
      ) values (?,?,?,?,?)
    `).run('deepseek-v4-2026-04-01', 1, 2, at, at);

    service.upsert({ model: 'deepseek-v4', inputPerM: 9, outputPerM: 10 });

    expect(service.list().map((rate) => rate.model)).toEqual(['deepseek-v4']);
    expect(findModelRate('deepseek-v4-2026-04-01', service.effectiveRates())?.inputPerM).toBe(9);
  });

  test('cache usage stays unpriced until every used token class has a rate', () => {
    svc.upsert({ model: 'k3', inputPerM: 1, outputPerM: 2 });
    expect(eventCost({ ...usage('k3'), cacheReadTokens: 500_000 }, svc.effectiveRates())).toBeUndefined();

    svc.upsert({ model: 'k3', inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.25 });
    expect(eventCost({ ...usage('k3'), cacheReadTokens: 500_000 }, svc.effectiveRates())).toBeCloseTo(3.125, 10);
  });

  test('a model with neither an override nor a default stays unpriced', () => {
    svc.upsert({ model: 'k3', inputPerM: 1, outputPerM: 2 });
    expect(eventCost(usage('some-unlisted-model'), svc.effectiveRates())).toBeUndefined();
  });
});

describe('mergeModelRates', () => {
  test('overrides win on exact model id and additions are kept', () => {
    const merged = mergeModelRates(
      [{ model: 'a', inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1 }],
      [{ model: 'a', inputPerM: 9, outputPerM: 9 }, { model: 'b', inputPerM: 3, outputPerM: 4 }],
    );
    expect(merged.map((r) => r.model)).toEqual(['a', 'b']);
    expect(merged[0]!.inputPerM).toBe(9);
    // Omitting an optional cache field means "keep the shipped price", not
    // "silently count that token class as free".
    expect(merged[0]!.cacheReadPerM).toBe(0.1);
  });

  test('output is sorted by model id so the card is stable across calls', () => {
    const merged = mergeModelRates(
      [{ model: 'zeta', inputPerM: 1, outputPerM: 1 }],
      [{ model: 'alpha', inputPerM: 1, outputPerM: 1 }],
    );
    expect(merged.map((r) => r.model)).toEqual(['alpha', 'zeta']);
  });

  test('no overrides leaves the shipped card intact', () => {
    const merged = mergeModelRates(DEFAULT_MODEL_RATES, []);
    expect(merged.length).toBe(DEFAULT_MODEL_RATES.length);
    expect(findModelRate('claude-haiku-4-5', merged)?.outputPerM).toBe(5);
  });

  test('every shipped model prices cached input at its published standard rate', () => {
    const expected = [
      ['claude-opus-4-7', 5, 25, 0.5],
      ['claude-opus-4-6', 5, 25, 0.5],
      ['claude-sonnet-4-6', 3, 15, 0.3],
      ['claude-sonnet-4-5', 3, 15, 0.3],
      ['claude-haiku-4-5', 1, 5, 0.1],
      ['gpt-5', 1.25, 10, 0.125],
      ['gpt-4.1', 2, 8, 0.5],
      ['o4-mini', 1.1, 4.4, 0.275],
    ] as const;

    for (const [model, inputPerM, outputPerM, cacheReadPerM] of expected) {
      expect(findModelRate(model, DEFAULT_MODEL_RATES)).toMatchObject({
        model, inputPerM, outputPerM, cacheReadPerM,
      });
      expect(eventCost({ ...usage(model), cacheReadTokens: 1_000_000 }, DEFAULT_MODEL_RATES))
        .toBeCloseTo(inputPerM + outputPerM + cacheReadPerM, 10);
    }
  });
});

function usage(model: string) {
  return {
    ts: '2026-08-07T10:00:00.000Z',
    model,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    sourcePath: '/tmp/session.jsonl',
  };
}
