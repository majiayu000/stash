import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { fixedClock } from '@stash/shared';
import { openDatabase } from '../../db/connection.js';
import { migrate } from '../../db/migrate.js';
import { AreaNameConflictError, AreaNotFoundError, AreaService } from './service.js';

function freshDb(): Database {
  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  return db;
}

describe('AreaService', () => {
  let db: Database;
  let service: AreaService;

  beforeEach(() => {
    db = freshDb();
    service = new AreaService({ db, clock: fixedClock('2026-05-14T10:00:00.000Z') });
  });

  test('create persists a new area with defaults', () => {
    const area = service.create({ name: 'AI tooling' });
    expect(area.id).toHaveLength(26);
    expect(area.name).toBe('AI tooling');
    expect(area.reviewCadence).toBe('weekly');
    expect(area.createdAt).toBe('2026-05-14T10:00:00.000Z');
    expect(area.updatedAt).toBe('2026-05-14T10:00:00.000Z');

    const found = service.get(area.id);
    expect(found?.name).toBe('AI tooling');
  });

  test('create rejects empty name', () => {
    expect(() => service.create({ name: '   ' })).toThrow('area name is required');
  });

  test('create rejects duplicate name', () => {
    service.create({ name: 'AI tooling' });
    expect(() => service.create({ name: 'AI tooling' })).toThrow(AreaNameConflictError);
  });

  test('update partial-merges fields', () => {
    const area = service.create({ name: 'Personal admin' });
    const updated = service.update(area.id, {
      description: 'errands + life admin',
      reviewCadence: 'monthly',
    });
    expect(updated.name).toBe('Personal admin');
    expect(updated.description).toBe('errands + life admin');
    expect(updated.reviewCadence).toBe('monthly');
  });

  test('update rejects renaming to an existing name', () => {
    service.create({ name: 'AI tooling' });
    const other = service.create({ name: 'Personal admin' });
    expect(() => service.update(other.id, { name: 'AI tooling' })).toThrow(
      AreaNameConflictError,
    );
  });

  test('update throws when area is missing', () => {
    expect(() => service.update('missing', { name: 'x' })).toThrow(AreaNotFoundError);
  });

  test('delete removes the area', () => {
    const area = service.create({ name: 'Throwaway' });
    service.delete(area.id);
    expect(service.get(area.id)).toBeNull();
  });

  test('delete throws when area is missing', () => {
    expect(() => service.delete('missing')).toThrow(AreaNotFoundError);
  });

  test('list returns areas sorted by name', () => {
    service.create({ name: 'Zeta' });
    service.create({ name: 'Alpha' });
    service.create({ name: 'Mu' });
    const names = service.list().map((a) => a.name);
    expect(names).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  test('ensureDefaults seeds DEFAULT_AREAS once', () => {
    const first = service.ensureDefaults();
    expect(first.created.length).toBeGreaterThanOrEqual(6);
    expect(first.existing).toEqual([]);

    const second = service.ensureDefaults();
    expect(second.created).toEqual([]);
    expect(second.existing.length).toBeGreaterThanOrEqual(6);
  });
});
