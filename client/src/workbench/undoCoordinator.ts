export type UndoLayer = 'inbox' | 'today';

export interface PendingUndoToken {
  readonly sequence: number;
  readonly layer: UndoLayer;
}

let nextSequence = 0;
const pendingStack: PendingUndoToken[] = [];

export function registerPendingUndo(layer: UndoLayer): PendingUndoToken {
  const token: PendingUndoToken = { sequence: ++nextSequence, layer };
  pendingStack.push(token);
  return token;
}

export function claimPendingUndo(token: PendingUndoToken): boolean {
  if (pendingStack[pendingStack.length - 1] !== token) return false;
  pendingStack.pop();
  return true;
}

export function clearPendingUndo(token: PendingUndoToken): boolean {
  const index = pendingStack.indexOf(token);
  if (index < 0) return false;
  pendingStack.splice(index, 1);
  return true;
}
