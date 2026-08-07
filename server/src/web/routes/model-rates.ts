import { Hono } from 'hono';
import { z } from 'zod';
import type { ModelRateService } from '../../domain/model-rate/service.js';
import { handleError } from '../errors.js';

const PerMillion = z.number().finite().nonnegative();
const UpsertModelRateBody = z.object({
  model: z.string().min(1),
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
      const body = UpsertModelRateBody.parse(await c.req.json());
      return c.json({ data: service.upsert(body) });
    } catch (e) { return handleError(c, e); }
  });

  r.delete('/:model', (c) => {
    try {
      service.delete(decodeURIComponent(c.req.param('model')));
      return c.body(null, 204);
    } catch (e) { return handleError(c, e); }
  });

  return r;
}
