import type { Database } from 'bun:sqlite';
import type { Area, ReviewCadence } from '@stash/shared';

interface AreaRow {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  review_cadence: string;
  created_at: string;
  updated_at: string;
}

function rowToArea(row: AreaRow): Area {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    emoji: row.emoji ?? undefined,
    reviewCadence: row.review_cadence as ReviewCadence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AreaRepository {
  constructor(private readonly db: Database) {}

  insert(area: Area): Area {
    this.db
      .prepare(
        `insert into areas(id, name, description, emoji, review_cadence, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        area.id,
        area.name,
        area.description ?? null,
        area.emoji ?? null,
        area.reviewCadence,
        area.createdAt,
        area.updatedAt,
      );
    return area;
  }

  getById(id: string): Area | null {
    const row = this.db
      .query<AreaRow, [string]>('select * from areas where id = ?')
      .get(id);
    return row ? rowToArea(row) : null;
  }

  getByName(name: string): Area | null {
    const row = this.db
      .query<AreaRow, [string]>('select * from areas where name = ?')
      .get(name);
    return row ? rowToArea(row) : null;
  }

  list(): Area[] {
    return this.db
      .query<AreaRow, []>('select * from areas order by name asc')
      .all()
      .map(rowToArea);
  }

  update(id: string, patch: Partial<Omit<Area, 'id' | 'createdAt'>>): Area | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const merged: Area = {
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? existing.updatedAt,
    };
    this.db
      .prepare(
        `update areas
            set name = ?, description = ?, emoji = ?, review_cadence = ?, updated_at = ?
          where id = ?`,
      )
      .run(
        merged.name,
        merged.description ?? null,
        merged.emoji ?? null,
        merged.reviewCadence,
        merged.updatedAt,
        id,
      );
    return merged;
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare('delete from areas where id = ?').run(id);
    return result.changes > 0;
  }

  count(): number {
    const row = this.db
      .query<{ c: number }, []>('select count(*) as c from areas')
      .get();
    return row?.c ?? 0;
  }
}
