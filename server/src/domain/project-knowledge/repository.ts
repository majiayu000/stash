import type { Database } from 'bun:sqlite';
import type {
  Decision,
  Lesson,
  Milestone,
  MilestoneStatus,
  ProjectIntent,
  ProjectNotes,
} from '@stash/shared';

interface IntentRow { area_id: string; text: string; updated_at: string }
interface MilestoneRow {
  id: string; area_id: string; name: string; date: string | null;
  status: string; progress: number; created_at: string; updated_at: string;
}
interface DecisionRow {
  id: string; area_id: string; date: string; title: string; body: string;
  tags: string; session_id: string | null; created_at: string; updated_at: string;
}
interface NotesRow { area_id: string; markdown: string; updated_at: string }
interface LessonRow {
  id: string; area_id: string | null; title: string; body: string;
  tags: string; cross: number; created_at: string; updated_at: string;
}

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rowToIntent(row: IntentRow): ProjectIntent {
  return { projectId: row.area_id, text: row.text, updatedAt: row.updated_at };
}
function rowToMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    projectId: row.area_id,
    name: row.name,
    date: row.date ?? undefined,
    status: row.status as MilestoneStatus,
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function rowToDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    projectId: row.area_id,
    date: row.date,
    title: row.title,
    body: row.body,
    tags: parseTags(row.tags),
    sessionId: row.session_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function rowToNotes(row: NotesRow): ProjectNotes {
  return { projectId: row.area_id, markdown: row.markdown, updatedAt: row.updated_at };
}
function mergePatch<T extends object>(existing: T, patch: object): T {
  const out = { ...existing } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function rowToLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    projectId: row.area_id ?? undefined,
    title: row.title,
    body: row.body,
    tags: parseTags(row.tags),
    cross: row.cross === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectKnowledgeRepository {
  constructor(private readonly db: Database) {}

  // ─── intent (single row per project) ─────────────────────────────────────

  getIntent(projectId: string): ProjectIntent | null {
    const row = this.db
      .query<IntentRow, [string]>('select * from project_intent where area_id = ?')
      .get(projectId);
    return row ? rowToIntent(row) : null;
  }

  upsertIntent(projectId: string, text: string, updatedAt: string): ProjectIntent {
    this.db
      .prepare(
        `insert into project_intent(area_id, text, updated_at)
         values (?, ?, ?)
         on conflict(area_id) do update set text = excluded.text, updated_at = excluded.updated_at`,
      )
      .run(projectId, text, updatedAt);
    return { projectId, text, updatedAt };
  }

  // ─── milestones ──────────────────────────────────────────────────────────

  listMilestones(projectId: string): Milestone[] {
    return this.db
      .query<MilestoneRow, [string]>(
        `select * from milestones where area_id = ? order by date asc nulls last, created_at asc`,
      )
      .all(projectId)
      .map(rowToMilestone);
  }

  insertMilestone(m: Milestone): Milestone {
    this.db
      .prepare(
        `insert into milestones(id, area_id, name, date, status, progress, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(m.id, m.projectId, m.name, m.date ?? null, m.status, m.progress, m.createdAt, m.updatedAt);
    return m;
  }

  getMilestone(id: string): Milestone | null {
    const row = this.db.query<MilestoneRow, [string]>('select * from milestones where id = ?').get(id);
    return row ? rowToMilestone(row) : null;
  }

  updateMilestone(id: string, patch: Partial<Omit<Milestone, 'id' | 'projectId' | 'createdAt'>>): Milestone | null {
    const existing = this.getMilestone(id);
    if (!existing) return null;
    const merged: Milestone = mergePatch(existing, patch);
    this.db
      .prepare(
        `update milestones
            set name = ?, date = ?, status = ?, progress = ?, updated_at = ?
          where id = ?`,
      )
      .run(merged.name, merged.date ?? null, merged.status, merged.progress, merged.updatedAt, id);
    return merged;
  }

  deleteMilestone(id: string): boolean {
    return this.db.prepare('delete from milestones where id = ?').run(id).changes > 0;
  }

  // ─── decisions ───────────────────────────────────────────────────────────

  listDecisions(projectId: string): Decision[] {
    return this.db
      .query<DecisionRow, [string]>(
        `select * from decisions where area_id = ? order by date desc, created_at desc`,
      )
      .all(projectId)
      .map(rowToDecision);
  }

  insertDecision(d: Decision): Decision {
    this.db
      .prepare(
        `insert into decisions(id, area_id, date, title, body, tags, session_id, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.id, d.projectId, d.date, d.title, d.body,
        JSON.stringify(d.tags), d.sessionId ?? null,
        d.createdAt, d.updatedAt,
      );
    return d;
  }

  getDecision(id: string): Decision | null {
    const row = this.db.query<DecisionRow, [string]>('select * from decisions where id = ?').get(id);
    return row ? rowToDecision(row) : null;
  }

  updateDecision(id: string, patch: Partial<Omit<Decision, 'id' | 'projectId' | 'createdAt'>>): Decision | null {
    const existing = this.getDecision(id);
    if (!existing) return null;
    const merged: Decision = mergePatch(existing, patch);
    this.db
      .prepare(
        `update decisions
            set date = ?, title = ?, body = ?, tags = ?, session_id = ?, updated_at = ?
          where id = ?`,
      )
      .run(
        merged.date, merged.title, merged.body,
        JSON.stringify(merged.tags), merged.sessionId ?? null,
        merged.updatedAt, id,
      );
    return merged;
  }

  deleteDecision(id: string): boolean {
    return this.db.prepare('delete from decisions where id = ?').run(id).changes > 0;
  }

  // ─── notes (single row per project) ──────────────────────────────────────

  getNotes(projectId: string): ProjectNotes | null {
    const row = this.db
      .query<NotesRow, [string]>('select * from project_notes where area_id = ?')
      .get(projectId);
    return row ? rowToNotes(row) : null;
  }

  upsertNotes(projectId: string, markdown: string, updatedAt: string): ProjectNotes {
    this.db
      .prepare(
        `insert into project_notes(area_id, markdown, updated_at)
         values (?, ?, ?)
         on conflict(area_id) do update set markdown = excluded.markdown, updated_at = excluded.updated_at`,
      )
      .run(projectId, markdown, updatedAt);
    return { projectId, markdown, updatedAt };
  }

  // ─── lessons ─────────────────────────────────────────────────────────────

  listLessons(filter: { projectId?: string; crossOnly?: boolean }): Lesson[] {
    const wheres: string[] = [];
    const params: (string | number)[] = [];
    if (filter.projectId !== undefined) {
      wheres.push('area_id = ?');
      params.push(filter.projectId);
    }
    if (filter.crossOnly) {
      wheres.push('cross = 1');
    }
    let sql = 'select * from lessons';
    if (wheres.length) sql += ' where ' + wheres.join(' and ');
    sql += ' order by created_at desc';
    return this.db.query<LessonRow, typeof params>(sql).all(...params).map(rowToLesson);
  }

  insertLesson(l: Lesson): Lesson {
    this.db
      .prepare(
        `insert into lessons(id, area_id, title, body, tags, cross, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        l.id, l.projectId ?? null, l.title, l.body,
        JSON.stringify(l.tags), l.cross ? 1 : 0,
        l.createdAt, l.updatedAt,
      );
    return l;
  }

  getLesson(id: string): Lesson | null {
    const row = this.db.query<LessonRow, [string]>('select * from lessons where id = ?').get(id);
    return row ? rowToLesson(row) : null;
  }

  updateLesson(id: string, patch: Partial<Omit<Lesson, 'id' | 'createdAt'>>): Lesson | null {
    const existing = this.getLesson(id);
    if (!existing) return null;
    const merged: Lesson = mergePatch(existing, patch);
    this.db
      .prepare(
        `update lessons
            set area_id = ?, title = ?, body = ?, tags = ?, cross = ?, updated_at = ?
          where id = ?`,
      )
      .run(
        merged.projectId ?? null,
        merged.title, merged.body,
        JSON.stringify(merged.tags),
        merged.cross ? 1 : 0,
        merged.updatedAt, id,
      );
    return merged;
  }

  deleteLesson(id: string): boolean {
    return this.db.prepare('delete from lessons where id = ?').run(id).changes > 0;
  }
}
