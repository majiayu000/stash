import { Hono } from 'hono';
import type { AgentSession } from '@stash/shared';
import type { AgentSourceAggregator } from '../../adapters/aggregator.js';
import type { WorkItemService } from '../../domain/work-item/service.js';
import type { WorkItemSessionService } from '../../domain/work-item-session/service.js';
import { handleError } from '../errors.js';
import { bound_session_list_item } from '../session-payload.js';

/**
 * Sessions explicitly linked to each project's work items.
 *
 * This route deliberately does not return the work items themselves. Callers
 * already hold the full list from `/api/work-items`, and echoing it here meant
 * every workbench refresh serialized and transferred the entire work-item set
 * twice. Per-project counts are likewise derivable from that list, so returning
 * them would only create a second source of truth.
 */
export interface ProjectSessionGroup {
  projectId: string;
  sessions: AgentSession[];
}

export interface WorkboardResponse {
  projects: ProjectSessionGroup[];
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
      const sessionsByKey = new Map<string, AgentSession>(
        sessionScan.sessions.map((s) => [`${s.provider}:${s.id}`, s]),
      );
      const projectByItemId = new Map(
        all.flatMap((item) => (item.projectId ? [[item.id, item.projectId] as const] : [])),
      );

      // One query for every link, then group in memory. This previously called
      // `links.forWorkItem(item.id)` once per work item, so a board with N
      // items issued N queries to assemble a single response.
      const projects = new Map<string, ProjectSessionGroup>();
      const seenPerProject = new Map<string, Set<string>>();

      for (const link of links.all()) {
        const projectId = projectByItemId.get(link.workItemId);
        if (!projectId) continue;
        const key = `${link.provider}:${link.sessionId}`;
        const session = sessionsByKey.get(key);
        if (!session) continue;

        const seen = seenPerProject.get(projectId) ?? new Set<string>();
        if (seen.has(key)) continue;
        seen.add(key);
        seenPerProject.set(projectId, seen);

        const group = projects.get(projectId) ?? { projectId, sessions: [] };
        group.sessions.push(bound_session_list_item(session));
        projects.set(projectId, group);
      }

      const response: WorkboardResponse = {
        projects: Array.from(projects.values()),
        parseErrors: sessionScan.errors,
      };
      return c.json({ data: response, cache: sessionScan.cache });
    } catch (e) {
      return handleError(c, e);
    }
  });

  return r;
}
