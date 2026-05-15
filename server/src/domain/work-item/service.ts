import type { Database } from 'bun:sqlite';
import {
  STATUS_TRANSITIONS,
  systemClock,
  ulid,
  type ChecklistItem,
  type Clock,
  type CreateWorkItemInput,
  type UpdateWorkItemInput,
  type WorkItem,
  type WorkItemStatus,
} from '@stash/shared';
import { WorkItemRepository, type ListFilter } from './repository.js';

export class WorkItemNotFoundError extends Error {
  constructor(id: string) {
    super(`work item ${id} not found`);
    this.name = 'WorkItemNotFoundError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(public readonly from: WorkItemStatus, public readonly to: WorkItemStatus) {
    super(`invalid status transition: ${from} -> ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface WorkItemServiceDeps {
  db: Database;
  clock?: Clock;
}

export function isTransitionAllowed(from: WorkItemStatus, to: WorkItemStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
}

export class WorkItemService {
  private readonly repo: WorkItemRepository;
  private readonly clock: Clock;

  constructor(deps: WorkItemServiceDeps) {
    this.repo = new WorkItemRepository(deps.db);
    this.clock = deps.clock ?? systemClock;
  }

  create(input: CreateWorkItemInput): WorkItem {
    const title = input.title?.trim();
    if (!title) throw new ValidationError('title is required');

    const now = this.clock.nowIso();
    const status: WorkItemStatus = input.status ?? 'inbox';
    const item: WorkItem = {
      id: ulid(this.clock.now()),
      projectId: input.projectId,
      areaId: input.areaId,
      parentId: input.parentId,
      title,
      description: input.description?.trim() || undefined,
      outcome: input.outcome?.trim() || undefined,
      context: input.context?.trim() || undefined,
      kind: input.kind ?? 'task',
      status,
      priority: input.priority ?? 'p2',
      source: input.source ?? 'manual',
      confidence: input.confidence ?? 'explicit',
      assignee: input.assignee ?? 'human',
      labels: input.labels ?? [],
      checklist: input.checklist ?? [],
      estimateMinutes: input.estimateMinutes,
      reminderAt: input.reminderAt,
      repeatRule: input.repeatRule,
      blockedBy: input.blockedBy?.trim() || undefined,
      waitingOn: input.waitingOn?.trim() || undefined,
      links: input.links ?? [],
      reviewAt: input.reviewAt,
      startAt: input.startAt,
      dueAt: input.dueAt,
      scheduledFor: input.scheduledFor,
      createdAt: now,
      updatedAt: now,
      completedAt: status === 'done' ? now : undefined,
    };
    return this.repo.insert(item);
  }

  /**
   * Quick capture: only title required, defaults to status=inbox + kind=idea.
   * Mirrors PRD §10.1 quick add (under 3-5s capture).
   */
  quickCapture(title: string): WorkItem {
    return this.create({ title, kind: 'idea', status: 'inbox' });
  }

  get(id: string): WorkItem | null {
    return this.repo.getById(id);
  }

  list(filter: ListFilter = {}): WorkItem[] {
    return this.repo.list(filter);
  }

  update(id: string, input: UpdateWorkItemInput): WorkItem {
    const existing = this.repo.getById(id);
    if (!existing) throw new WorkItemNotFoundError(id);

    if (input.status && !isTransitionAllowed(existing.status, input.status)) {
      throw new InvalidStatusTransitionError(existing.status, input.status);
    }

    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (!trimmed) throw new ValidationError('title cannot be empty');
    }

    const nextStatus = input.status ?? existing.status;
    const completedAt =
      nextStatus === 'done'
        ? (existing.completedAt ?? this.clock.nowIso())
        : input.status && input.status !== 'done'
          ? undefined
          : existing.completedAt;

    const merged: WorkItem = {
      ...existing,
      ...stripUndefined(input),
      title: input.title?.trim() ?? existing.title,
      description: input.description !== undefined ? input.description?.trim() || undefined : existing.description,
      outcome: input.outcome !== undefined ? input.outcome?.trim() || undefined : existing.outcome,
      context: input.context !== undefined ? input.context?.trim() || undefined : existing.context,
      blockedBy: input.blockedBy !== undefined ? input.blockedBy?.trim() || undefined : existing.blockedBy,
      waitingOn: input.waitingOn !== undefined ? input.waitingOn?.trim() || undefined : existing.waitingOn,
      status: nextStatus,
      labels: input.labels ?? existing.labels,
      checklist: input.checklist ?? existing.checklist,
      links: input.links ?? existing.links,
      updatedAt: this.clock.nowIso(),
      completedAt,
    };
    return this.repo.replace(merged);
  }

  /**
   * Hard delete. For soft delete, set status='dropped' via update().
   */
  delete(id: string): void {
    const ok = this.repo.deleteById(id);
    if (!ok) throw new WorkItemNotFoundError(id);
  }

  appendChecklistItem(id: string, text: string): WorkItem {
    const existing = this.repo.getById(id);
    if (!existing) throw new WorkItemNotFoundError(id);
    const trimmed = text.trim();
    if (!trimmed) throw new ValidationError('checklist text cannot be empty');
    const item: ChecklistItem = { id: ulid(this.clock.now()), text: trimmed, completed: false };
    return this.update(id, { checklist: [...existing.checklist, item] });
  }

  toggleChecklistItem(id: string, itemId: string): WorkItem {
    const existing = this.repo.getById(id);
    if (!existing) throw new WorkItemNotFoundError(id);
    const next = existing.checklist.map((c) =>
      c.id === itemId ? { ...c, completed: !c.completed } : c,
    );
    return this.update(id, { checklist: next });
  }

  renameChecklistItem(id: string, itemId: string, text: string): WorkItem {
    const existing = this.repo.getById(id);
    if (!existing) throw new WorkItemNotFoundError(id);
    const trimmed = text.trim();
    if (!trimmed) throw new ValidationError('checklist text cannot be empty');
    const next = existing.checklist.map((c) =>
      c.id === itemId ? { ...c, text: trimmed } : c,
    );
    return this.update(id, { checklist: next });
  }

  removeChecklistItem(id: string, itemId: string): WorkItem {
    const existing = this.repo.getById(id);
    if (!existing) throw new WorkItemNotFoundError(id);
    const next = existing.checklist.filter((c) => c.id !== itemId);
    return this.update(id, { checklist: next });
  }
}

function stripUndefined<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
