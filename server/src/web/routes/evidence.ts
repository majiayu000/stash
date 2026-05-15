import { Hono } from 'hono';
import { z } from 'zod';
import type { EvidenceService } from '../../domain/evidence/service.js';
import type { WorkItemSessionService } from '../../domain/work-item-session/service.js';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
import { handleError } from '../errors.js';

const CreateBody = z.object({
  workItemId: z.string().min(1),
  sessionId: z.string().optional(),
  provider: z.enum(['claude', 'codex']).optional(),
  kind: z.enum([
    'plan_task',
    'tool_call',
    'assistant_summary',
    'file_change',
    'manual_note',
  ]),
  text: z.string().min(1),
  sourcePath: z.string().optional(),
});

const ListQuery = z.object({
  workItemId: z.string().optional(),
  pendingOnly: z.union([z.literal('true'), z.literal('false')]).optional(),
});

export function createEvidenceRouter(
  evidence: EvidenceService,
  links: WorkItemSessionService,
  aggregator: AgentSourceAggregator,
): Hono {
  const r = new Hono();

  r.get('/', (c) => {
    try {
      const q = ListQuery.parse(c.req.query());
      const list = evidence.list({
        workItemId: q.workItemId,
        pendingOnly: q.pendingOnly === 'true',
      });
      return c.json({ data: list, count: list.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/', async (c) => {
    try {
      const body = CreateBody.parse(await c.req.json());
      const ev = evidence.create(body);
      return c.json({ data: ev }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  /**
   * Trigger inference: walk linked sessions for a work item and propose
   * completion candidates. Idempotent.
   */
  r.post('/infer/:workItemId', (c) => {
    try {
      const workItemId = c.req.param('workItemId');
      const linked = links.forWorkItem(workItemId);
      const scan = aggregator.scan({ provider: 'all', limitPerSource: 200 });
      const sessionMap = new Map(scan.sessions.map((s) => [`${s.provider}:${s.id}`, s] as const));
      const proposed = evidence.proposeFromSessions(
        workItemId,
        linked.map((l) => ({ provider: l.provider, sessionId: l.sessionId })),
        (provider, sessionId) => sessionMap.get(`${provider}:${sessionId}`),
      );
      return c.json({ data: proposed, count: proposed.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
