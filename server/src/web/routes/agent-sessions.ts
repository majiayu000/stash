import { Hono } from 'hono';
import { z } from 'zod';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
import { extractDecisions } from '../../domain/capture/decision-extract.js';
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

  r.get('/', async (c) => {
    try {
      const { provider } = ProviderQuery.parse(c.req.query());
      const { sessions, errors, cache } = await aggregator.scanAsync({
        provider: provider ?? 'all',
        limitPerSource: 100,
      });
      const data = sessions.map((s) => ({
        ...s,
        linkedWorkItemIds: links.workItemsForSession(s.provider, s.id),
      }));
      return c.json({ data, errors, count: data.length, cache });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:provider/:id', async (c) => {
    try {
      const provider = c.req.param('provider');
      const id = c.req.param('id');
      const { sessions, cache } = await aggregator.scanAsync({
        provider: provider as 'claude' | 'codex',
        limitPerSource: 500,
      });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      return c.json({
        data: {
          ...found,
          linkedWorkItemIds: links.workItemsForSession(found.provider, found.id),
        },
        cache,
      });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:provider/:id/events', async (c) => {
    try {
      const provider = c.req.param('provider') as 'claude' | 'codex';
      const id = c.req.param('id');
      const { sessions, cache } = await aggregator.scanAsync({ provider, limitPerSource: 500 });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      const events = aggregator.getEvents(provider, found.sourcePath);
      return c.json({ data: events, count: events.length, cache });
    } catch (e) {
      return handleError(c, e);
    }
  });

  /** SPEC v0.3 §3h — decision candidates extracted from session events. */
  r.get('/:provider/:id/decision-candidates', async (c) => {
    try {
      const provider = c.req.param('provider') as 'claude' | 'codex';
      const id = c.req.param('id');
      const { sessions, cache } = await aggregator.scanAsync({ provider, limitPerSource: 500 });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      const events = aggregator.getEvents(provider, found.sourcePath);
      const candidates = extractDecisions(events);
      return c.json({ data: candidates, count: candidates.length, cache });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
