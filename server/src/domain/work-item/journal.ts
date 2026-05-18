import type { Database } from 'bun:sqlite';
import {
  systemClock,
  ulid,
  type Clock,
  type CreateJournalEntryInput,
  type JournalEntry,
} from '@stash/shared';

/**
 * v0.8 — append-only journal log per work item.
 *
 * Live next to work-item but keep it as a sibling module rather than methods
 * on WorkItemService — the journal is a separate aggregate root and we don't
 * want to bloat the existing service.
 */

interface Row {
  id: string;
  work_item_id: string;
  body: string;
  created_at: string;
}

function row(r: Row): JournalEntry {
  return { id: r.id, workItemId: r.work_item_id, body: r.body, createdAt: r.created_at };
}

export interface JournalServiceDeps { db: Database; clock?: Clock }

export class JournalService {
  private readonly clock: Clock;
  constructor(private readonly deps: JournalServiceDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  list(workItemId: string): JournalEntry[] {
    return this.deps.db
      .query<Row, [string]>('select * from work_item_journal where work_item_id = ? order by created_at desc')
      .all(workItemId)
      .map(row);
  }

  append(workItemId: string, input: CreateJournalEntryInput): JournalEntry {
    const body = input.body.trim();
    if (!body) throw new Error('journal body cannot be empty');
    const entry: JournalEntry = {
      id: ulid(this.clock.now()),
      workItemId,
      body,
      createdAt: this.clock.nowIso(),
    };
    this.deps.db
      .prepare('insert into work_item_journal(id, work_item_id, body, created_at) values (?, ?, ?, ?)')
      .run(entry.id, entry.workItemId, entry.body, entry.createdAt);
    return entry;
  }

  delete(id: string): boolean {
    return this.deps.db.prepare('delete from work_item_journal where id = ?').run(id).changes > 0;
  }
}
