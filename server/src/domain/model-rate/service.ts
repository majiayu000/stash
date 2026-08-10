import type { Database } from 'bun:sqlite';
import {
  DEFAULT_MODEL_RATES,
  MAX_MODEL_RATE_PER_M,
  mergeModelRates,
  normalize_model_rate_id,
  systemClock,
  type Clock,
  type ModelRate,
  type ModelRateOverride,
  type UpsertModelRateInput,
} from '@stash/shared';

/**
 * v0.13 — user-owned rate overrides. The shipped `DEFAULT_MODEL_RATES` card
 * cannot cover models reached through a proxy, and it goes stale on its own
 * schedule; this service is the path that does not require editing source.
 *
 * It stores prices and nothing else. It never guesses one: a model with no row
 * and no shipped default stays unpriced, and the caller reports it through
 * `BurnPricingCoverage` rather than counting it as free spend.
 */

export class ModelRateNotFoundError extends Error {
  constructor(model: string) {
    super(`model rate ${model} not found`);
    this.name = 'ModelRateNotFoundError';
  }
}

interface Row {
  model: string;
  input_per_m: number;
  output_per_m: number;
  cache_read_per_m: number | null;
  cache_write_per_m: number | null;
  created_at: string;
  updated_at: string;
}

function row(r: Row): ModelRateOverride {
  const rate: ModelRateOverride = {
    model: r.model,
    inputPerM: r.input_per_m,
    outputPerM: r.output_per_m,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (r.cache_read_per_m !== null) rate.cacheReadPerM = r.cache_read_per_m;
  if (r.cache_write_per_m !== null) rate.cacheWritePerM = r.cache_write_per_m;
  return rate;
}

function assert_rate(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MODEL_RATE_PER_M) {
    throw new Error(`model rate ${field} must be between 0 and ${MAX_MODEL_RATE_PER_M}`);
  }
  return value;
}

export interface ModelRateServiceDeps { db: Database; clock?: Clock }

export class ModelRateService {
  private readonly clock: Clock;
  constructor(private readonly deps: ModelRateServiceDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  /** Stored overrides only — what the user has actually configured. */
  list(): ModelRateOverride[] {
    return this.deps.db
      .query<Row, []>('select * from model_rates order by model asc')
      .all()
      .map(row);
  }

  /**
   * The card every cost calculation should use: overrides applied over the
   * shipped defaults. Read per request rather than cached, so a rate added in
   * Settings takes effect on the next refresh instead of the next restart.
   */
  effectiveRates(): ModelRate[] {
    return mergeModelRates(DEFAULT_MODEL_RATES, this.list());
  }

  upsert(input: UpsertModelRateInput): ModelRateOverride {
    const supplied_model = input.model.trim();
    const model = normalize_model_rate_id(supplied_model);
    if (!model) throw new Error('model rate id is required');
    const inputPerM = assert_rate(input.inputPerM, 'inputPerM');
    const outputPerM = assert_rate(input.outputPerM, 'outputPerM');
    const cacheReadPerM = input.cacheReadPerM === undefined
      ? null
      : assert_rate(input.cacheReadPerM, 'cacheReadPerM');
    const cacheWritePerM = input.cacheWritePerM === undefined
      ? null
      : assert_rate(input.cacheWritePerM, 'cacheWritePerM');
    const now = this.clock.nowIso();

    this.deps.db.transaction(() => {
      const legacy_models = this.deps.db
        .query<{ model: string }, []>('select model from model_rates')
        .all()
        .filter((stored) => stored.model !== model && normalize_model_rate_id(stored.model) === model);
      const delete_statement = this.deps.db.prepare('delete from model_rates where model = ?');
      for (const legacy_model of legacy_models) {
        delete_statement.run(legacy_model.model);
      }
      this.deps.db
        .prepare(`
          insert into model_rates(
            model, input_per_m, output_per_m, cache_read_per_m, cache_write_per_m,
            created_at, updated_at
          ) values (?,?,?,?,?,?,?)
          on conflict(model) do update set
            input_per_m       = excluded.input_per_m,
            output_per_m      = excluded.output_per_m,
            cache_read_per_m  = excluded.cache_read_per_m,
            cache_write_per_m = excluded.cache_write_per_m,
            updated_at        = excluded.updated_at
        `)
        .run(model, inputPerM, outputPerM, cacheReadPerM, cacheWritePerM, now, now);
    })();

    const stored = this.deps.db
      .query<Row, [string]>('select * from model_rates where model = ?')
      .get(model);
    if (!stored) throw new ModelRateNotFoundError(model);
    return row(stored);
  }

  delete(model: string): void {
    const statement = this.deps.db.prepare('delete from model_rates where model = ?');
    const exact = statement.run(model);
    if (exact.changes > 0) return;

    const canonical_model = normalize_model_rate_id(model);
    if (canonical_model !== model && statement.run(canonical_model).changes > 0) return;
    throw new ModelRateNotFoundError(model);
  }
}
