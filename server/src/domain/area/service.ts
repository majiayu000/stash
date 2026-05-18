import type { Database } from 'bun:sqlite';
import {
  DEFAULT_AREAS,
  systemClock,
  ulid,
  type Area,
  type Clock,
  type CreateAreaInput,
  type ReviewCadence,
  type UpdateAreaInput,
} from '@stash/shared';
import { AreaRepository } from './repository.js';

export class AreaNameConflictError extends Error {
  constructor(name: string) {
    super(`area name "${name}" already exists`);
    this.name = 'AreaNameConflictError';
  }
}

export class AreaNotFoundError extends Error {
  constructor(id: string) {
    super(`area ${id} not found`);
    this.name = 'AreaNotFoundError';
  }
}

export interface AreaServiceDeps {
  db: Database;
  clock?: Clock;
}

export class AreaService {
  private readonly repo: AreaRepository;
  private readonly clock: Clock;

  constructor(deps: AreaServiceDeps) {
    this.repo = new AreaRepository(deps.db);
    this.clock = deps.clock ?? systemClock;
  }

  create(input: CreateAreaInput): Area {
    const name = input.name.trim();
    if (!name) throw new Error('area name is required');
    if (this.repo.getByName(name)) throw new AreaNameConflictError(name);

    const now = this.clock.nowIso();
    const area: Area = {
      id: ulid(this.clock.now()),
      name,
      description: input.description?.trim() || undefined,
      emoji: input.emoji?.trim() || undefined,
      reviewCadence: input.reviewCadence ?? 'weekly',
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.insert(area);
  }

  update(id: string, input: UpdateAreaInput): Area {
    const existing = this.repo.getById(id);
    if (!existing) throw new AreaNotFoundError(id);

    if (input.name && input.name.trim() !== existing.name) {
      const conflict = this.repo.getByName(input.name.trim());
      if (conflict && conflict.id !== id) throw new AreaNameConflictError(input.name);
    }

    const updated = this.repo.update(id, {
      name: input.name?.trim() ?? existing.name,
      description: input.description?.trim() ?? existing.description,
      emoji: input.emoji !== undefined ? (input.emoji.trim() || undefined) : existing.emoji,
      reviewCadence: (input.reviewCadence ?? existing.reviewCadence) as ReviewCadence,
      updatedAt: this.clock.nowIso(),
    });
    if (!updated) throw new AreaNotFoundError(id);
    return updated;
  }

  delete(id: string): void {
    const ok = this.repo.deleteById(id);
    if (!ok) throw new AreaNotFoundError(id);
  }

  get(id: string): Area | null {
    return this.repo.getById(id);
  }

  list(): Area[] {
    return this.repo.list();
  }

  ensureDefaults(): { created: Area[]; existing: Area[] } {
    const created: Area[] = [];
    const existing: Area[] = [];
    for (const def of DEFAULT_AREAS) {
      const found = this.repo.getByName(def.name);
      if (found) {
        existing.push(found);
      } else {
        created.push(this.create(def));
      }
    }
    return { created, existing };
  }
}
