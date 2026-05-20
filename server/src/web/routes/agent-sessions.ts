import { Hono } from 'hono';
import { z } from 'zod';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
import type { DecisionCandidateService } from '../../domain/capture/decision-candidates.js';
import { extractDecisions } from '../../domain/capture/decision-extract.js';
import type { WorkItemSessionService } from '../../domain/work-item-session/service.js';
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

export function createAgentSessionsRouter(
  aggregator: AgentSourceAggregator,
  links: WorkItemSessionService,
  candidates: DecisionCandidateService,
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

  /** SPEC v0.3 §3h — decision candidates extracted from session events. */
  r.get('/:provider/:id/decision-candidates', (c) => {
    try {
      const provider = c.req.param('provider') as 'claude' | 'codex';
      const id = c.req.param('id');
      const query = CandidateQuery.parse(c.req.query());
      const { sessions } = aggregator.scan({ provider, limitPerSource: 500 });
      const found = sessions.find((s) => s.id === id);
      if (!found) return c.json({ error: { code: 'NOT_FOUND', message: 'session not found' } }, 404);
      const events = aggregator.getEvents(provider, found.sourcePath);
      const data = candidates.upsertMany(
        { projectId: query.projectId, provider, sessionId: id, sourcePath: found.sourcePath },
        extractDecisions(events),
      );
      return c.json({ data, count: data.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
