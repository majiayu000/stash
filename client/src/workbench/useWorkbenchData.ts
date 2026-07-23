import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { add_calendar_days, range_from_dates } from '@stash/shared';
import { listAreas } from '../api/areas';
import { listWorkItems } from '../api/work-items';
import { listAgentSessions } from '../api/agent-sessions';
import { getWorkboard } from '../api/workboard';
import { getRuntimeMetadata, type RuntimeMetadata } from '../api/runtime';
import { adaptToWorkbenchData, type AdaptInput, type WBData } from './data';
import { SharedRefreshResource } from './workbenchDataResource';

export const WORKBENCH_FRESHNESS_MS = 30_000;

async function loadWorkbenchData(): Promise<AdaptInput> {
  const [runtime, items, sessionsRes, workboard, areas] = await Promise.all([
    getRuntimeMetadata(),
    listWorkItems({ includeDropped: false }),
    listAgentSessions('all'),
    getWorkboard(),
    listAreas(),
  ]);
  return {
    runtime,
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
  calendarBlocked: boolean;
  reload: () => void;
  revalidate: () => void;
} {
  const [calendar_blocked, set_calendar_blocked] = useState(false);
  const state = useSyncExternalStore(
    workbenchDataResource.subscribe,
    workbenchDataResource.getSnapshot,
    workbenchDataResource.getSnapshot,
  );

  useEffect(() => {
    void workbenchDataResource.revalidate();
  }, []);

  useEffect(() => {
    if (!state.data) return;
    if (!state.error && calendar_blocked) {
      set_calendar_blocked(false);
      return;
    }
    if (calendar_blocked) return;
    const refresh_at = next_calendar_refresh_at(state.data.runtime);
    const timeout = window.setTimeout(() => {
      set_calendar_blocked(true);
      void workbenchDataResource.refresh().then(() => {
        const refreshed = workbenchDataResource.getSnapshot();
        set_calendar_blocked(Boolean(refreshed.error));
      });
    }, Math.max(0, refresh_at - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [calendar_blocked, state.data, state.error]);

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
    calendarBlocked: calendar_blocked,
    reload,
    revalidate,
  };
}

export function next_calendar_refresh_at(runtime: RuntimeMetadata): number {
  const tomorrow = add_calendar_days(runtime.calendarDate, 1);
  const day_after = add_calendar_days(tomorrow, 1);
  const next_day = range_from_dates(tomorrow, day_after, runtime.timeZone);
  return Date.parse(next_day.start) + 250;
}
