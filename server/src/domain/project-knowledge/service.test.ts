import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { AreaService } from '../area/service.js';
import { KnowledgeNotFoundError, ProjectKnowledgeService } from './service.js';

describe('ProjectKnowledgeService', () => {
  let db: Database;
  let service: ProjectKnowledgeService;
  let areaService: AreaService;
  let areaId: string;
  const at = '2026-05-14T10:00:00.000Z';

  beforeEach(() => {
    db = freshDb();
    const clock = fixedClock(at);
    service = new ProjectKnowledgeService({ db, clock });
    areaService = new AreaService({ db, clock });
    areaId = areaService.create({ name: 'aurora' }).id;
  });

  // ─── intent ───────────────────────────────────────────────────────────────

  test('setIntent upserts the row', () => {
    const first = service.setIntent(areaId, '  ship v1 by friday  ');
    expect(first.text).toBe('ship v1 by friday');
    expect(first.updatedAt).toBe(at);

    const second = service.setIntent(areaId, 'changed');
    expect(second.text).toBe('changed');
    expect(service.getIntent(areaId)?.text).toBe('changed');
  });

  test('getIntent returns null when missing', () => {
    expect(service.getIntent(areaId)).toBeNull();
  });

  // ─── milestones ───────────────────────────────────────────────────────────

  test('createMilestone clamps progress 0-100', () => {
    const m1 = service.createMilestone(areaId, { name: 'Launch', progress: 250 });
    expect(m1.progress).toBe(100);

    const m2 = service.createMilestone(areaId, { name: 'Plan', progress: -10 });
    expect(m2.progress).toBe(0);

    const m3 = service.createMilestone(areaId, { name: 'Mid', progress: 42.7 });
    expect(m3.progress).toBe(43);
  });

  test('createMilestone rejects empty name', () => {
    expect(() => service.createMilestone(areaId, { name: '   ' })).toThrow('milestone name is required');
  });

  test('createMilestone defaults status to planned and progress to 0', () => {
    const m = service.createMilestone(areaId, { name: 'kickoff' });
    expect(m.status).toBe('planned');
    expect(m.progress).toBe(0);
    expect(m.projectId).toBe(areaId);
  });

  test('updateMilestone merges only provided fields', () => {
    const m = service.createMilestone(areaId, { name: 'beta', status: 'planned', progress: 10 });
    const updated = service.updateMilestone(m.id, { status: 'wip', progress: 60 });
    expect(updated.status).toBe('wip');
    expect(updated.progress).toBe(60);
    expect(updated.name).toBe('beta');
  });

  test('updateMilestone throws for missing id', () => {
    expect(() => service.updateMilestone('ghost', { status: 'done' })).toThrow(KnowledgeNotFoundError);
  });

  test('deleteMilestone removes the row', () => {
    const m = service.createMilestone(areaId, { name: 'remove me' });
    service.deleteMilestone(m.id);
    expect(service.listMilestones(areaId)).toHaveLength(0);
  });

  test('listMilestones returns by area only', () => {
    const otherArea = areaService.create({ name: 'borealis' }).id;
    service.createMilestone(areaId, { name: 'a' });
    service.createMilestone(otherArea, { name: 'b' });
    expect(service.listMilestones(areaId)).toHaveLength(1);
    expect(service.listMilestones(otherArea)).toHaveLength(1);
  });

  // ─── decisions ────────────────────────────────────────────────────────────

  test('createDecision defaults date to today and tags to []', () => {
    const d = service.createDecision(areaId, { title: 'use bun' });
    expect(d.date).toBe(at.slice(0, 10));
    expect(d.tags).toEqual([]);
    expect(d.body).toBe('');
  });

  test('createDecision persists tags as array', () => {
    const d = service.createDecision(areaId, {
      title: 'adopt sqlite',
      tags: ['architecture', 'storage'],
      body: 'no postgres',
    });
    expect(d.tags).toEqual(['architecture', 'storage']);

    const list = service.listDecisions(areaId);
    expect(list[0]?.tags).toEqual(['architecture', 'storage']);
  });

  test('createDecision rejects empty title', () => {
    expect(() => service.createDecision(areaId, { title: '' })).toThrow('decision title is required');
  });

  test('updateDecision merges fields and rejects missing id', () => {
    const d = service.createDecision(areaId, { title: 'orig', tags: ['x'] });
    const updated = service.updateDecision(d.id, { title: 'renamed', tags: ['y', 'z'] });
    expect(updated.title).toBe('renamed');
    expect(updated.tags).toEqual(['y', 'z']);

    expect(() => service.updateDecision('ghost', { title: 'x' })).toThrow(KnowledgeNotFoundError);
  });

  test('deleteDecision removes the row', () => {
    const d = service.createDecision(areaId, { title: 'temp' });
    service.deleteDecision(d.id);
    expect(service.listDecisions(areaId)).toHaveLength(0);
    expect(() => service.deleteDecision(d.id)).toThrow(KnowledgeNotFoundError);
  });

  // ─── notes ────────────────────────────────────────────────────────────────

  test('setNotes upserts markdown', () => {
    const n = service.setNotes(areaId, '# hello');
    expect(n.markdown).toBe('# hello');
    expect(n.updatedAt).toBe(at);

    const n2 = service.setNotes(areaId, '# updated');
    expect(n2.markdown).toBe('# updated');
    expect(service.getNotes(areaId)?.markdown).toBe('# updated');
  });

  test('getNotes returns null when missing', () => {
    expect(service.getNotes(areaId)).toBeNull();
  });

  // ─── lessons ──────────────────────────────────────────────────────────────

  test('createLesson without projectId is cross by default', () => {
    const l = service.createLesson({ title: 'always log retries' });
    expect(l.projectId).toBeUndefined();
    expect(l.cross).toBe(true);
  });

  test('createLesson with projectId is scoped non-cross by default', () => {
    const l = service.createLesson({ title: 'scoped', projectId: areaId });
    expect(l.projectId).toBe(areaId);
    expect(l.cross).toBe(false);
  });

  test('createLesson honors explicit cross flag', () => {
    const l = service.createLesson({ title: 'shared', projectId: areaId, cross: true });
    expect(l.cross).toBe(true);
  });

  test('createLesson rejects empty title', () => {
    expect(() => service.createLesson({ title: '  ' })).toThrow('lesson title is required');
  });

  test('listLessons filters by projectId and crossOnly', () => {
    service.createLesson({ title: 'cross-1' });
    service.createLesson({ title: 'cross-2' });
    service.createLesson({ title: 'scoped', projectId: areaId });

    expect(service.listLessons({}).length).toBe(3);
    expect(service.listLessons({ projectId: areaId }).map((l) => l.title)).toEqual(['scoped']);
    expect(service.listLessons({ crossOnly: true }).length).toBe(2);
  });

  test('updateLesson merges and rejects missing id', () => {
    const l = service.createLesson({ title: 'orig' });
    const updated = service.updateLesson(l.id, { title: 'edited', body: 'note' });
    expect(updated.title).toBe('edited');
    expect(updated.body).toBe('note');

    expect(() => service.updateLesson('ghost', { title: 'x' })).toThrow(KnowledgeNotFoundError);
  });

  test('deleteLesson removes the row', () => {
    const l = service.createLesson({ title: 'temp' });
    service.deleteLesson(l.id);
    expect(service.listLessons({}).length).toBe(0);
  });

  // ─── cascade ──────────────────────────────────────────────────────────────

  test('deleting an area cascades through all knowledge tables', () => {
    service.setIntent(areaId, 'gone soon');
    service.createMilestone(areaId, { name: 'm' });
    service.createDecision(areaId, { title: 'd' });
    service.setNotes(areaId, 'notes');
    const scopedLesson = service.createLesson({ title: 'scoped', projectId: areaId });
    const crossLesson = service.createLesson({ title: 'cross' });

    areaService.delete(areaId);

    expect(service.getIntent(areaId)).toBeNull();
    expect(service.listMilestones(areaId)).toHaveLength(0);
    expect(service.listDecisions(areaId)).toHaveLength(0);
    expect(service.getNotes(areaId)).toBeNull();
    const remaining = service.listLessons({}).map((l) => l.id).sort();
    expect(remaining).toEqual([crossLesson.id].sort());
    expect(remaining).not.toContain(scopedLesson.id);
  });
});
