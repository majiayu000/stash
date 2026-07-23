import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { listAreas } from '../api/areas';
import { listWorkItems } from '../api/work-items';
import { listAgentSessions } from '../api/agent-sessions';
import { getWorkboard } from '../api/workboard';
import { adaptToWorkbenchData, type AdaptInput, type WBData } from './data';
import { SharedRefreshResource } from './workbenchDataResource';

export const WORKBENCH_FRESHNESS_MS = 30_000;

async function loadWorkbenchData(): Promise<AdaptInput> {
  const [items, sessionsRes, workboard, areas] = await Promise.all([
    listWorkItems({ includeDropped: false }),
    listAgentSessions('all'),
    getWorkboard(),
    listAreas(),
  ]);
  return {
    items,
    sessions: sessionsRes.sessions,
    sourceErrors: sessionsRes.errors,
    workboardProjects: workboard.projects,
    areas,
  };
}

const workbenchDataResource = new SharedRefreshResource(loadWorkbenchData, {
  freshnessMs: WORKBENCH_FRESHNESS_MS,
});

/**
 * One-stop hook used by every workbench page: fetches the primary sources in
 * parallel, reshapes them into workbench-style `{projects, todos, sessions, stats}`.
 * Hook returns `{ data, loading, error, reload }`.
 */
export function useWorkbenchData(): {
  data: WBData | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
  revalidate: () => void;
} {
  const state = useSyncExternalStore(
    workbenchDataResource.subscribe,
    workbenchDataResource.getSnapshot,
    workbenchDataResource.getSnapshot,
  );

  useEffect(() => {
    void workbenchDataResource.revalidate();
  }, []);

  const data = useMemo(() => {
    if (!state.data) return undefined;
    return adaptToWorkbenchData(state.data);
  }, [state.data]);
  const reload = useCallback(() => {
    void workbenchDataResource.refresh();
  }, []);
  const revalidate = useCallback(() => {
    void workbenchDataResource.revalidate();
  }, []);

  return {
    data,
    loading: state.loading,
    error: state.error,
    reload,
    revalidate,
  };
}
