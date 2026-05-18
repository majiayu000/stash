import { beforeEach, describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { BudgetConflictError, BudgetNotFoundError, BudgetService } from './service.js';

describe('BudgetService', () => {
  let svc: BudgetService;
  const at = '2026-05-18T10:00:00.000Z';

  beforeEach(() => {
    svc = new BudgetService({ db: freshDb(), clock: fixedClock(at) });
  });

  test('create + list + get round-trip', () => {
    const b = svc.create({ scope: 'aurora', capUsd: 50, period: 'month', notes: 'cap before reset' });
    expect(b.id).toBeTruthy();
    expect(b.capUsd).toBe(50);
    expect(svc.list().length).toBe(1);
    expect(svc.get(b.id)?.scope).toBe('aurora');
  });

  test('rejects empty scope and non-positive cap', () => {
    expect(() => svc.create({ scope: '  ', capUsd: 10 })).toThrow();
    expect(() => svc.create({ scope: 'aurora', capUsd: 0 })).toThrow();
    expect(() => svc.create({ scope: 'aurora', capUsd: -1 })).toThrow();
  });

  test('unique on (scope, period)', () => {
    svc.create({ scope: 'aurora', capUsd: 50, period: 'month' });
    expect(() => svc.create({ scope: 'aurora', capUsd: 100, period: 'month' })).toThrow(BudgetConflictError);
    // Different period is OK.
    expect(() => svc.create({ scope: 'aurora', capUsd: 200, period: 'week' })).not.toThrow();
  });

  test('update merges and validates', () => {
    const b = svc.create({ scope: 'aurora', capUsd: 50 });
    const u = svc.update(b.id, { capUsd: 80 });
    expect(u.capUsd).toBe(80);
    expect(u.scope).toBe('aurora'); // unchanged
    expect(() => svc.update('ghost', { capUsd: 10 })).toThrow(BudgetNotFoundError);
    expect(() => svc.update(b.id, { capUsd: -1 })).toThrow();
  });

  test('delete removes the row', () => {
    const b = svc.create({ scope: 'aurora', capUsd: 50 });
    svc.delete(b.id);
    expect(svc.list()).toHaveLength(0);
    expect(() => svc.delete(b.id)).toThrow(BudgetNotFoundError);
  });
});
