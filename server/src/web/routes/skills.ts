import { Hono } from 'hono';
import type { SkillService } from '../../domain/skill/service.js';
import { handleError } from '../errors.js';
import { CreateSkillBody, SetProjectBindingsBody, ToggleBindingBody, UpdateSkillBody } from '../schemas.js';

export function createSkillsRouter(service: SkillService): Hono {
  const r = new Hono();

  // ─── Catalog ─────────────────────────────────────────────────────────

  r.get('/', (c) => {
    try {
      const installed = c.req.query('installed');
      const filter = installed === undefined
        ? undefined
        : { installed: installed === 'true' };
      return c.json({ data: service.list(filter) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/', async (c) => {
    try {
      const body = CreateSkillBody.parse(await c.req.json());
      const s = service.create(body);
      return c.json({ data: s }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/:id', (c) => {
    try {
      const s = service.get(c.req.param('id'));
      if (!s) return c.json({ error: 'not found' }, 404);
      return c.json({ data: s });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.patch('/:id', async (c) => {
    try {
      const body = UpdateSkillBody.parse(await c.req.json());
      const s = service.update(c.req.param('id'), body);
      return c.json({ data: s });
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

  return r;
}

/**
 * Project↔skill bindings live under /api/projects/:projectId/skills.
 * Mounted separately in app-factory so the URL shape mirrors the SPEC.
 */
export function createProjectSkillsRouter(service: SkillService): Hono {
  const r = new Hono();

  r.get('/:projectId/skills', (c) => {
    try {
      return c.json({ data: service.listBindingsForProject(c.req.param('projectId')) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.put('/:projectId/skills', async (c) => {
    try {
      const body = SetProjectBindingsBody.parse(await c.req.json());
      const bindings = service.setProjectBindings(c.req.param('projectId'), body.skillIds);
      return c.json({ data: bindings });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/:projectId/skills/:skillId', async (c) => {
    try {
      const body = ToggleBindingBody.parse(await c.req.json());
      const binding = service.toggleBinding(
        c.req.param('projectId'),
        c.req.param('skillId'),
        body.enabled,
      );
      return c.json({ data: binding });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.delete('/:projectId/skills/:skillId', (c) => {
    try {
      service.unbind(c.req.param('projectId'), c.req.param('skillId'));
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
