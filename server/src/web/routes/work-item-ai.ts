import { Hono } from 'hono';
import { z } from 'zod';
import type { DecisionDraftStatus } from '@stash/shared';
import type { AiDraftService } from '../../domain/ai-draft/service.js';
import type { AiProviderService } from '../../domain/ai-provider/service.js';
import { handleError } from '../errors.js';

const DecomposeBody = z.object({
  projectContext: z.string().optional(),
}).optional();

const DraftStatus = z.enum(['draft', 'accepted', 'rejected', 'edited']);

const ListDraftsQuery = z.object({
  runId: z.string().optional(),
  status: DraftStatus.optional(),
});

const RejectDraftBody = z.object({
  reason: z.string().trim().min(1).optional(),
}).optional();

export function createWorkItemAiRouter(ai: AiProviderService, drafts: AiDraftService): Hono {
  const r = new Hono();

  r.get('/ai-drafts', (c) => {
    try {
      const query = ListDraftsQuery.parse({
        runId: c.req.query('runId'),
        status: c.req.query('status') as DecisionDraftStatus | undefined,
      });
      const rows = drafts.listDrafts(query);
      const runs = rows
        .map((draft) => drafts.getRun(draft.runId))
        .filter((run, index, all) => !!run && all.findIndex((candidate) => candidate?.id === run.id) === index);
      return c.json({ data: rows, runs });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/ai-drafts/:draftId/reject', async (c) => {
    try {
      const raw = await c.req.text();
      const body = raw ? RejectDraftBody.parse(JSON.parse(raw)) : undefined;
      const rejected = drafts.rejectDraft(c.req.param('draftId'), body?.reason ?? 'discarded by reviewer');
      return c.json({ data: rejected });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/ai-runs/:runId/accept-drafts', async (c) => {
    try {
      const body = await c.req.json();
      const accepted = drafts.acceptDrafts(c.req.param('runId'), body);
      return c.json({ data: accepted });
    } catch (e) {
      return handleError(c, e);
    }
  });

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
