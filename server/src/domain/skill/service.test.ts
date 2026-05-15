import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { AreaService } from '../area/service.js';
import { SkillConflictError, SkillNotFoundError, SkillService } from './service.js';

describe('SkillService', () => {
  let db: Database;
  let service: SkillService;
  let areaService: AreaService;
  const at = '2026-05-14T10:00:00.000Z';

  beforeEach(() => {
    db = freshDb();
    const clock = fixedClock(at);
    service = new SkillService({ db, clock });
    areaService = new AreaService({ db, clock });
  });

  // ─── Catalog ───────────────────────────────────────────────────────────

  test('create persists a skill with defaults', () => {
    const s = service.create({ id: 'rust-best-practices', name: 'Rust Best Practices' });
    expect(s.id).toBe('rust-best-practices');
    expect(s.emoji).toBe('🧩');
    expect(s.source).toBe('community');
    expect(s.installed).toBe(false);
    expect(s.stars).toBe(0);
    expect(s.createdAt).toBe(at);
  });

  test('create rejects duplicate id', () => {
    service.create({ id: 'react-bp', name: 'React BP' });
    expect(() => service.create({ id: 'react-bp', name: 'dup' })).toThrow(SkillConflictError);
  });

  test('list filters by installed', () => {
    service.create({ id: 'a', name: 'A', installed: true });
    service.create({ id: 'b', name: 'B', installed: false });
    service.create({ id: 'c', name: 'C', installed: true });

    const installed = service.list({ installed: true });
    expect(installed.map((s) => s.id).sort()).toEqual(['a', 'c']);
    expect(service.list().length).toBe(3);
  });

  test('update merges fields', () => {
    service.create({ id: 'sec', name: 'Security Review' });
    const updated = service.update('sec', { installed: true, stars: 156 });
    expect(updated.installed).toBe(true);
    expect(updated.stars).toBe(156);
    expect(updated.name).toBe('Security Review');
  });

  test('update rejects unknown id', () => {
    expect(() => service.update('nope', { stars: 5 })).toThrow(SkillNotFoundError);
  });

  test('delete removes the row', () => {
    service.create({ id: 'temp', name: 'temp' });
    service.delete('temp');
    expect(service.get('temp')).toBeNull();
  });

  test('list sorts by stars desc then name asc', () => {
    service.create({ id: 'low',    name: 'low',    stars: 1 });
    service.create({ id: 'top',    name: 'top',    stars: 500 });
    service.create({ id: 'middle', name: 'middle', stars: 50 });
    const ids = service.list().map((s) => s.id);
    expect(ids).toEqual(['top', 'middle', 'low']);
  });

  // ─── Bindings ──────────────────────────────────────────────────────────

  test('bind a skill to a project then list', () => {
    const area = areaService.create({ name: 'aurora' });
    service.create({ id: 's1', name: 'Skill 1', installed: true });
    service.toggleBinding(area.id, 's1', true);
    const bindings = service.listBindingsForProject(area.id);
    expect(bindings.length).toBe(1);
    expect(bindings[0]?.skillId).toBe('s1');
    expect(bindings[0]?.enabled).toBe(true);
  });

  test('toggleBinding disables without removing', () => {
    const area = areaService.create({ name: 'aurora' });
    service.create({ id: 's1', name: 'Skill 1', installed: true });
    service.toggleBinding(area.id, 's1', true);
    service.toggleBinding(area.id, 's1', false);
    const bindings = service.listBindingsForProject(area.id);
    expect(bindings.length).toBe(1);
    expect(bindings[0]?.enabled).toBe(false);
  });

  test('setProjectBindings syncs the set', () => {
    const area = areaService.create({ name: 'aurora' });
    service.create({ id: 'a', name: 'a', installed: true });
    service.create({ id: 'b', name: 'b', installed: true });
    service.create({ id: 'c', name: 'c', installed: true });

    service.setProjectBindings(area.id, ['a', 'b']);
    expect(service.listBindingsForProject(area.id).map((b) => b.skillId).sort()).toEqual(['a', 'b']);

    service.setProjectBindings(area.id, ['b', 'c']);
    expect(service.listBindingsForProject(area.id).map((b) => b.skillId).sort()).toEqual(['b', 'c']);
  });

  test('setProjectBindings rejects unknown skill', () => {
    const area = areaService.create({ name: 'aurora' });
    expect(() => service.setProjectBindings(area.id, ['ghost'])).toThrow(SkillNotFoundError);
  });

  test('unbind drops the row', () => {
    const area = areaService.create({ name: 'aurora' });
    service.create({ id: 's1', name: 's1', installed: true });
    service.toggleBinding(area.id, 's1', true);
    service.unbind(area.id, 's1');
    expect(service.listBindingsForProject(area.id)).toHaveLength(0);
  });

  test('deleting a skill cascades to bindings', () => {
    const area = areaService.create({ name: 'aurora' });
    service.create({ id: 's1', name: 's1', installed: true });
    service.toggleBinding(area.id, 's1', true);
    service.delete('s1');
    expect(service.listBindingsForProject(area.id)).toHaveLength(0);
  });
});
