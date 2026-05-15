import { Hono } from 'hono';
import { z } from 'zod';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
import type { WorkItemSessionService } from '../../domain/work-item-session/service.js';
import { handleError } from '../errors.js';

const ProviderQuery = z.object({
  provider: z.enum(['claude', 'codex', 'all']).optional(),
});

export function createAgentSessionsRouter(
  aggregator: AgentSourceAggregator,
  links: WorkItemSessionService,
): Hono {
  const r = new Hono();

  r.get('/', (c) => {
    try {
      const { provider } = ProviderQuery.parse(c.req.query());
      const { sessions, errors } = aggregator.scan({ provider: provider ?? 'all', limitPerSource: 100 });
      const data = sessions.map((s) => ({
        ...s,
        linkedWorkItemIds: links.workItemsForSession(s.provider, s.id),
      }));
      return c.json({ data, errors, count: data.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:provider/:id', (c) => {
    try {
      const provider = c.req.param('provider');
      const id = c.req.param('id');
      const { sessions } = aggregator.scan({ provider: provider as 'claude' | 'codex', limitPerSource: 500 });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      return c.json({
        data: {
          ...found,
          linkedWorkItemIds: links.workItemsForSession(found.provider, found.id),
        },
      });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:provider/:id/events', (c) => {
    try {
      const provider = c.req.param('provider') as 'claude' | 'codex';
      const id = c.req.param('id');
      const { sessions } = aggregator.scan({ provider, limitPerSource: 500 });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      const events = aggregator.getEvents(provider, found.sourcePath);
      return c.json({ data: events, count: events.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
