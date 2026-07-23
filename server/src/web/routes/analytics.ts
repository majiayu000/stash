import { Hono } from 'hono';
import { z } from 'zod';
import type { BurnService } from '../../domain/analytics/burn.js';
import { isValidIsoWeekLabel, type WeeklyReviewService } from '../../domain/analytics/weekly.js';
import { handleError } from '../errors.js';

const BurnQuery = z.object({
  days: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || Number.isFinite(v), 'days must be a finite number'),
  endMs: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || Number.isFinite(v), 'endMs must be a finite number'),
});

const WeeklyQuery = z.object({
  week: z.string().refine(isValidIsoWeekLabel, 'week must be a valid ISO week').optional(),
});

export function createAnalyticsRouter(burn: BurnService, weekly: WeeklyReviewService): Hono {
  const r = new Hono();

  r.get('/burn', async (c) => {
    try {
      const q = BurnQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
      const snapshot = await burn.snapshotAsync({ days: q.days, endMs: q.endMs });
      return c.json(snapshot);
    } catch (e) {
      return handleError(c, e);
    }
  });

  r.get('/weekly', async (c) => {
    try {
      const q = WeeklyQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
      const snapshot = await weekly.snapshotAsync(q);
      return c.json(snapshot);
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
