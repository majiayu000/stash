import { Hono } from 'hono';
import { systemClock, type Clock } from '@stash/shared';
import { z } from 'zod';
import type { AreaService } from '../../domain/area/service.js';
import { parseCaptureInput } from '../../domain/capture/parser.js';
import type { EvidenceService } from '../../domain/evidence/service.js';
import type { JournalService } from '../../domain/work-item/journal.js';
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

const CaptureBody = z.object({ raw: z.string().min(1) });

const LinkSessionBody = z.object({
  provider: z.enum(['claude', 'codex']),
  sessionId: z.string().min(1),
});

export interface WorkItemsRouterDeps {
  areaService?: AreaService;
  journal?: JournalService;
  clock?: Clock;
}

export function createWorkItemsRouter(
  service: WorkItemService,
  links?: WorkItemSessionService,
  evidence?: EvidenceService,
  deps: WorkItemsRouterDeps = {},
): Hono {
  const r = new Hono();
  const clock = deps.clock ?? systemClock;

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

  /** SPEC v0.3 §3d — canonical Today list. */
  r.get('/today', (c) => {
    try {
      const items = service.today();
      return c.json({ data: items, count: items.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  /** SPEC v0.3 §3h — stale items digest. */
  r.get('/stale', (c) => {
    try {
      const url = new URL(c.req.url);
      const days = url.searchParams.get('days');
      const items = service.staleItems({ days: days ? Number(days) : undefined });
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

  /** SPEC v0.3 §3b — quick capture with inline token parsing. */
  r.post('/capture', async (c) => {
    try {
      const { raw } = CaptureBody.parse(await c.req.json());
      const areas = deps.areaService?.list() ?? [];
      const parsed = parseCaptureInput(raw, { areas, nowIso: clock.nowIso() });
      const item = service.create({
        title: parsed.title || raw.trim(),
        projectId: parsed.projectId,
        areaId: parsed.areaId,
        labels: parsed.labels,
        priority: parsed.priority,
        scheduledFor: parsed.scheduledFor,
        dueAt: parsed.dueAt,
        estimateMinutes: parsed.estimateMinutes,
        rawInput: raw,
        kind: 'idea',
        status: 'inbox',
      });
      // Decorate parsed with human-readable project name for CLI / UI display.
      const projectName = parsed.projectId
        ? areas.find((a) => a.id === parsed.projectId)?.name
        : undefined;
      return c.json({ data: item, parsed: { ...parsed, projectName } }, 201);
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

  r.get('/:id/subtasks', (c) => {
    try {
      const parent = service.get(c.req.param('id'));
      if (!parent) return c.json({ error: { code: 'NOT_FOUND', message: 'work item not found' } }, 404);
      const items = service.list({ parentId: parent.id, includeDropped: true });
      return c.json({ data: items, count: items.length });
    } catch (e) {
      return handleError(c, e);
    }
  });

  // v0.8 — per-todo journal (only mounted if deps.journal is provided).
  if (deps.journal) {
    const j = deps.journal;
    r.get('/:id/journal', (c) => {
      try {
        if (!service.get(c.req.param('id'))) return c.json({ error: { code: 'NOT_FOUND', message: 'work item not found' } }, 404);
        const entries = j.list(c.req.param('id'));
        return c.json({ data: entries, count: entries.length });
      } catch (e) { return handleError(c, e); }
    });
    r.post('/:id/journal', async (c) => {
      try {
        if (!service.get(c.req.param('id'))) return c.json({ error: { code: 'NOT_FOUND', message: 'work item not found' } }, 404);
        const body = z.object({ body: z.string().min(1) }).parse(await c.req.json());
        const entry = j.append(c.req.param('id'), body);
        return c.json({ data: entry }, 201);
      } catch (e) { return handleError(c, e); }
    });
    r.delete('/:id/journal/:entryId', (c) => {
      try {
        const ok = j.delete(c.req.param('entryId'));
        if (!ok) return c.json({ error: { code: 'NOT_FOUND', message: 'entry not found' } }, 404);
        return c.body(null, 204);
      } catch (e) { return handleError(c, e); }
    });
  }

  /** SPEC v0.3 §3e — triage shortcuts: today_pinned toggle. */
  r.post('/:id/today-pin', async (c) => {
    try {
      const body = z.object({ pinned: z.boolean() }).parse(await c.req.json());
      const item = service.update(c.req.param('id'), { todayPinned: body.pinned });
      return c.json({ data: item });
    } catch (e) {
      return handleError(c, e);
    }
  });

  /** SPEC v0.3 §3e — priority shortcut. */
  r.post('/:id/priority', async (c) => {
    try {
      const body = z.object({ priority: z.enum(['p0', 'p1', 'p2', 'p3']) }).parse(await c.req.json());
      const item = service.update(c.req.param('id'), { priority: body.priority });
      return c.json({ data: item });
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
