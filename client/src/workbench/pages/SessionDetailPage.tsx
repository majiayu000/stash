import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  AgentProvider,
  AgentSessionEvent,
  AgentSessionEventSummary,
} from '@stash/shared';
import { getAgentSession, getAgentSessionEvents } from '../../api/agent-sessions';
import { ApiError } from '../../api/client';
import { LiveDot } from '../../components/effects';
import {
  fmt,
  sessionPath,
  toWorkbenchSession,
  type WBData,
  type WBSession,
} from '../data';
import { LoadErrorPanel, ModelBadge, TodoItem, ToolBadge, Topbar, toError } from '../shared';
import { sessionDetailStyles } from './session-detail.styles';
import { FilesTouched, ToolCallSummary } from './session-detail.summary';
import { EmptyTranscript, RealTranscript } from './session-detail.transcript';
import { SessionUsageMetrics } from './session-detail.usage';

/**
 * Session detail.
 * Header: project crumb + actions.
 * Left:   transcript (turns + tool calls + diffs).
 * Right:  estimated activity metrics · tool-call summary · files touched · related todos · actions.
 *
 * Backend coverage:
 *   - session metadata: real (WBSession from workbench data adapter)
 *   - related todos:    real (filter by project)
 *   - transcript turns + tool calls + diffs: real agent session events API
 */
export function SessionDetailPage({ data }: { data: WBData; reload: () => void }) {
  const { projects, todos } = data;
  const { provider: providerParam, sessionId } = useParams<{
    provider?: string;
    sessionId?: string;
  }>();
  const navigate = useNavigate();
  const provider = isAgentProvider(providerParam) ? providerParam : undefined;
  const legacyRoute = providerParam === undefined;
  const [session, setSession] = useState<WBSession | null>(null);
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionNotFound, setSessionNotFound] = useState(false);
  const [legacyChoices, setLegacyChoices] = useState<WBSession[]>([]);
  const [sessionRetryTick, setSessionRetryTick] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setSessionLoading(false);
      setSessionNotFound(true);
      return;
    }
    let cancelled = false;
    setSession(null);
    setSessionError(null);
    setSessionNotFound(false);
    setLegacyChoices([]);
    setSessionLoading(true);

    const resolve = async () => {
      if (!legacyRoute) {
        if (!provider) throw new Error(`unsupported session provider: ${providerParam}`);
        return [toWorkbenchSession(await getAgentSession(provider, sessionId))];
      }
      const results = await Promise.allSettled(
        (['claude', 'codex'] as const).map((candidate) => getAgentSession(candidate, sessionId)),
      );
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason)
        .filter((error) => !(error instanceof ApiError && error.status === 404));
      if (failures.length > 0) throw failures[0];
      return results
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getAgentSession>>> =>
          result.status === 'fulfilled')
        .map((result) => toWorkbenchSession(result.value));
    };

    resolve()
      .then((matches) => {
        if (cancelled) return;
        if (legacyRoute && matches.length === 1) {
          navigate(sessionPath(matches[0]!), { replace: true });
          return;
        }
        if (matches.length === 1) setSession(matches[0]!);
        else if (matches.length > 1) setLegacyChoices(matches);
        else setSessionNotFound(true);
        setSessionLoading(false);
      })
      .catch((error) => {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 404) setSessionNotFound(true);
          else setSessionError(toError(error));
          setSessionLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [legacyRoute, navigate, provider, providerParam, sessionId, sessionRetryTick]);

  // SPEC v0.3 §9d — real session events from /api/agent-sessions/:provider/:id/events.
  const [events, setEvents] = useState<AgentSessionEvent[] | null>(null);
  const [eventSummary, setEventSummary] = useState<AgentSessionEventSummary | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<Error | null>(null);
  const [nextPageError, setNextPageError] = useState<Error | null>(null);
  const [loadingNextPage, setLoadingNextPage] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setEvents(null);
    setEventSummary(null);
    setNextCursor(null);
    setEventsError(null);
    setNextPageError(null);
    getAgentSessionEvents(session.provider, session.id)
      .then((res) => {
        if (!cancelled) {
          setEvents(res.data);
          setEventSummary(res.summary);
          setNextCursor(res.page.nextCursor);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setEventsError(toError(error));
          setEvents([]);
        }
      });
    return () => { cancelled = true; };
  }, [session?.id, session?.provider, retryTick]);

  if (sessionLoading || sessionError || sessionNotFound || legacyChoices.length > 0 || !session) {
    return (
      <SessionResolutionPanel
        loading={sessionLoading}
        error={sessionError}
        notFound={sessionNotFound}
        choices={legacyChoices}
        onRetry={() => setSessionRetryTick((value) => value + 1)}
        onChoose={(choice) => navigate(sessionPath(choice), { replace: true })}
      />
    );
  }

  const loadNextPage = () => {
    if (!nextCursor || loadingNextPage) return;
    setLoadingNextPage(true);
    setNextPageError(null);
    getAgentSessionEvents(session.provider, session.id, nextCursor)
      .then((page) => {
        setEvents((current) => [...(current ?? []), ...page.data]);
        setEventSummary(page.summary);
        setNextCursor(page.page.nextCursor);
      })
      .catch((error) => setNextPageError(toError(error)))
      .finally(() => setLoadingNextPage(false));
  };

  const project = projects.find((p) => p.id === session.project);
  const relatedTodos = todos.filter((t) => t.project === session.project).slice(0, 3);

  return (
    <div className="dashboard-canvas">
      <div className="inner session-detail-inner">
        <Topbar data={data} />

        {/* Session header */}
        <div className="sd-head">
          <div className="sd-crumb">
            <button className="sd-crumb-link" type="button" onClick={() => navigate('/sessions')}>sessions</button>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>&nbsp;/&nbsp;</span>
            <button className="sd-crumb-link" type="button" onClick={() => project && navigate(`/projects/${encodeURIComponent(project.id)}`)} disabled={!project}>{project?.emoji} {project?.name ?? session.project}</button>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>&nbsp;/&nbsp;</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>{session.id.slice(0, 8)}</span>
          </div>
          <div className="sd-header-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.45rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 18px rgba(0,255,242,0.4)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                {session.title || '(untitled session)'}
              </h2>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <span className={`sess-state ${session.state}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4, color: session.state === 'live' ? 'var(--neon-green)' : 'var(--text-muted)', background: session.state === 'live' ? 'rgba(48,209,88,0.12)' : 'var(--bg-elevated)' }}>
                  {session.state === 'live' && <LiveDot color="var(--neon-green)" />} {session.state}
                </span>
                <ToolBadge tool={session.tool} />
                <ModelBadge model={session.model} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {fmt.ago(session.at)} · {fmt.dur(session.estimatedDuration)} estimated duration
                </span>
              </div>
            </div>
            <div className="sd-header-actions">
              <button className="sd-action" type="button" onClick={() => project && navigate(`/projects/${encodeURIComponent(project.id)}`)} disabled={!project}>project</button>
              <button className="sd-action" type="button" onClick={() => navigate('/review/usage')}>analytics</button>
              <button className="sd-action" type="button" onClick={() => relatedTodos[0] && navigate(`/sessions/new?todoId=${encodeURIComponent(relatedTodos[0].id)}`)} disabled={!relatedTodos[0]}>run again</button>
              <button className="sd-action" type="button" onClick={() => navigate('/review')}>review</button>
            </div>
          </div>
        </div>

        {/* Body: transcript + side */}
        <div className="sd-layout" data-testid="session-detail-layout">
          {/* TRANSCRIPT */}
          <div className="transcript" style={{ minWidth: 0, overflowY: 'auto' }}>
            {eventsError ? (
              <LoadErrorPanel
                title="session events failed to load"
                endpoint={`/api/agent-sessions/${session.provider}/${session.id}/events`}
                error={eventsError}
                onRetry={() => setRetryTick((t) => t + 1)}
                compact
              />
            ) : events === null ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)', padding: '1rem' }}>loading events…</div>
            ) : events.length === 0 ? (
              <EmptyTranscript />
            ) : (
              <>
                <RealTranscript events={events} session={session} />
                {nextCursor && (
                  <button className="sd-side-btn" type="button" onClick={loadNextPage} disabled={loadingNextPage}>
                    {loadingNextPage ? 'loading more…' : 'load more transcript'}
                  </button>
                )}
                {nextPageError && (
                  <LoadErrorPanel title="next transcript page failed to load" endpoint={`/api/agent-sessions/${session.provider}/${session.id}/events`} error={nextPageError} onRetry={loadNextPage} compact />
                )}
              </>
            )}
          </div>

          {/* SIDE */}
          <div className="sd-sidebar">
            <SessionUsageMetrics
              provider={session.provider}
              sessionId={session.id}
              session={session}
            />

            <ToolCallSummary summary={eventSummary} />
            <FilesTouched summary={eventSummary} />

            <div className="surface" style={{ padding: '1rem' }}>
              <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
                <span className="prompt">&gt;</span> related todos
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {relatedTodos.length === 0
                  ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(none)</div>
                  : relatedTodos.map((t) => (
                    <TodoItem
                      key={t.id}
                      t={t}
                      projects={projects}
                      calendarDate={data.runtime.calendarDate}
                    />
                  ))}
              </div>
            </div>

            <div className="surface" style={{ padding: '1rem' }}>
              <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
                <span className="prompt">&gt;</span> actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="sd-side-btn" type="button" onClick={() => project && navigate(`/projects/${encodeURIComponent(project.id)}`)} disabled={!project}>open project</button>
                <button className="sd-side-btn" type="button" onClick={() => navigate('/review/usage')}>open analytics</button>
                <button className="sd-side-btn" type="button" onClick={() => relatedTodos[0] && navigate(`/todos/${encodeURIComponent(relatedTodos[0].id)}`)} disabled={!relatedTodos[0]}>open related todo</button>
                <button className="sd-side-btn" type="button" onClick={() => navigate('/review')}>open weekly review</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{sessionDetailStyles}</style>
    </div>
  );
}

function isAgentProvider(value: string | undefined): value is AgentProvider {
  return value === 'claude' || value === 'codex';
}

function SessionResolutionPanel({
  loading,
  error,
  notFound,
  choices,
  onRetry,
  onChoose,
}: {
  loading: boolean;
  error: Error | null;
  notFound: boolean;
  choices: WBSession[];
  onRetry: () => void;
  onChoose: (choice: WBSession) => void;
}) {
  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {loading && 'loading exact session…'}
          {error && <LoadErrorPanel title="session failed to load" endpoint="/api/agent-sessions/:provider/:id" error={error} onRetry={onRetry} compact />}
          {notFound && 'Session not found in Claude or Codex history.'}
          {choices.length > 0 && (
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>This ID exists in multiple providers.</strong>
              {choices.map((choice) => (
                <button key={choice.provider} type="button" className="sd-side-btn" onClick={() => onChoose(choice)}>
                  Open {choice.provider}: {choice.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
