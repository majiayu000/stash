import { Hono } from 'hono';
import type { AreaService } from '../../domain/area/service.js';
import { handleError } from '../errors.js';
import { CreateAreaBody, UpdateAreaBody } from '../schemas.js';

export function createAreasRouter(service: AreaService): Hono {
  const r = new Hono();

  r.get('/', (c) => {
    try {
      return c.json({ data: service.list() });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.post('/', async (c) => {
    try {
      const body = CreateAreaBody.parse(await c.req.json());
      const area = service.create(body);
      return c.json({ data: area }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.patch('/:id', async (c) => {
    try {
      const body = UpdateAreaBody.parse(await c.req.json());
      const area = service.update(c.req.param('id'), body);
      return c.json({ data: area });
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
