import { useCallback, useState } from 'react';
import type { CreateWorkItemInput, UpdateWorkItemInput, WorkItem } from '@stash/shared';
import {
  createWorkItem,
  deleteWorkItem,
  listWorkItems,
  updateWorkItem,
  type WorkItemFilter,
} from '../api/work-items';
import { useAsync, type AsyncState } from './useAsync';

export interface WorkItemsApi extends AsyncState<WorkItem[]> {
  create: (input: CreateWorkItemInput) => Promise<WorkItem>;
  update: (id: string, input: UpdateWorkItemInput) => Promise<WorkItem>;
  remove: (id: string) => Promise<void>;
}

export function useWorkItems(filter: WorkItemFilter = {}): WorkItemsApi {
  const filterKey = JSON.stringify(filter);
  const state = useAsync<WorkItem[]>(() => listWorkItems(filter), [filterKey]);

  const create = useCallback(
    async (input: CreateWorkItemInput) => {
      const item = await createWorkItem(input);
      state.reload();
      return item;
    },
    [state],
  );

  const update = useCallback(
    async (id: string, input: UpdateWorkItemInput) => {
      const item = await updateWorkItem(id, input);
      state.reload();
      return item;
    },
    [state],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteWorkItem(id);
      state.reload();
    },
    [state],
  );

  return { ...state, create, update, remove };
}
