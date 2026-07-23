import { Hono } from 'hono';
import { z } from 'zod';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
import type { DecisionCandidateService } from '../../domain/capture/decision-candidates.js';
import type { WorkItemSessionService } from '../../domain/work-item-session/service.js';
import {
  DEFAULT_SESSION_EVENT_PAGE_LIMIT,
  isSessionEventCursor,
  MAX_SESSION_EVENT_PAGE_LIMIT,
} from '../../adapters/session-event-page.js';
import { handleError } from '../errors.js';

const ProviderQuery = z.object({
  provider: z.enum(['claude', 'codex', 'all']).optional(),
});

const CandidateQuery = z.object({
  projectId: z.string().optional(),
});

const AcceptCandidateBody = z.object({
  decisionId: z.string().min(1),
});

const ProviderParam = z.enum(['claude', 'codex']);

const EventPageQuery = z.object({
  cursor: z.string().refine(isSessionEventCursor, 'invalid session event cursor').optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SESSION_EVENT_PAGE_LIMIT)
    .default(DEFAULT_SESSION_EVENT_PAGE_LIMIT),
});

export function createAgentSessionsRouter(
  aggregator: AgentSourceAggregator,
  links: WorkItemSessionService,
  candidates: DecisionCandidateService,
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

  r.post('/decision-candidates/:candidateId/accept', async (c) => {
    try {
      const body = AcceptCandidateBody.parse(await c.req.json());
      return c.json({ data: candidates.accept(c.req.param('candidateId'), body.decisionId) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/decision-candidates/:candidateId/ignore', (c) => {
    try {
      return c.json({ data: candidates.ignore(c.req.param('candidateId')) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:provider/:id', async (c) => {
    try {
      const provider = ProviderParam.parse(c.req.param('provider'));
      const id = c.req.param('id');
      const { sessions, cache } = await aggregator.scanAsync({
        provider,
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
      const provider = ProviderParam.parse(c.req.param('provider'));
      const id = c.req.param('id');
      const query = EventPageQuery.parse(c.req.query());
      const { sessions, cache } = await aggregator.scanAsync({ provider });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      const page = await aggregator.getEventPageAsync({
        provider,
        sourcePath: found.sourcePath,
        cursor: query.cursor,
        limit: query.limit,
      });
      return c.json({ ...page, count: page.data.length, cache });
    } catch (e) {
      return handleError(c, e);
    }
  });

  /** SPEC v0.3 §3h — decision candidates extracted from session events. */
  r.get('/:provider/:id/decision-candidates', async (c) => {
    try {
      const provider = ProviderParam.parse(c.req.param('provider'));
      const id = c.req.param('id');
      const query = CandidateQuery.parse(c.req.query());
      const { sessions, cache } = await aggregator.scanAsync({ provider });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      const extracted = await aggregator.getDecisionCandidatesAsync({
        provider,
        sourcePath: found.sourcePath,
      });
      const data = candidates.upsertMany(
        { projectId: query.projectId, provider, sessionId: id, sourcePath: found.sourcePath },
        extracted,
      );
      return c.json({ data, count: data.length, cache });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
