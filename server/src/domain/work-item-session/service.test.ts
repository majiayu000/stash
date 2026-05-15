import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { fixedClock } from '@stash/shared';
import { openDatabase } from '../../db/connection.js';
import { migrate } from '../../db/migrate.js';
import { WorkItemService, WorkItemNotFoundError } from '../work-item/service.js';
import { WorkItemSessionService } from './service.js';

function setup(): { db: Database; items: WorkItemService; links: WorkItemSessionService } {
  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  const clock = fixedClock('2026-05-14T10:00:00.000Z');
  return {
    db,
    items: new WorkItemService({ db, clock }),
    links: new WorkItemSessionService({ db, clock }),
  };
}

describe('WorkItemSessionService', () => {
  let db: Database;
  let items: WorkItemService;
  let links: WorkItemSessionService;

  beforeEach(() => {
    const s = setup();
    db = s.db;
    items = s.items;
    links = s.links;
  });

  test('link inserts a new edge', () => {
    const item = items.create({ title: 'work on auth' });
    const link = links.link(item.id, 'claude', 'sess-1');
    expect(link.workItemId).toBe(item.id);
    expect(link.provider).toBe('claude');
    expect(link.sessionId).toBe('sess-1');
    expect(link.linkedAt).toBe('2026-05-14T10:00:00.000Z');

    expect(links.forWorkItem(item.id)).toHaveLength(1);
  });

  test('link is idempotent on duplicate key', () => {
    const item = items.create({ title: 'thing' });
    links.link(item.id, 'claude', 'sess-1');
    links.link(item.id, 'claude', 'sess-1');
    expect(links.forWorkItem(item.id)).toHaveLength(1);
  });

  test('unlink removes the edge', () => {
    const item = items.create({ title: 'thing' });
    links.link(item.id, 'claude', 'sess-1');
    links.unlink(item.id, 'claude', 'sess-1');
    expect(links.forWorkItem(item.id)).toEqual([]);
  });

  test('link throws WorkItemNotFoundError when item missing', () => {
    expect(() => links.link('nope', 'claude', 'sess-1')).toThrow(WorkItemNotFoundError);
  });

  test('cascade delete clears links when work item is removed', () => {
    const item = items.create({ title: 'goes away' });
    links.link(item.id, 'claude', 'sess-1');
    items.delete(item.id);
    expect(links.forWorkItem(item.id)).toEqual([]);
  });

  test('workItemsForSession returns all linked work items for a session', () => {
    const a = items.create({ title: 'A' });
    const b = items.create({ title: 'B' });
    links.link(a.id, 'claude', 'sess-shared');
    links.link(b.id, 'claude', 'sess-shared');
    const found = links.workItemsForSession('claude', 'sess-shared').sort();
    expect(found).toEqual([a.id, b.id].sort());
  });
});
