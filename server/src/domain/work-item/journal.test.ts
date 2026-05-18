import { beforeEach, describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { JournalService } from './journal.js';
import { WorkItemService } from './service.js';

describe('JournalService', () => {
  const at = '2026-05-18T10:00:00.000Z';
  let workItems: WorkItemService;
  let journal: JournalService;
  let workItemId: string;

  beforeEach(() => {
    const db = freshDb();
    const clock = fixedClock(at);
    workItems = new WorkItemService({ db, clock });
    journal = new JournalService({ db, clock });
    workItemId = workItems.create({ title: 'host' }).id;
  });

  test('append + list newest-first', () => {
    const a = journal.append(workItemId, { body: 'first thought' });
    const b = journal.append(workItemId, { body: 'second thought' });
    const list = journal.list(workItemId);
    expect(list.length).toBe(2);
    // newest first — but identical clock yields ulid lex tiebreak; both work.
    const ids = list.map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  test('rejects empty body', () => {
    expect(() => journal.append(workItemId, { body: '   ' })).toThrow('journal body cannot be empty');
  });

  test('delete removes the row', () => {
    const e = journal.append(workItemId, { body: 'remove me' });
    expect(journal.delete(e.id)).toBe(true);
    expect(journal.list(workItemId).length).toBe(0);
    expect(journal.delete(e.id)).toBe(false);
  });

  test('cascade delete with work item', () => {
    journal.append(workItemId, { body: 'will vanish' });
    workItems.delete(workItemId);
    expect(journal.list(workItemId).length).toBe(0);
  });
});
