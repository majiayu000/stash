import type { Database } from 'bun:sqlite';
import type {
  Assignee,
  ChecklistItem,
  Confidence,
  Priority,
  RecurrenceRule,
  WorkItem,
  WorkItemKind,
  WorkItemSource,
  WorkItemStatus,
} from '@stash/shared';

interface WorkItemRow {
  id: string;
  project_id: string | null;
  area_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  priority: string;
  source: string;
  confidence: string;
  assignee: string;
  labels_json: string;
  checklist_json: string;
  outcome: string | null;
  context: string | null;
  estimate_minutes: number | null;
  reminder_at: string | null;
  repeat_rule: string | null;
  blocked_by: string | null;
  waiting_on: string | null;
  links_json: string;
  review_at: string | null;
  start_at: string | null;
  due_at: string | null;
  scheduled_for: string | null;
  today_pinned: number;
  sort_order: number | null;
  recurrence_json: string | null;
  raw_input: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function parseRecurrence(raw: string | null): RecurrenceRule | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.type === 'rrule' || parsed.type === 'after_completion')) {
      return parsed as RecurrenceRule;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function rowToWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    areaId: row.area_id ?? undefined,
    parentId: row.parent_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    kind: row.kind as WorkItemKind,
    status: row.status as WorkItemStatus,
    priority: row.priority as Priority,
    source: row.source as WorkItemSource,
    confidence: row.confidence as Confidence,
    assignee: row.assignee as Assignee,
    labels: parseJsonArray<string>(row.labels_json, []),
    checklist: parseJsonArray<ChecklistItem>(row.checklist_json, []),
    outcome: row.outcome ?? undefined,
    context: row.context ?? undefined,
    estimateMinutes: row.estimate_minutes ?? undefined,
    reminderAt: row.reminder_at ?? undefined,
    repeatRule: row.repeat_rule ?? undefined,
    blockedBy: row.blocked_by ?? undefined,
    waitingOn: row.waiting_on ?? undefined,
    links: parseJsonArray<string>(row.links_json, []),
    reviewAt: row.review_at ?? undefined,
    startAt: row.start_at ?? undefined,
    dueAt: row.due_at ?? undefined,
    scheduledFor: row.scheduled_for ?? undefined,
    todayPinned: row.today_pinned === 1,
    sortOrder: row.sort_order ?? undefined,
    recurrence: parseRecurrence(row.recurrence_json),
    rawInput: row.raw_input ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export interface ListFilter {
  status?: WorkItemStatus | WorkItemStatus[];
  areaId?: string;
  projectId?: string;
  parentId?: string;
  parentIsNull?: boolean;
  scheduledFrom?: string;
  scheduledTo?: string;
  scheduledIsNull?: boolean;
  includeDropped?: boolean;
}

export class WorkItemRepository {
  constructor(private readonly db: Database) {}

  insert(item: WorkItem): WorkItem {
    this.db
      .prepare(
        `insert into work_items(
          id, project_id, area_id, parent_id, title, description, kind, status, priority,
          source, confidence, assignee, labels_json, checklist_json, outcome, context,
          estimate_minutes, reminder_at, repeat_rule, blocked_by, waiting_on, links_json,
          review_at, start_at, due_at, scheduled_for,
          today_pinned, sort_order, recurrence_json, raw_input,
          created_at, updated_at, completed_at
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        item.id,
        item.projectId ?? null,
        item.areaId ?? null,
        item.parentId ?? null,
        item.title,
        item.description ?? null,
        item.kind,
        item.status,
        item.priority,
        item.source,
        item.confidence,
        item.assignee,
        JSON.stringify(item.labels),
        JSON.stringify(item.checklist),
        item.outcome ?? null,
        item.context ?? null,
        item.estimateMinutes ?? null,
        item.reminderAt ?? null,
        item.repeatRule ?? null,
        item.blockedBy ?? null,
        item.waitingOn ?? null,
        JSON.stringify(item.links),
        item.reviewAt ?? null,
        item.startAt ?? null,
        item.dueAt ?? null,
        item.scheduledFor ?? null,
        item.todayPinned ? 1 : 0,
        item.sortOrder ?? null,
        item.recurrence ? JSON.stringify(item.recurrence) : null,
        item.rawInput ?? null,
        item.createdAt,
        item.updatedAt,
        item.completedAt ?? null,
      );
    return item;
  }

  getById(id: string): WorkItem | null {
    const row = this.db
      .query<WorkItemRow, [string]>('select * from work_items where id = ?')
      .get(id);
    return row ? rowToWorkItem(row) : null;
  }

  list(filter: ListFilter = {}): WorkItem[] {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      where.push(`status in (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    } else if (!filter.includeDropped) {
      where.push("status != 'dropped'");
    }

    if (filter.areaId) {
      where.push('area_id = ?');
      params.push(filter.areaId);
    }
    if (filter.projectId) {
      where.push('project_id = ?');
      params.push(filter.projectId);
    }
    if (filter.parentId) {
      where.push('parent_id = ?');
      params.push(filter.parentId);
    }
    if (filter.parentIsNull === true) {
      where.push('parent_id is null');
    }
    if (filter.scheduledIsNull === true) {
      where.push('scheduled_for is null');
    }
    if (filter.scheduledFrom) {
      where.push('scheduled_for >= ?');
      params.push(filter.scheduledFrom);
    }
    if (filter.scheduledTo) {
      where.push('scheduled_for <= ?');
      params.push(filter.scheduledTo);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const sql = `select * from work_items ${whereSql}
                 order by case when scheduled_for is null then 1 else 0 end,
                          scheduled_for asc,
                          priority asc,
                          created_at desc`;
    return this.db
      .query<WorkItemRow, typeof params>(sql)
      .all(...params)
      .map(rowToWorkItem);
  }

  replace(item: WorkItem): WorkItem {
    this.db
      .prepare(
        `update work_items set
          project_id = ?, area_id = ?, parent_id = ?, title = ?, description = ?,
          kind = ?, status = ?, priority = ?, source = ?, confidence = ?, assignee = ?,
          labels_json = ?, checklist_json = ?, outcome = ?, context = ?,
          estimate_minutes = ?, reminder_at = ?, repeat_rule = ?, blocked_by = ?,
          waiting_on = ?, links_json = ?, review_at = ?, start_at = ?, due_at = ?,
          scheduled_for = ?, today_pinned = ?, sort_order = ?, recurrence_json = ?,
          raw_input = ?, updated_at = ?, completed_at = ?
         where id = ?`,
      )
      .run(
        item.projectId ?? null,
        item.areaId ?? null,
        item.parentId ?? null,
        item.title,
        item.description ?? null,
        item.kind,
        item.status,
        item.priority,
        item.source,
        item.confidence,
        item.assignee,
        JSON.stringify(item.labels),
        JSON.stringify(item.checklist),
        item.outcome ?? null,
        item.context ?? null,
        item.estimateMinutes ?? null,
        item.reminderAt ?? null,
        item.repeatRule ?? null,
        item.blockedBy ?? null,
        item.waitingOn ?? null,
        JSON.stringify(item.links),
        item.reviewAt ?? null,
        item.startAt ?? null,
        item.dueAt ?? null,
        item.scheduledFor ?? null,
        item.todayPinned ? 1 : 0,
        item.sortOrder ?? null,
        item.recurrence ? JSON.stringify(item.recurrence) : null,
        item.rawInput ?? null,
        item.updatedAt,
        item.completedAt ?? null,
        item.id,
      );
    return item;
  }

  deleteById(id: string): boolean {
    return this.db.prepare('delete from work_items where id = ?').run(id).changes > 0;
  }

  countByStatus(): Record<string, number> {
    const rows = this.db
      .query<{ status: string; c: number }, []>(
        'select status, count(*) as c from work_items group by status',
      )
      .all();
    return Object.fromEntries(rows.map((r) => [r.status, r.c]));
  }
}
