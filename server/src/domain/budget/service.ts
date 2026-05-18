import type { Database } from 'bun:sqlite';
import {
  systemClock,
  ulid,
  type Budget,
  type BudgetPeriod,
  type Clock,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@stash/shared';

/**
 * v0.9 — persisted USD spend budgets. Each (scope, period) tuple is unique;
 * `scope` is a free-form label (often an area name). The actual "spent"
 * number is computed elsewhere (BurnService); this service just stores caps.
 */

export class BudgetNotFoundError extends Error {
  constructor(id: string) { super(`budget ${id} not found`); this.name = 'BudgetNotFoundError'; }
}

export class BudgetConflictError extends Error {
  constructor(scope: string, period: string) {
    super(`budget for ${scope}/${period} already exists`);
    this.name = 'BudgetConflictError';
  }
}

interface Row {
  id: string; scope: string; cap_usd: number;
  period: string; notes: string | null;
  created_at: string; updated_at: string;
}

function row(r: Row): Budget {
  return {
    id: r.id, scope: r.scope, capUsd: r.cap_usd,
    period: r.period as BudgetPeriod,
    notes: r.notes ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export interface BudgetServiceDeps { db: Database; clock?: Clock }

export class BudgetService {
  private readonly clock: Clock;
  constructor(private readonly deps: BudgetServiceDeps) { this.clock = deps.clock ?? systemClock; }

  list(): Budget[] {
    return this.deps.db
      .query<Row, []>('select * from budgets order by scope asc, period asc')
      .all()
      .map(row);
  }

  get(id: string): Budget | null {
    const r = this.deps.db.query<Row, [string]>('select * from budgets where id = ?').get(id);
    return r ? row(r) : null;
  }

  create(input: CreateBudgetInput): Budget {
    const scope = input.scope.trim();
    if (!scope) throw new Error('budget scope is required');
    if (!(input.capUsd > 0)) throw new Error('budget cap_usd must be > 0');
    const period: BudgetPeriod = input.period ?? 'month';
    const now = this.clock.nowIso();
    const b: Budget = {
      id: ulid(this.clock.now()),
      scope,
      capUsd: input.capUsd,
      period,
      notes: input.notes?.trim() || undefined,
      createdAt: now, updatedAt: now,
    };
    try {
      this.deps.db
        .prepare('insert into budgets(id, scope, cap_usd, period, notes, created_at, updated_at) values (?,?,?,?,?,?,?)')
        .run(b.id, b.scope, b.capUsd, b.period, b.notes ?? null, b.createdAt, b.updatedAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE constraint')) throw new BudgetConflictError(scope, period);
      throw e;
    }
    return b;
  }

  update(id: string, input: UpdateBudgetInput): Budget {
    const existing = this.get(id);
    if (!existing) throw new BudgetNotFoundError(id);
    const merged: Budget = {
      ...existing,
      scope: input.scope?.trim() ?? existing.scope,
      capUsd: input.capUsd ?? existing.capUsd,
      period: (input.period ?? existing.period) as BudgetPeriod,
      notes: input.notes !== undefined ? (input.notes.trim() || undefined) : existing.notes,
      updatedAt: this.clock.nowIso(),
    };
    if (!(merged.capUsd > 0)) throw new Error('budget cap_usd must be > 0');
    this.deps.db
      .prepare('update budgets set scope = ?, cap_usd = ?, period = ?, notes = ?, updated_at = ? where id = ?')
      .run(merged.scope, merged.capUsd, merged.period, merged.notes ?? null, merged.updatedAt, id);
    return merged;
  }

  delete(id: string): void {
    const ok = this.deps.db.prepare('delete from budgets where id = ?').run(id).changes > 0;
    if (!ok) throw new BudgetNotFoundError(id);
  }
}
