import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Database } from 'bun:sqlite';
import { systemClock, type AgentProvider, type Clock } from '@stash/shared';
import { AgentSourceAggregator } from '../adapters/aggregator.js';
import { ClaudeSource } from '../adapters/claude/scanner.js';
import { CodexSource } from '../adapters/codex/scanner.js';
import type { AgentSource } from '../adapters/source.js';
import { AreaService } from '../domain/area/service.js';
import { EvidenceService } from '../domain/evidence/service.js';
import { WorkItemService } from '../domain/work-item/service.js';
import { WorkItemSessionService } from '../domain/work-item-session/service.js';
import { createAreasRouter } from './routes/areas.js';
import { createAgentSessionsRouter } from './routes/agent-sessions.js';
import { createEvidenceRouter } from './routes/evidence.js';
import { createOverviewRouter } from './routes/overview.js';
import { createWorkItemsRouter } from './routes/work-items.js';
import { createWorkboardRouter } from './routes/workboard.js';

export interface AppContext {
  db: Database;
  clock?: Clock;
  claudeRoot?: string;
  codexRoot?: string;
  /** Test override: replace the default Claude/Codex sources. */
  sourcesOverride?: Map<AgentProvider, { source: AgentSource; root: string }>;
}

export function createApp(ctx: AppContext): Hono {
  const clock = ctx.clock ?? systemClock;
  const areaService = new AreaService({ db: ctx.db, clock });
  const workItemService = new WorkItemService({ db: ctx.db, clock });
  const sessionLinks = new WorkItemSessionService({ db: ctx.db, clock });
  const evidenceService = new EvidenceService({ db: ctx.db, clock });

  const sources =
    ctx.sourcesOverride ??
    (() => {
      const map = new Map<AgentProvider, { source: AgentSource; root: string }>();
      if (ctx.claudeRoot) {
        map.set('claude', { source: new ClaudeSource(), root: ctx.claudeRoot });
      }
      if (ctx.codexRoot) {
        map.set('codex', { source: new CodexSource(), root: ctx.codexRoot });
      }
      return map;
    })();

  const aggregator = new AgentSourceAggregator(sources);

  const app = new Hono();
  app.use('*', cors());

  app.get('/health', (c) =>
    c.json({ ok: true, service: 'stash', version: '0.0.1', time: clock.nowIso() }),
  );

  app.route('/api/areas', createAreasRouter(areaService));
  app.route(
    '/api/work-items',
    createWorkItemsRouter(workItemService, sessionLinks, evidenceService),
  );
  app.route('/api/overview', createOverviewRouter(workItemService, clock));
  app.route('/api/agent-sessions', createAgentSessionsRouter(aggregator, sessionLinks));
  app.route('/api/workboard', createWorkboardRouter(workItemService, sessionLinks, aggregator));
  app.route('/api/evidence', createEvidenceRouter(evidenceService, sessionLinks, aggregator));

  return app;
}
