import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import {
  InvalidStatusTransitionError,
  ValidationError,
  WorkItemNotFoundError,
  WorkItemService,
  isTransitionAllowed,
} from './service.js';

describe('WorkItemService.create', () => {
  let db: Database;
  let service: WorkItemService;

  beforeEach(() => {
    db = freshDb();
    service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
  });

  test('applies sensible defaults when only title is supplied', () => {
    const item = service.create({ title: 'remember to triage backlog' });
    expect(item.id).toHaveLength(26);
    expect(item.title).toBe('remember to triage backlog');
    expect(item.kind).toBe('task');
    expect(item.status).toBe('inbox');
    expect(item.priority).toBe('p2');
    expect(item.source).toBe('manual');
    expect(item.confidence).toBe('explicit');
    expect(item.assignee).toBe('human');
    expect(item.labels).toEqual([]);
    expect(item.checklist).toEqual([]);
    expect(item.links).toEqual([]);
    expect(item.completedAt).toBeUndefined();
    expect(item.createdAt).toBe('2026-05-14T10:00:00.000Z');
  });

  test('rejects empty title', () => {
    expect(() => service.create({ title: '   ' })).toThrow(ValidationError);
  });

  test('quickCapture defaults kind=idea, status=inbox', () => {
    const item = service.quickCapture('random thought about lexer');
    expect(item.kind).toBe('idea');
    expect(item.status).toBe('inbox');
    expect(item.title).toBe('random thought about lexer');
  });

  test('records completedAt when created directly as done', () => {
    const item = service.create({ title: 'already done', status: 'done' });
    expect(item.completedAt).toBe('2026-05-14T10:00:00.000Z');
  });

  test('round-trips JSON columns through SQLite', () => {
    const created = service.create({
      title: 'with labels',
      labels: ['design', 'p1'],
      links: ['https://example.com'],
      checklist: [{ id: 'c1', text: 'step a', completed: false }],
    });
    const found = service.get(created.id);
    expect(found?.labels).toEqual(['design', 'p1']);
    expect(found?.links).toEqual(['https://example.com']);
    expect(found?.checklist).toEqual([{ id: 'c1', text: 'step a', completed: false }]);
  });
});

describe('WorkItemService.list', () => {
  let db: Database;
  let service: WorkItemService;

  beforeEach(() => {
    db = freshDb();
    service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    service.create({ title: 'A inbox', status: 'inbox' });
    service.create({ title: 'B today', status: 'planned', scheduledFor: '2026-05-14' });
    service.create({ title: 'C tomorrow', status: 'planned', scheduledFor: '2026-05-15' });
    service.create({ title: 'D waiting', status: 'waiting' });
    service.create({ title: 'E someday', status: 'someday' });
    service.create({ title: 'F dropped', status: 'dropped' });
  });

  test('excludes dropped by default', () => {
    const titles = service.list().map((i) => i.title);
    expect(titles).not.toContain('F dropped');
  });

  test('filters by status', () => {
    expect(service.list({ status: 'waiting' }).map((i) => i.title)).toEqual(['D waiting']);
  });

  test('filters by status[] (today view)', () => {
    const today = service.list({
      status: ['planned', 'active'],
      scheduledFrom: '2026-05-14',
      scheduledTo: '2026-05-14',
    });
    expect(today.map((i) => i.title)).toEqual(['B today']);
  });

  test('filters by scheduledIsNull (no-date)', () => {
    const noDate = service.list({ scheduledIsNull: true }).map((i) => i.title);
    expect(noDate).toContain('A inbox');
    expect(noDate).toContain('D waiting');
    expect(noDate).toContain('E someday');
    expect(noDate).not.toContain('B today');
  });

  test('orders by scheduled date then priority', () => {
    const planned = service.list({ status: 'planned' });
    expect(planned.map((i) => i.title)).toEqual(['B today', 'C tomorrow']);
  });

  test('filters by kind', () => {
    service.create({ title: 'morning reset', kind: 'system' });
    expect(service.list({ kind: 'system' }).map((i) => i.title)).toEqual(['morning reset']);
  });
});

describe('WorkItemService.update', () => {
  let db: Database;
  let service: WorkItemService;

  beforeEach(() => {
    db = freshDb();
    service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
  });

  test('partial-merges fields without clobbering others', () => {
    const item = service.create({ title: 'thing', labels: ['original'], priority: 'p1' });
    const updated = service.update(item.id, { priority: 'p0' });
    expect(updated.priority).toBe('p0');
    expect(updated.labels).toEqual(['original']);
    expect(updated.title).toBe('thing');
  });

  test('rejects invalid status transition', () => {
    const item = service.create({ title: 'thing', status: 'done' });
    // done → inbox is not in STATUS_TRANSITIONS
    expect(() => service.update(item.id, { status: 'inbox' })).toThrow(
      InvalidStatusTransitionError,
    );
  });

  test('allows in-place no-op transition', () => {
    const item = service.create({ title: 'thing', status: 'planned' });
    const updated = service.update(item.id, { status: 'planned' });
    expect(updated.status).toBe('planned');
  });

  test('sets completedAt when transitioning to done', () => {
    const item = service.create({ title: 'thing', status: 'planned' });
    const updated = service.update(item.id, { status: 'done' });
    expect(updated.status).toBe('done');
    expect(updated.completedAt).toBe('2026-05-14T10:00:00.000Z');
  });

  test('allows weekly review to move planned work to someday', () => {
    const item = service.create({ title: 'thing', status: 'planned' });
    const updated = service.update(item.id, { status: 'someday' });
    expect(updated.status).toBe('someday');
    expect(updated.scheduledFor).toBeUndefined();
  });

  test('clears completedAt when un-completing (done → planned)', () => {
    const item = service.create({ title: 'thing', status: 'done' });
    const updated = service.update(item.id, { status: 'planned' });
    expect(updated.completedAt).toBeUndefined();
  });

  test('clears date and context fields when patching them to null', () => {
    const item = service.create({
      title: 'thing',
      status: 'active',
      description: 'notes',
      context: 'ctx',
      scheduledFor: '2026-05-14',
      startAt: '2026-05-14T09:00:00.000Z',
      dueAt: '2026-05-14T18:00:00.000Z',
      sortOrder: 1000,
    });

    const updated = service.update(item.id, {
      status: 'planned',
      todayPinned: false,
      description: null,
      context: null,
      scheduledFor: null,
      startAt: null,
      dueAt: null,
      sortOrder: null,
    });

    expect(updated.status).toBe('planned');
    expect(updated.todayPinned).toBe(false);
    expect(updated.description).toBeUndefined();
    expect(updated.context).toBeUndefined();
    expect(updated.scheduledFor).toBeUndefined();
    expect(updated.startAt).toBeUndefined();
    expect(updated.dueAt).toBeUndefined();
    expect(updated.sortOrder).toBeUndefined();
    expect(service.today().some((candidate) => candidate.id === item.id)).toBe(false);
  });

  test('throws when item missing', () => {
    expect(() => service.update('nope', { title: 'x' })).toThrow(WorkItemNotFoundError);
  });

  test('rejects empty title on update', () => {
    const item = service.create({ title: 'thing' });
    expect(() => service.update(item.id, { title: '   ' })).toThrow(ValidationError);
  });
});

describe('WorkItemService.delete', () => {
  test('removes the item', () => {
    const db = freshDb();
    const service = new WorkItemService({ db });
    const item = service.create({ title: 'gone' });
    service.delete(item.id);
    expect(service.get(item.id)).toBeNull();
  });

  test('throws when missing', () => {
    const db = freshDb();
    const service = new WorkItemService({ db });
    expect(() => service.delete('missing')).toThrow(WorkItemNotFoundError);
  });
});

describe('WorkItemService.checklist', () => {
  let db: Database;
  let service: WorkItemService;

  beforeEach(() => {
    db = freshDb();
    service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
  });

  test('append, toggle, rename, remove flow', () => {
    const item = service.create({ title: 'parent' });
    const withOne = service.appendChecklistItem(item.id, 'step a');
    expect(withOne.checklist).toHaveLength(1);
    expect(withOne.checklist[0]!.completed).toBe(false);
    const childId = withOne.checklist[0]!.id;

    const toggled = service.toggleChecklistItem(item.id, childId);
    expect(toggled.checklist[0]!.completed).toBe(true);

    const renamed = service.renameChecklistItem(item.id, childId, 'step A renamed');
    expect(renamed.checklist[0]!.text).toBe('step A renamed');

    const removed = service.removeChecklistItem(item.id, childId);
    expect(removed.checklist).toEqual([]);
  });

  test('rejects empty checklist text', () => {
    const item = service.create({ title: 'parent' });
    expect(() => service.appendChecklistItem(item.id, '  ')).toThrow(ValidationError);
  });
});

describe('WorkItemService.systems', () => {
  let db: Database;
  let service: WorkItemService;

  beforeEach(() => {
    db = freshDb();
    service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
  });

  test('rejects system templates marked done', () => {
    expect(() => service.create({ title: 'weekly reset', kind: 'system', status: 'done' })).toThrow(ValidationError);
    const system = service.create({ title: 'weekly reset', kind: 'system' });
    expect(() => service.update(system.id, { status: 'done' })).toThrow(ValidationError);
  });

  test('creates a fresh run linked to the system template', () => {
    const system = service.create({
      title: 'airbnb turnover',
      kind: 'system',
      areaId: 'area-home',
      priority: 'p1',
      labels: ['home', 'ops'],
      estimateMinutes: 45,
      checklist: [
        { id: 'step-1', text: 'replace towels', completed: true },
        { id: 'step-2', text: 'check supplies', completed: false },
      ],
    });

    const run = service.instantiateSystem(system.id, { scheduledFor: '2026-05-15' });

    expect(run.kind).toBe('chore');
    expect(run.status).toBe('active');
    expect(run.parentId).toBe(system.id);
    expect(run.areaId).toBe('area-home');
    expect(run.priority).toBe('p1');
    expect(run.labels).toEqual(['home', 'ops']);
    expect(run.estimateMinutes).toBe(45);
    expect(run.scheduledFor).toBe('2026-05-15');
    expect(run.rawInput).toBe('run system: airbnb turnover');
    expect(run.checklist.map((item) => item.text)).toEqual(['replace towels', 'check supplies']);
    expect(run.checklist.map((item) => item.completed)).toEqual([false, false]);
    expect(run.checklist.map((item) => item.id)).not.toEqual(system.checklist.map((item) => item.id));
    expect(service.list({ parentId: system.id }).map((item) => item.id)).toEqual([run.id]);
  });

  test('rejects non-system templates', () => {
    const task = service.create({ title: 'ordinary task', kind: 'task' });
    expect(() => service.instantiateSystem(task.id)).toThrow(ValidationError);
  });
});

describe('WorkItemService sub-task filtering', () => {
  test('parentId filter returns only direct children', () => {
    const db = freshDb();
    const service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    const epic = service.create({ title: 'epic', kind: 'epic' });
    const child1 = service.create({ title: 'child A', parentId: epic.id });
    const child2 = service.create({ title: 'child B', parentId: epic.id });
    service.create({ title: 'unrelated' });

    const children = service.list({ parentId: epic.id });
    expect(children.map((c) => c.id).sort()).toEqual([child1.id, child2.id].sort());
  });

  test('parentIsNull filter excludes children', () => {
    const db = freshDb();
    const service = new WorkItemService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
    const top = service.create({ title: 'top' });
    service.create({ title: 'child', parentId: top.id });

    const roots = service.list({ parentIsNull: true });
    expect(roots.map((r) => r.id)).toEqual([top.id]);
  });
});

describe('isTransitionAllowed (pure)', () => {
  test('allows inbox → planned', () => {
    expect(isTransitionAllowed('inbox', 'planned')).toBe(true);
  });
  test('allows planned → someday', () => {
    expect(isTransitionAllowed('planned', 'someday')).toBe(true);
  });
  test('disallows done → blocked', () => {
    expect(isTransitionAllowed('done', 'blocked')).toBe(false);
  });
  test('allows same-state', () => {
    expect(isTransitionAllowed('waiting', 'waiting')).toBe(true);
  });
});
