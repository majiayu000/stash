import { Hono } from 'hono';
import { z } from 'zod';
import { MAX_MODEL_RATE_PER_M, normalize_model_rate_id } from '@stash/shared';
import type { ModelRateService } from '../../domain/model-rate/service.js';
import { handleError, RequestValidationError } from '../errors.js';

const PerMillion = z.number().finite().nonnegative().max(MAX_MODEL_RATE_PER_M);
const UpsertModelRateBody = z.object({
  model: z.string().trim().min(1).refine(
    (model) => normalize_model_rate_id(model).length > 0,
    'model id must contain a name before any release date',
  ),
  inputPerM: PerMillion,
  outputPerM: PerMillion,
  cacheReadPerM: PerMillion.optional(),
  cacheWritePerM: PerMillion.optional(),
});

export function createModelRatesRouter(service: ModelRateService): Hono {
  const r = new Hono();

  /** Stored overrides plus the merged card, so Settings can show both. */
  r.get('/', (c) => {
    try {
      return c.json({ data: { overrides: service.list(), effective: service.effectiveRates() } });
    } catch (e) { return handleError(c, e); }
  });

  r.put('/', async (c) => {
    try {
      const body = UpsertModelRateBody.parse(await required_json_body(c.req.raw));
      return c.json({ data: service.upsert(body) });
    } catch (e) { return handleError(c, e); }
  });

  r.delete('/:model', (c) => {
    try {
      service.delete(c.req.param('model'));
      return c.body(null, 204);
    } catch (e) { return handleError(c, e); }
  });

  return r;
}

async function required_json_body(request: Request): Promise<unknown> {
  const raw = await request.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestValidationError('request body must be valid JSON');
  }
}
