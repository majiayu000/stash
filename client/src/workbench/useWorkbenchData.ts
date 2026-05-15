import { useMemo } from 'react';
import { useAsync } from '../hooks/useAsync';
import { listWorkItems } from '../api/work-items';
import { listAgentSessions } from '../api/agent-sessions';
import { getWorkboard } from '../api/workboard';
import { adaptToWorkbenchData, type WBData } from './data';

/**
 * One-stop hook used by every Concept: fetches the three primary sources in
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
    const [items, sessionsRes, workboard] = await Promise.all([
      listWorkItems({ includeDropped: false }),
      listAgentSessions('all'),
      getWorkboard(),
    ]);
    return { items, sessions: sessionsRes.sessions, workboardProjects: workboard.projects };
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
