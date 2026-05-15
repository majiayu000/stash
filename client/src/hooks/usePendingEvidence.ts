import { useCallback } from 'react';
import type { ProgressEvidence } from '@stash/shared';
import {
  acceptCompletion,
  listEvidence,
  rejectCompletion,
} from '../api/evidence';
import { useAsync, type AsyncState } from './useAsync';

export interface PendingEvidenceApi extends AsyncState<ProgressEvidence[]> {
  accept: (workItemId: string) => Promise<void>;
  reject: (workItemId: string) => Promise<void>;
}

export function usePendingEvidence(): PendingEvidenceApi {
  const state = useAsync<ProgressEvidence[]>(
    () => listEvidence({ pendingOnly: true }),
    [],
  );

  const accept = useCallback(
    async (workItemId: string) => {
      await acceptCompletion(workItemId);
      state.reload();
    },
    [state],
  );

  const reject = useCallback(
    async (workItemId: string) => {
      await rejectCompletion(workItemId);
      state.reload();
    },
    [state],
  );

  return { ...state, accept, reject };
}
