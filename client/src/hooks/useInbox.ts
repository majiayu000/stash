import type { CreateWorkItemInput, WorkItem } from '@stash/shared';
import { useCallback } from 'react';
import { createWorkItem, updateWorkItem } from '../api/work-items';
import { useAsync } from './useAsync';
import { listWorkItems } from '../api/work-items';

export interface InboxApi {
  data: WorkItem[] | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
  capture: (title: string, extras?: Partial<CreateWorkItemInput>) => Promise<WorkItem>;
  planToday: (id: string) => Promise<WorkItem>;
  someday: (id: string) => Promise<WorkItem>;
  drop: (id: string) => Promise<WorkItem>;
}

export function useInbox(): InboxApi {
  const state = useAsync<WorkItem[]>(
    () => listWorkItems({ status: 'inbox' }),
    [],
  );

  const capture = useCallback(
    async (title: string, extras: Partial<CreateWorkItemInput> = {}) => {
      const item = await createWorkItem({ title, kind: 'idea', status: 'inbox', ...extras });
      state.reload();
      return item;
    },
    [state],
  );

  const planToday = useCallback(
    async (id: string) => {
      const item = await updateWorkItem(id, {
        status: 'planned',
        scheduledForRelative: 'today',
      });
      state.reload();
      return item;
    },
    [state],
  );

  const someday = useCallback(
    async (id: string) => {
      const item = await updateWorkItem(id, { status: 'someday' });
      state.reload();
      return item;
    },
    [state],
  );

  const drop = useCallback(
    async (id: string) => {
      const item = await updateWorkItem(id, { status: 'dropped' });
      state.reload();
      return item;
    },
    [state],
  );

  return { ...state, capture, planToday, someday, drop };
}
