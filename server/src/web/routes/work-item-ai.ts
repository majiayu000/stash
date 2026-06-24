import { Hono } from 'hono';
import { z } from 'zod';
import type { AiProviderService } from '../../domain/ai-provider/service.js';
import { handleError } from '../errors.js';

const DecomposeBody = z.object({
  projectContext: z.string().optional(),
}).optional();

export function createWorkItemAiRouter(ai: AiProviderService): Hono {
  const r = new Hono();

  r.post('/:id/decompose', async (c) => {
    try {
      const raw = await c.req.text();
      const body = raw ? DecomposeBody.parse(JSON.parse(raw)) : undefined;
      const result = await ai.decomposeIdea({
        ideaId: c.req.param('id'),
        projectContext: body?.projectContext,
      });
      return c.json({ data: result }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
