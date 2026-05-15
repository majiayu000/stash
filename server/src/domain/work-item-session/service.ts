import type { Database } from 'bun:sqlite';
import { systemClock, type AgentProvider, type Clock } from '@stash/shared';
import { WorkItemRepository } from '../work-item/repository.js';
import { WorkItemNotFoundError } from '../work-item/service.js';
import { WorkItemSessionRepository, type LinkedSession } from './repository.js';

export interface WorkItemSessionServiceDeps {
  db: Database;
  clock?: Clock;
}

export class WorkItemSessionService {
  private readonly repo: WorkItemSessionRepository;
  private readonly itemRepo: WorkItemRepository;
  private readonly clock: Clock;

  constructor(deps: WorkItemSessionServiceDeps) {
    this.repo = new WorkItemSessionRepository(deps.db);
    this.itemRepo = new WorkItemRepository(deps.db);
    this.clock = deps.clock ?? systemClock;
  }

  link(workItemId: string, provider: AgentProvider, sessionId: string): LinkedSession {
    const item = this.itemRepo.getById(workItemId);
    if (!item) throw new WorkItemNotFoundError(workItemId);
    return this.repo.link({
      workItemId,
      provider,
      sessionId,
      linkedAt: this.clock.nowIso(),
    });
  }

  unlink(workItemId: string, provider: AgentProvider, sessionId: string): void {
    const item = this.itemRepo.getById(workItemId);
    if (!item) throw new WorkItemNotFoundError(workItemId);
    this.repo.unlink(workItemId, provider, sessionId);
  }

  forWorkItem(workItemId: string): LinkedSession[] {
    return this.repo.forWorkItem(workItemId);
  }

  workItemsForSession(provider: AgentProvider, sessionId: string): string[] {
    return this.repo.workItemsForSession(provider, sessionId);
  }
}
