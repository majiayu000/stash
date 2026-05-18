import { Hono } from 'hono';
import { z } from 'zod';
import type { SessionDispatchService } from '../../domain/session-dispatch/service.js';
import { handleError } from '../errors.js';

const StartBody = z.object({
  workItemId: z.string().min(1),
  tool: z.enum(['claude', 'codex']),
  extraInstructions: z.string().optional(),
});

/**
 * v1.0 — /api/sessions/start
 *
 * Composes a Claude/Codex initial prompt from a work item + its project
 * context (intent, lessons, bound skills, open sub-tasks). Optionally
 * spawns the matching CLI; on PATH-miss returns the prompt + a copy-pasteable
 * command so the user can run it themselves.
 */
export function createSessionsRouter(dispatch: SessionDispatchService): Hono {
  const r = new Hono();

  r.post('/start', async (c) => {
    try {
      const body = StartBody.parse(await c.req.json());
      const result = dispatch.dispatch(body);
      return c.json({ data: result }, result.spawned ? 201 : 200);
    } catch (e) { return handleError(c, e); }
  });

  // Preview / debug: compose without spawning the CLI. Same shape minus spawn fields.
  r.post('/compose', async (c) => {
    try {
      const body = StartBody.parse(await c.req.json());
      const result = dispatch.compose(body);
      return c.json({ data: result });
    } catch (e) { return handleError(c, e); }
  });

  return r;
}
