import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { z } from 'zod';
import { systemClock, ulid, type Clock, type MeetingTriageSource } from '@stash/shared';
import type { AiProviderService } from '../../domain/ai-provider/service.js';
import { handleError } from '../errors.js';

const ImportMeetingBody = z.object({
  title: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  sourcePath: z.string().trim().min(1).optional(),
});

export function createMeetingTriageRouter(deps: {
  db: Database;
  ai: AiProviderService;
  clock?: Clock;
}): Hono {
  const r = new Hono();
  const clock = deps.clock ?? systemClock;

  r.post('/import', async (c) => {
    try {
      const body = ImportMeetingBody.parse(await c.req.json());
      const source: MeetingTriageSource = {
        id: ulid(clock.now()),
        title: body.title,
        body: body.text,
        sourcePath: body.sourcePath,
        createdAt: clock.nowIso(),
      };
      deps.db.prepare(
        `insert into meeting_triage_sources(id, title, body, source_path, created_at)
         values (?, ?, ?, ?, ?)`,
      ).run(source.id, source.title ?? null, source.body, source.sourcePath ?? null, source.createdAt);

      const result = await deps.ai.triageMeeting({
        sourceId: source.id,
        title: source.title,
        text: source.body,
        sourcePath: source.sourcePath,
      });
      return c.json({ data: { source, ...result } }, 201);
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
