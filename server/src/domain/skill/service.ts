import type { Database } from 'bun:sqlite';
import {
  systemClock,
  type Clock,
  type CreateSkillInput,
  type ProjectSkillBinding,
  type Skill,
  type UpdateSkillInput,
} from '@stash/shared';
import { SkillRepository } from './repository.js';

export class SkillNotFoundError extends Error {
  constructor(id: string) {
    super(`skill ${id} not found`);
    this.name = 'SkillNotFoundError';
  }
}

export class SkillConflictError extends Error {
  constructor(id: string) {
    super(`skill id "${id}" already exists`);
    this.name = 'SkillConflictError';
  }
}

export interface SkillServiceDeps {
  db: Database;
  clock?: Clock;
}

export class SkillService {
  private readonly repo: SkillRepository;
  private readonly clock: Clock;

  constructor(deps: SkillServiceDeps) {
    this.repo = new SkillRepository(deps.db);
    this.clock = deps.clock ?? systemClock;
  }

  // ─── Catalog ────────────────────────────────────────────────────────────

  create(input: CreateSkillInput): Skill {
    const id = input.id.trim();
    if (!id) throw new Error('skill id is required');
    if (this.repo.getById(id)) throw new SkillConflictError(id);

    const now = this.clock.nowIso();
    const skill: Skill = {
      id,
      name: input.name.trim(),
      emoji: input.emoji ?? '🧩',
      description: input.description?.trim() || undefined,
      source: input.source ?? 'community',
      stars: input.stars ?? 0,
      installed: input.installed ?? false,
      version: input.version,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.insert(skill);
  }

  update(id: string, input: UpdateSkillInput): Skill {
    const existing = this.repo.getById(id);
    if (!existing) throw new SkillNotFoundError(id);
    const updated = this.repo.update(id, {
      name: input.name?.trim() ?? existing.name,
      emoji: input.emoji ?? existing.emoji,
      description: input.description?.trim() ?? existing.description,
      source: input.source ?? existing.source,
      stars: input.stars ?? existing.stars,
      installed: input.installed ?? existing.installed,
      version: input.version ?? existing.version,
      updatedAt: this.clock.nowIso(),
    });
    if (!updated) throw new SkillNotFoundError(id);
    return updated;
  }

  delete(id: string): void {
    const ok = this.repo.deleteById(id);
    if (!ok) throw new SkillNotFoundError(id);
  }

  get(id: string): Skill | null {
    return this.repo.getById(id);
  }

  list(filter?: { installed?: boolean }): Skill[] {
    return this.repo.list(filter);
  }

  // ─── Bindings ───────────────────────────────────────────────────────────

  listBindingsForProject(projectId: string): ProjectSkillBinding[] {
    return this.repo.listBindingsForProject(projectId);
  }

  /**
   * Sync the set of skills bound to a project. New IDs get bindings inserted,
   * removed IDs get unbound. Returns the full current binding set.
   */
  setProjectBindings(projectId: string, skillIds: string[]): ProjectSkillBinding[] {
    const current = this.repo.listBindingsForProject(projectId);
    const currentIds = new Set(current.map((b) => b.skillId));
    const nextIds = new Set(skillIds);
    const now = this.clock.nowIso();

    for (const id of currentIds) {
      if (!nextIds.has(id)) this.repo.deleteBinding(projectId, id);
    }
    for (const id of nextIds) {
      if (!currentIds.has(id)) {
        const skill = this.repo.getById(id);
        if (!skill) throw new SkillNotFoundError(id);
        this.repo.setBinding({ projectId, skillId: id, enabled: true, boundAt: now });
      }
    }
    return this.repo.listBindingsForProject(projectId);
  }

  toggleBinding(projectId: string, skillId: string, enabled: boolean): ProjectSkillBinding {
    const skill = this.repo.getById(skillId);
    if (!skill) throw new SkillNotFoundError(skillId);
    return this.repo.setBinding({
      projectId,
      skillId,
      enabled,
      boundAt: this.clock.nowIso(),
    });
  }

  unbind(projectId: string, skillId: string): void {
    this.repo.deleteBinding(projectId, skillId);
  }
}
