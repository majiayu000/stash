import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import type { Database } from 'bun:sqlite';
import { systemClock, type AgentProvider, type Clock } from '@stash/shared';
import { AgentSourceAggregator } from '../adapters/aggregator.js';
import { ClaudeSource } from '../adapters/claude/scanner.js';
import { CodexSource } from '../adapters/codex/scanner.js';
import { AgentSessionCache } from '../adapters/session-cache.js';
import type { AgentSource } from '../adapters/source.js';
import { AreaService } from '../domain/area/service.js';
import { EvidenceService } from '../domain/evidence/service.js';
import { BurnService } from '../domain/analytics/burn.js';
import { BudgetService } from '../domain/budget/service.js';
import { DecisionCandidateService } from '../domain/capture/decision-candidates.js';
import { DispatchRunService } from '../domain/session-dispatch/runs.js';
import { SessionDispatchService } from '../domain/session-dispatch/service.js';
import { WeeklyReviewService } from '../domain/analytics/weekly.js';
import { ProjectKnowledgeService } from '../domain/project-knowledge/service.js';
import { SkillService } from '../domain/skill/service.js';
import { JournalService } from '../domain/work-item/journal.js';
import { WorkItemService } from '../domain/work-item/service.js';
import { WorkItemSessionService } from '../domain/work-item-session/service.js';
import { createAreasRouter } from './routes/areas.js';
import { createAgentSessionsRouter } from './routes/agent-sessions.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createBudgetsRouter } from './routes/budgets.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createEvidenceRouter } from './routes/evidence.js';
import { createOverviewRouter } from './routes/overview.js';
import {
  createLessonsRouter,
  createProjectKnowledgeRouter,
} from './routes/project-knowledge.js';
import { createProjectSkillsRouter, createSkillsRouter } from './routes/skills.js';
import { createWorkItemsRouter } from './routes/work-items.js';
import { createWorkboardRouter } from './routes/workboard.js';
import { apiError } from './errors.js';

export const LOCAL_CLIENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
] as const;

function resolveAllowedOrigins(extraOrigins: readonly string[] = []): string[] {
  return Array.from(new Set([...LOCAL_CLIENT_ORIGINS, ...extraOrigins]));
}

function rejectUntrustedBrowserOrigins(allowedOrigins: ReadonlySet<string>): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins.has(origin)) {
      return c.json(apiError('FORBIDDEN_ORIGIN', 'origin is not allowed'), 403);
    }
    await next();
  };
}

export interface AppContext {
  db: Database;
  clock?: Clock;
  claudeRoot?: string;
  codexRoot?: string;
  /** Extra browser origins allowed to call the local API, e.g. e2e client ports. */
  allowedOrigins?: readonly string[];
  /** Test override: replace the default Claude/Codex sources. */
  sourcesOverride?: Map<AgentProvider, { source: AgentSource; root: string }>;
  /** When set, every request gets logged via Hono's logger middleware. */
  logger?: (msg: string) => void;
}

export function createApp(ctx: AppContext): Hono {
  const clock = ctx.clock ?? systemClock;
  const areaService = new AreaService({ db: ctx.db, clock });
  const workItemService = new WorkItemService({ db: ctx.db, clock });
  const sessionLinks = new WorkItemSessionService({ db: ctx.db, clock });
  const evidenceService = new EvidenceService({ db: ctx.db, clock });
  const skillService = new SkillService({ db: ctx.db, clock });
  const knowledgeService = new ProjectKnowledgeService({ db: ctx.db, clock });
  const journalService = new JournalService({ db: ctx.db, clock });
  const budgetService = new BudgetService({ db: ctx.db, clock });
  const dispatchRunService = new DispatchRunService({ db: ctx.db, clock });
  const decisionCandidateService = new DecisionCandidateService({ db: ctx.db, clock });
  const dispatchService = new SessionDispatchService({
    workItems: workItemService,
    areas: areaService,
    knowledge: knowledgeService,
    skills: skillService,
    clock,
    runs: dispatchRunService,
  });

  const sources =
    ctx.sourcesOverride ??
    (() => {
      const map = new Map<AgentProvider, { source: AgentSource; root: string }>();
      const sessionCache = new AgentSessionCache(ctx.db);
      if (ctx.claudeRoot) {
        map.set('claude', { source: new ClaudeSource(sessionCache), root: ctx.claudeRoot });
      }
      if (ctx.codexRoot) {
        map.set('codex', { source: new CodexSource(sessionCache), root: ctx.codexRoot });
      }
      return map;
    })();

  const aggregator = new AgentSourceAggregator(sources);
  const burnService = new BurnService({ aggregator, areaService, clock });
  const weeklyService = new WeeklyReviewService({
    workItemService,
    areaService,
    aggregator,
    burnService,
    clock,
  });

  const localClientOrigins = resolveAllowedOrigins(ctx.allowedOrigins);
  const allowedOrigins = new Set<string>(localClientOrigins);

  const app = new Hono();
  app.use('*', rejectUntrustedBrowserOrigins(allowedOrigins));
  app.use('*', cors({ origin: localClientOrigins }));
  if (ctx.logger) app.use('*', honoLogger(ctx.logger));

  app.get('/health', (c) =>
    c.json({ ok: true, service: 'stash', version: '0.1.13', time: clock.nowIso() }),
  );

  app.route('/api/areas', createAreasRouter(areaService));
  app.route(
    '/api/work-items',
    createWorkItemsRouter(workItemService, sessionLinks, evidenceService, { areaService, journal: journalService, clock }),
  );
  app.route('/api/overview', createOverviewRouter(workItemService, clock));
  app.route('/api/agent-sessions', createAgentSessionsRouter(aggregator, sessionLinks, decisionCandidateService));
  app.route('/api/workboard', createWorkboardRouter(workItemService, sessionLinks, aggregator));
  app.route('/api/evidence', createEvidenceRouter(evidenceService, sessionLinks, aggregator));
  app.route('/api/skills', createSkillsRouter(skillService));
  app.route('/api/projects', createProjectSkillsRouter(skillService));
  app.route('/api/projects', createProjectKnowledgeRouter(knowledgeService));
  app.route('/api/lessons', createLessonsRouter(knowledgeService));
  app.route('/api/analytics', createAnalyticsRouter(burnService, weeklyService));
  app.route('/api/budgets', createBudgetsRouter(budgetService));
  app.route('/api/sessions', createSessionsRouter(dispatchService, dispatchRunService));

  return app;
}
