import { useMemo } from 'react';
import { useAsync } from '../hooks/useAsync';
import { listAreas } from '../api/areas';
import { listWorkItems } from '../api/work-items';
import { listAgentSessions } from '../api/agent-sessions';
import { getWorkboard } from '../api/workboard';
import { adaptToWorkbenchData, type WBData } from './data';

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
} {
  const state = useAsync(async () => {
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
  }, []);

  const data = useMemo(() => {
    if (!state.data) return undefined;
    return adaptToWorkbenchData(state.data);
  }, [state.data]);

  return {
    data,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
  };
}
