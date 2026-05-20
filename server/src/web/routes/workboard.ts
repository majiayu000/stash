import { Hono } from 'hono';
import type { AgentSession, WorkItem } from '@stash/shared';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
import type { WorkItemService } from '../../domain/work-item/service.js';
import type { WorkItemSessionService } from '../../domain/work-item-session/service.js';
import { handleError } from '../errors.js';

export interface ProjectSummary {
  projectId: string;
  itemCount: number;
  activeCount: number;
  blockedCount: number;
  items: WorkItem[];
  sessions: AgentSession[];
}

export interface WorkboardResponse {
  projects: ProjectSummary[];
  unassigned: WorkItem[];
  parseErrors: { provider: string; sourcePath: string; message: string }[];
}

export function createWorkboardRouter(
  items: WorkItemService,
  links: WorkItemSessionService,
  aggregator: AgentSourceAggregator,
): Hono {
  const r = new Hono();

  r.get('/', async (c) => {
    try {
      const all = items.list({ includeDropped: false });
      const sessionScan = await aggregator.scanAsync({ provider: 'all', limitPerSource: 100 });
      const sessionsById = new Map(sessionScan.sessions.map((s) => [`${s.provider}:${s.id}`, s] as const));

      const projects = new Map<string, ProjectSummary>();
      const unassigned: WorkItem[] = [];

      for (const item of all) {
        if (!item.projectId) {
          unassigned.push(item);
          continue;
        }
        const key = item.projectId;
        const existing = projects.get(key) ?? {
          projectId: key,
          itemCount: 0,
          activeCount: 0,
          blockedCount: 0,
          items: [],
          sessions: [],
        };
        existing.itemCount += 1;
        if (item.status === 'active') existing.activeCount += 1;
        if (item.status === 'blocked') existing.blockedCount += 1;
        existing.items.push(item);

        for (const link of links.forWorkItem(item.id)) {
          const s = sessionsById.get(`${link.provider}:${link.sessionId}`);
          if (s && !existing.sessions.find((es) => es.id === s.id && es.provider === s.provider)) {
            existing.sessions.push(s);
          }
        }
        projects.set(key, existing);
      }

      const response: WorkboardResponse = {
        projects: Array.from(projects.values()).sort((a, b) => b.itemCount - a.itemCount),
        unassigned,
        parseErrors: sessionScan.errors,
      };
      return c.json({ data: response, cache: sessionScan.cache });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
