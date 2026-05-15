import type { Database } from 'bun:sqlite';
import type { ProjectSkillBinding, Skill, SkillSource } from '@stash/shared';

interface SkillRow {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  source: string;
  stars: number;
  installed: number;
  version: string | null;
  created_at: string;
  updated_at: string;
}

interface BindingRow {
  area_id: string;
  skill_id: string;
  enabled: number;
  bound_at: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    description: row.description ?? undefined,
    source: row.source as SkillSource,
    stars: row.stars,
    installed: row.installed === 1,
    version: row.version ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToBinding(row: BindingRow): ProjectSkillBinding {
  return {
    projectId: row.area_id,
    skillId: row.skill_id,
    enabled: row.enabled === 1,
    boundAt: row.bound_at,
  };
}

export class SkillRepository {
  constructor(private readonly db: Database) {}

  insert(s: Skill): Skill {
    this.db
      .prepare(
        `insert into skills(id, name, emoji, description, source, stars, installed, version, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.id, s.name, s.emoji,
        s.description ?? null,
        s.source, s.stars,
        s.installed ? 1 : 0,
        s.version ?? null,
        s.createdAt, s.updatedAt,
      );
    return s;
  }

  getById(id: string): Skill | null {
    const row = this.db.query<SkillRow, [string]>('select * from skills where id = ?').get(id);
    return row ? rowToSkill(row) : null;
  }

  list(filter?: { installed?: boolean; source?: SkillSource }): Skill[] {
    let sql = 'select * from skills';
    const wheres: string[] = [];
    const params: (string | number)[] = [];
    if (filter?.installed !== undefined) {
      wheres.push('installed = ?');
      params.push(filter.installed ? 1 : 0);
    }
    if (filter?.source) {
      wheres.push('source = ?');
      params.push(filter.source);
    }
    if (wheres.length) sql += ' where ' + wheres.join(' and ');
    sql += ' order by stars desc, name asc';
    return this.db.query<SkillRow, typeof params>(sql).all(...params).map(rowToSkill);
  }

  update(id: string, patch: Partial<Omit<Skill, 'id' | 'createdAt'>>): Skill | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const merged: Skill = { ...existing, ...patch, updatedAt: patch.updatedAt ?? existing.updatedAt };
    this.db
      .prepare(
        `update skills
            set name = ?, emoji = ?, description = ?, source = ?, stars = ?, installed = ?, version = ?, updated_at = ?
          where id = ?`,
      )
      .run(
        merged.name, merged.emoji,
        merged.description ?? null,
        merged.source, merged.stars,
        merged.installed ? 1 : 0,
        merged.version ?? null,
        merged.updatedAt,
        id,
      );
    return merged;
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare('delete from skills where id = ?').run(id);
    return result.changes > 0;
  }

  // ─── Bindings ───────────────────────────────────────────────────────────

  listBindingsForProject(areaId: string): ProjectSkillBinding[] {
    return this.db
      .query<BindingRow, [string]>('select * from project_skills where area_id = ? order by bound_at asc')
      .all(areaId)
      .map(rowToBinding);
  }

  listBindingsForSkill(skillId: string): ProjectSkillBinding[] {
    return this.db
      .query<BindingRow, [string]>('select * from project_skills where skill_id = ? order by bound_at asc')
      .all(skillId)
      .map(rowToBinding);
  }

  setBinding(b: ProjectSkillBinding): ProjectSkillBinding {
    this.db
      .prepare(
        `insert into project_skills(area_id, skill_id, enabled, bound_at)
         values (?, ?, ?, ?)
         on conflict(area_id, skill_id) do update set enabled = excluded.enabled`,
      )
      .run(b.projectId, b.skillId, b.enabled ? 1 : 0, b.boundAt);
    return b;
  }

  deleteBinding(projectId: string, skillId: string): boolean {
    const result = this.db
      .prepare('delete from project_skills where area_id = ? and skill_id = ?')
      .run(projectId, skillId);
    return result.changes > 0;
  }
}
