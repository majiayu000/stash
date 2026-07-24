import { useEffect, useMemo, useState } from 'react';
import { listAgentSessions } from '../../api/agent-sessions';
import {
  toWorkbenchSession,
  type WBData,
  type WBProject,
  type WBSession,
} from '../data';
import { SessionRow, toError } from '../shared';

export interface WeeklyReviewSessionState {
  displayData: WBData;
  error: string | null;
  sessions: WBSession[];
  status: 'loading' | 'ready' | 'error';
  retry: () => void;
}

export function useWeeklyReviewSessions(data: WBData): WeeklyReviewSessionState {
  const [sessions, set_sessions] = useState<WBSession[]>(data.sessions);
  const [status, set_status] = useState<'loading' | 'ready' | 'error'>(
    data.sessionDataState ?? 'ready',
  );
  const [error, set_error] = useState<string | null>(null);
  const [retry_tick, set_retry_tick] = useState(0);

  useEffect(() => {
    if (data.sessionDataState !== 'loading') {
      set_sessions(data.sessions);
      set_status(data.sessionDataState ?? 'ready');
      return;
    }

    let cancelled = false;
    set_status('loading');
    set_error(null);
    listAgentSessions('all')
      .then((scan) => {
        if (cancelled) return;
        set_sessions(
          scan.sessions
            .map(toWorkbenchSession)
            .sort((a, b) => b.at - a.at),
        );
        if (scan.errors.length > 0) {
          const first = scan.errors[0]!;
          set_error(
            `${scan.errors.length} session source error${scan.errors.length === 1 ? '' : 's'}: `
            + `${first.provider}:${first.sourcePath}: ${first.message}`,
          );
          set_status('error');
        } else {
          set_status('ready');
        }
      })
      .catch((load_error: unknown) => {
        if (cancelled) return;
        set_error(toError(load_error).message);
        set_status('error');
      });
    return () => { cancelled = true; };
  }, [data.sessionDataState, data.sessions, retry_tick]);

  const displayData = useMemo(
    () => withSessions(data, sessions, status),
    [data, sessions, status],
  );

  return {
    displayData,
    error,
    sessions,
    status,
    retry: () => set_retry_tick((tick) => tick + 1),
  };
}

export function WeeklyReviewSessions({
  projects,
  state,
}: {
  projects: WBProject[];
  state: WeeklyReviewSessionState;
}) {
  const visible_sessions = state.sessions.filter((session) => session.state !== 'error').slice(0, 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto' }}>
      {state.status === 'loading' ? (
        <div role="status" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          loading sessions…
        </div>
      ) : null}
      {state.error ? (
        <div role="alert" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--neon-orange)' }}>
          <span>{state.error}</span>{' '}
          <button type="button" onClick={state.retry}>retry sessions</button>
        </div>
      ) : null}
      {state.status === 'ready' && visible_sessions.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          (no sessions this week)
        </div>
      ) : visible_sessions.map((session) => (
        <SessionRow
          key={`${session.provider}:${session.id}`}
          s={session}
          projects={projects}
          compact
        />
      ))}
    </div>
  );
}

function withSessions(
  data: WBData,
  sessions: readonly WBSession[],
  status: WeeklyReviewSessionState['status'],
): WBData {
  return {
    ...data,
    sessions: [...sessions],
    sessionDataState: status,
    stats: {
      ...data.stats,
      activeSessions: sessions.filter((session) => session.state === 'live').length,
      totalEstimatedTokens: sessions.reduce(
        (total, session) => total + session.estimatedTokens,
        0,
      ),
      totalEstimatedCost: sessions.reduce(
        (total, session) => total + session.estimatedCost,
        0,
      ),
    },
  };
}
