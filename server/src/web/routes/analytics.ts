import { Hono } from 'hono';
import { z } from 'zod';
import type { BurnService } from '../../domain/analytics/burn.js';
import type { WeeklyReviewService } from '../../domain/analytics/weekly.js';
import { handleError } from '../errors.js';

const BurnQuery = z.object({
  days: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v))),
});

const WeeklyQuery = z.object({
  week: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
});

export function createAnalyticsRouter(burn: BurnService, weekly: WeeklyReviewService): Hono {
  const r = new Hono();

  r.get('/burn', (c) => {
    try {
      const q = BurnQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
      return c.json({ data: burn.snapshot({ days: q.days }) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/weekly', (c) => {
    try {
      const q = WeeklyQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
      return c.json({ data: weekly.snapshot(q) });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
