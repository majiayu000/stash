import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { add_calendar_days, range_from_dates, type WorkItem } from '@stash/shared';
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

async function loadReviewWorkbenchData(): Promise<AdaptInput> {
  const [runtime, items, areas] = await Promise.all([
    getRuntimeMetadata(),
    listWorkItems({ includeDropped: false }),
    listAreas(),
  ]);
  return {
    runtime,
    items,
    sessions: [],
    sourceErrors: [],
    workboardProjects: workboardProjectsFromItems(items),
    areas,
    sessionDataState: 'loading',
  };
}

const workbenchDataResource = new SharedRefreshResource(loadWorkbenchData, {
  freshnessMs: WORKBENCH_FRESHNESS_MS,
});
const reviewWorkbenchDataResource = new SharedRefreshResource(loadReviewWorkbenchData, {
  freshnessMs: WORKBENCH_FRESHNESS_MS,
});

export function invalidateWorkbenchData(): void {
  workbenchDataResource.invalidate();
  reviewWorkbenchDataResource.invalidate();
}

/**
 * One-stop hook used by every workbench page: fetches the primary sources in
 * parallel, reshapes them into workbench-style `{projects, todos, sessions, stats}`.
 * Hook returns `{ data, loading, error, reload }`.
 */
export function useWorkbenchData(mode: 'full' | 'review_core' = 'full'): {
  data: WBData | undefined;
  loading: boolean;
  error: Error | undefined;
  calendarBlocked: boolean;
  reload: () => void;
  revalidate: () => void;
} {
  const resource = mode === 'review_core'
    ? reviewWorkbenchDataResource
    : workbenchDataResource;
  const [calendar_blocked, set_calendar_blocked] = useState(false);
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );

  useEffect(() => {
    void resource.revalidate();
  }, [resource]);

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
      void resource.refresh().then(() => {
        const refreshed = resource.getSnapshot();
        set_calendar_blocked(Boolean(refreshed.error));
      });
    }, Math.max(0, refresh_at - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [calendar_blocked, resource, state.data, state.error]);

  const data = useMemo(() => {
    if (!state.data) return undefined;
    return adaptToWorkbenchData(state.data);
  }, [state.data]);
  const reload = useCallback(() => {
    void resource.refresh();
  }, [resource]);
  const revalidate = useCallback(() => {
    void resource.revalidate();
  }, [resource]);

  return {
    data,
    loading: state.loading,
    error: state.error,
    calendarBlocked: calendar_blocked,
    reload,
    revalidate,
  };
}

export function workboardProjectsFromItems(items: readonly WorkItem[]): AdaptInput['workboardProjects'] {
  const projects = new Map<string, AdaptInput['workboardProjects'][number]>();
  for (const item of items) {
    if (!item.projectId) continue;
    const project = projects.get(item.projectId) ?? {
      projectId: item.projectId,
      itemCount: 0,
      activeCount: 0,
      blockedCount: 0,
      items: [],
      sessions: [],
    };
    project.itemCount += 1;
    if (item.status === 'active') project.activeCount += 1;
    if (item.status === 'blocked') project.blockedCount += 1;
    project.items.push(item);
    projects.set(item.projectId, project);
  }
  return Array.from(projects.values()).sort((a, b) => b.itemCount - a.itemCount);
}

export function next_calendar_refresh_at(runtime: RuntimeMetadata): number {
  const tomorrow = add_calendar_days(runtime.calendarDate, 1);
  const day_after = add_calendar_days(tomorrow, 1);
  const next_day = range_from_dates(tomorrow, day_after, runtime.timeZone);
  return Date.parse(next_day.start) + 250;
}
