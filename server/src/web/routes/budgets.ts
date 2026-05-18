import { Hono } from 'hono';
import { z } from 'zod';
import type { BudgetService } from '../../domain/budget/service.js';
import { handleError } from '../errors.js';

const BudgetPeriod = z.enum(['day', 'week', 'month', 'quarter']);
const CreateBudgetBody = z.object({
  scope: z.string().min(1),
  capUsd: z.number().positive(),
  period: BudgetPeriod.optional(),
  notes: z.string().optional(),
});
const UpdateBudgetBody = z.object({
  scope: z.string().min(1).optional(),
  capUsd: z.number().positive().optional(),
  period: BudgetPeriod.optional(),
  notes: z.string().optional(),
});

export function createBudgetsRouter(service: BudgetService): Hono {
  const r = new Hono();

  r.get('/', (c) => {
    try { return c.json({ data: service.list() }); } catch (e) { return handleError(c, e); }
  });

  r.post('/', async (c) => {
    try {
      const body = CreateBudgetBody.parse(await c.req.json());
      return c.json({ data: service.create(body) }, 201);
    } catch (e) { return handleError(c, e); }
  });

  r.patch('/:id', async (c) => {
    try {
      const body = UpdateBudgetBody.parse(await c.req.json());
      return c.json({ data: service.update(c.req.param('id'), body) });
    } catch (e) { return handleError(c, e); }
  });

  r.delete('/:id', (c) => {
    try { service.delete(c.req.param('id')); return c.body(null, 204); }
    catch (e) { return handleError(c, e); }
  });

  return r;
}
