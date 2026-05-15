import type { Database } from 'bun:sqlite';
import {
  systemClock,
  ulid,
  type Clock,
  type CreateDecisionInput,
  type CreateLessonInput,
  type CreateMilestoneInput,
  type Decision,
  type Lesson,
  type Milestone,
  type ProjectIntent,
  type ProjectNotes,
  type UpdateDecisionInput,
  type UpdateLessonInput,
  type UpdateMilestoneInput,
} from '@stash/shared';
import { ProjectKnowledgeRepository } from './repository.js';

export class KnowledgeNotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found`);
    this.name = 'KnowledgeNotFoundError';
  }
}

export interface ProjectKnowledgeServiceDeps {
  db: Database;
  clock?: Clock;
}

export class ProjectKnowledgeService {
  private readonly repo: ProjectKnowledgeRepository;
  private readonly clock: Clock;

  constructor(deps: ProjectKnowledgeServiceDeps) {
    this.repo = new ProjectKnowledgeRepository(deps.db);
    this.clock = deps.clock ?? systemClock;
  }

  // ─── intent ─────────────────────────────────────────────────────────────

  getIntent(projectId: string): ProjectIntent | null {
    return this.repo.getIntent(projectId);
  }

  setIntent(projectId: string, text: string): ProjectIntent {
    return this.repo.upsertIntent(projectId, text.trim(), this.clock.nowIso());
  }

  // ─── milestones ─────────────────────────────────────────────────────────

  listMilestones(projectId: string): Milestone[] {
    return this.repo.listMilestones(projectId);
  }

  createMilestone(projectId: string, input: CreateMilestoneInput): Milestone {
    const name = input.name.trim();
    if (!name) throw new Error('milestone name is required');
    const now = this.clock.nowIso();
    const m: Milestone = {
      id: ulid(this.clock.now()),
      projectId,
      name,
      date: input.date,
      status: input.status ?? 'planned',
      progress: clampProgress(input.progress),
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.insertMilestone(m);
  }

  updateMilestone(id: string, input: UpdateMilestoneInput): Milestone {
    const updated = this.repo.updateMilestone(id, {
      name: input.name?.trim(),
      date: input.date,
      status: input.status,
      progress: input.progress !== undefined ? clampProgress(input.progress) : undefined,
      updatedAt: this.clock.nowIso(),
    });
    if (!updated) throw new KnowledgeNotFoundError('milestone', id);
    return updated;
  }

  deleteMilestone(id: string): void {
    if (!this.repo.deleteMilestone(id)) throw new KnowledgeNotFoundError('milestone', id);
  }

  // ─── decisions ──────────────────────────────────────────────────────────

  listDecisions(projectId: string): Decision[] {
    return this.repo.listDecisions(projectId);
  }

  createDecision(projectId: string, input: CreateDecisionInput): Decision {
    const title = input.title.trim();
    if (!title) throw new Error('decision title is required');
    const now = this.clock.nowIso();
    const d: Decision = {
      id: ulid(this.clock.now()),
      projectId,
      date: input.date ?? now.slice(0, 10),
      title,
      body: input.body ?? '',
      tags: input.tags ?? [],
      sessionId: input.sessionId,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.insertDecision(d);
  }

  updateDecision(id: string, input: UpdateDecisionInput): Decision {
    const updated = this.repo.updateDecision(id, {
      date: input.date,
      title: input.title?.trim(),
      body: input.body,
      tags: input.tags,
      sessionId: input.sessionId,
      updatedAt: this.clock.nowIso(),
    });
    if (!updated) throw new KnowledgeNotFoundError('decision', id);
    return updated;
  }

  deleteDecision(id: string): void {
    if (!this.repo.deleteDecision(id)) throw new KnowledgeNotFoundError('decision', id);
  }

  // ─── notes ──────────────────────────────────────────────────────────────

  getNotes(projectId: string): ProjectNotes | null {
    return this.repo.getNotes(projectId);
  }

  setNotes(projectId: string, markdown: string): ProjectNotes {
    return this.repo.upsertNotes(projectId, markdown, this.clock.nowIso());
  }

  // ─── lessons ────────────────────────────────────────────────────────────

  listLessons(filter: { projectId?: string; crossOnly?: boolean }): Lesson[] {
    return this.repo.listLessons(filter);
  }

  createLesson(input: CreateLessonInput): Lesson {
    const title = input.title.trim();
    if (!title) throw new Error('lesson title is required');
    const now = this.clock.nowIso();
    const l: Lesson = {
      id: ulid(this.clock.now()),
      projectId: input.projectId,
      title,
      body: input.body ?? '',
      tags: input.tags ?? [],
      cross: input.cross ?? input.projectId === undefined,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.insertLesson(l);
  }

  updateLesson(id: string, input: UpdateLessonInput): Lesson {
    const updated = this.repo.updateLesson(id, {
      projectId: input.projectId,
      title: input.title?.trim(),
      body: input.body,
      tags: input.tags,
      cross: input.cross,
      updatedAt: this.clock.nowIso(),
    });
    if (!updated) throw new KnowledgeNotFoundError('lesson', id);
    return updated;
  }

  deleteLesson(id: string): void {
    if (!this.repo.deleteLesson(id)) throw new KnowledgeNotFoundError('lesson', id);
  }
}

function clampProgress(p: number | undefined): number {
  if (p === undefined) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return Math.round(p);
}
