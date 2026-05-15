import { Hono } from 'hono';
import { z } from 'zod';
import type { EvidenceService } from '../../domain/evidence/service.js';
import type { WorkItemService } from '../../domain/work-item/service.js';
import type { WorkItemSessionService } from '../../domain/work-item-session/service.js';
import { handleError } from '../errors.js';
import {
  ChecklistAppendBody,
  ChecklistUpdateBody,
  CreateWorkItemBody,
  ListWorkItemsQuery,
  UpdateWorkItemBody,
} from '../schemas.js';

const LinkSessionBody = z.object({
  provider: z.enum(['claude', 'codex']),
  sessionId: z.string().min(1),
});

export function createWorkItemsRouter(
  service: WorkItemService,
  links?: WorkItemSessionService,
  evidence?: EvidenceService,
): Hono {
  const r = new Hono();

  r.get('/', (c) => {
    try {
      // Express the multi-value 'status' query: ?status=planned&status=active
      const raw = c.req.queries();
      const normalized: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(raw)) {
        normalized[k] = v.length === 1 ? v[0]! : v;
      }
      const parsed = ListWorkItemsQuery.parse(normalized);
      const items = service.list(parsed);
      return c.json({ data: items, count: items.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/', async (c) => {
    try {
      const body = CreateWorkItemBody.parse(await c.req.json());
      const item = service.create(body);
      return c.json({ data: item }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:id', (c) => {
    try {
      const item = service.get(c.req.param('id'));
      if (!item) return c.json({ error: { code: 'NOT_FOUND', message: 'work item not found' } }, 404);
      return c.json({ data: item });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.patch('/:id', async (c) => {
    try {
      const body = UpdateWorkItemBody.parse(await c.req.json());
      const item = service.update(c.req.param('id'), body);
      return c.json({ data: item });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.delete('/:id', (c) => {
    try {
      service.delete(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/:id/checklist', async (c) => {
    try {
      const body = ChecklistAppendBody.parse(await c.req.json());
      const item = service.appendChecklistItem(c.req.param('id'), body.text);
      return c.json({ data: item }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.patch('/:id/checklist/:itemId', async (c) => {
    try {
      const body = ChecklistUpdateBody.parse(await c.req.json());
      const id = c.req.param('id');
      const itemId = c.req.param('itemId');
      let item = service.get(id);
      if (!item) return c.json({ error: { code: 'NOT_FOUND', message: 'work item not found' } }, 404);
      if (body.toggle) item = service.toggleChecklistItem(id, itemId);
      if (body.text) item = service.renameChecklistItem(id, itemId, body.text);
      return c.json({ data: item });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.delete('/:id/checklist/:itemId', (c) => {
    try {
      const item = service.removeChecklistItem(c.req.param('id'), c.req.param('itemId'));
      return c.json({ data: item });
    } catch (e) {
      return handleError(c, e);
    }
  });

  if (links) {
    r.get('/:id/sessions', (c) => {
      try {
        return c.json({ data: links.forWorkItem(c.req.param('id')) });
      } catch (e) {
        return handleError(c, e);
      }
    });

    r.post('/:id/link-session', async (c) => {
      try {
        const body = LinkSessionBody.parse(await c.req.json());
        const link = links.link(c.req.param('id'), body.provider, body.sessionId);
        return c.json({ data: link }, 201);
      } catch (e) {
        return handleError(c, e);
      }
    });

    r.delete('/:id/link-session/:provider/:sessionId', (c) => {
      try {
        const provider = c.req.param('provider') as 'claude' | 'codex';
        links.unlink(c.req.param('id'), provider, c.req.param('sessionId'));
        return c.body(null, 204);
      } catch (e) {
        return handleError(c, e);
      }
    });
  }

  if (evidence) {
    r.post('/:id/accept-completion', (c) => {
      try {
        const updated = evidence.acceptCompletion(c.req.param('id'));
        return c.json({ data: updated });
      } catch (e) {
        return handleError(c, e);
      }
    });

    r.post('/:id/reject-completion', (c) => {
      try {
        const cleared = evidence.rejectCompletion(c.req.param('id'));
        return c.json({ data: { cleared } });
      } catch (e) {
        return handleError(c, e);
      }
    });
  }

  return r;
}
