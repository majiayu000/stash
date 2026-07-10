import { afterEach, describe, expect, test } from 'vitest';
import {
  claimPendingUndo,
  clearPendingUndo,
  registerPendingUndo,
  type PendingUndoToken,
  type UndoLayer,
} from './undoCoordinator';

const createdTokens: PendingUndoToken[] = [];

function register(layer: UndoLayer): PendingUndoToken {
  const token = registerPendingUndo(layer);
  createdTokens.push(token);
  return token;
}

afterEach(() => {
  for (const token of createdTokens.splice(0)) clearPendingUndo(token);
});

describe('undo coordinator', () => {
  test('claims pending undo tokens in newest-first order', () => {
    const older = register('inbox');
    const newer = register('today');

    expect(newer.sequence).toBeGreaterThan(older.sequence);
    expect(claimPendingUndo(older)).toBe(false);
    expect(claimPendingUndo(newer)).toBe(true);
    expect(claimPendingUndo(older)).toBe(true);
  });

  test('clearing an older token preserves a newer pending undo', () => {
    const older = register('inbox');
    const newer = register('today');

    clearPendingUndo(older);

    expect(claimPendingUndo(newer)).toBe(true);
    expect(claimPendingUndo(older)).toBe(false);
  });

  test('stale cleanup cannot clear a token registered after it', () => {
    const stale = register('inbox');
    expect(claimPendingUndo(stale)).toBe(true);
    const newer = register('today');

    clearPendingUndo(stale);

    expect(claimPendingUndo(newer)).toBe(true);
  });
});
