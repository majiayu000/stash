import { Hono } from 'hono';
import { z } from 'zod';
import type { WorkItemCoachService } from '../../domain/work-item/coach.js';
import { handleError } from '../errors.js';

const AskBody = z.object({
  body: z.string().trim().min(1),
});

const SummarizeBody = z.object({
  destination: z.enum(['description', 'journal']),
  messageIds: z.array(z.string().trim().min(1)).optional(),
});

const ApplySummaryBody = z.object({
  runId: z.string().trim().min(1),
  sourceMessageId: z.string().trim().min(1),
  destination: z.enum(['description', 'journal']),
});

export function createWorkItemCoachRouter(coach: WorkItemCoachService): Hono {
  const r = new Hono();

  r.get('/:id/coach/messages', (c) => {
    try {
      return c.json({ data: coach.listMessages(c.req.param('id')) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/:id/coach/messages', async (c) => {
    try {
      const body = AskBody.parse(await c.req.json());
      return c.json({ data: await coach.ask(c.req.param('id'), body.body) }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/:id/coach/summarize', async (c) => {
    try {
      const body = SummarizeBody.parse(await c.req.json());
      return c.json({ data: await coach.summarize(c.req.param('id'), body) }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/:id/coach/apply-summary', async (c) => {
    try {
      const body = ApplySummaryBody.parse(await c.req.json());
      return c.json({ data: coach.applySummary(c.req.param('id'), body) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:id/ai-writes', (c) => {
    try {
      return c.json({ data: coach.listWrites(c.req.param('id')) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
