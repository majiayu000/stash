import { useEffect, useState, type ReactNode } from 'react';
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
import { LoadErrorPanel, ModelBadge, Tile, TodoItem, ToolBadge, Topbar, toError } from '../shared';

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
            <EstimatedSessionMetrics session={session} />

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

export function EmptyTranscript() {
  return (
    <div
      className="surface"
      data-testid="empty-session-events"
      style={{ padding: '1.25rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
    >
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>no recorded session events</div>
      <div style={{ marginTop: 6, fontSize: '0.74rem', lineHeight: 1.5 }}>
        This session has no real events available to display.
      </div>
    </div>
  );
}

export function EstimatedSessionMetrics({ session }: { session: WBSession }) {
  return (
    <div className="surface" data-testid="estimated-session-metrics" style={{ padding: '1rem' }}>
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> estimated from activity counts
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <Tile k="estimated tokens" v={fmt.k(session.estimatedTokens)} c="var(--neon-cyan)" />
        <Tile k="estimated cost" v={'$' + session.estimatedCost.toFixed(2)} c="var(--neon-orange)" />
        <Tile k="estimated duration" v={fmt.dur(session.estimatedDuration)} c="var(--neon-purple)" />
      </div>
    </div>
  );
}

function Turn({ kind, who, at, children, pending }: { kind: 'user' | 'assistant' | 'thinking' | 'tool'; who?: string; at: string; children?: ReactNode; pending?: boolean }) {
  const ico = kind === 'user' ? '$' : kind === 'assistant' ? '>' : kind === 'thinking' ? '∿' : '·';
  const color = kind === 'user' ? 'var(--neon-green)' : kind === 'assistant' ? 'var(--neon-cyan)' : kind === 'thinking' ? 'var(--neon-purple)' : 'var(--text-muted)';
  return (
    <div className={`td-turn ${kind} ${pending ? 'pending' : ''}`}>
      <div className="td-turn-icon" style={{ color }}>{ico}</div>
      <div className="td-turn-body">
        <div className="td-turn-meta">
          <span style={{ color, fontWeight: 600 }}>{kind === 'thinking' ? 'thinking' : (who || (kind === 'assistant' ? 'agent' : 'agent'))}</span>
          <span style={{ color: 'var(--text-muted)' }}>· {at}</span>
        </div>
        <div className="td-turn-content">{children}</div>
      </div>
    </div>
  );
}

function ToolCall({ name, args, status, lines, plus, minus, collapsed, children }: {
  name: string; args: string; status: 'ok' | 'warn' | 'error';
  lines?: number; plus?: number; minus?: number; collapsed?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsed);
  const statusColor = status === 'ok' ? 'var(--neon-green)' : status === 'warn' ? 'var(--neon-orange)' : 'var(--neon-pink)';
  const statusGlyph = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✕';
  return (
    <div className={`td-tool ${open ? 'open' : ''}`}>
      <button className="td-tool-head" onClick={() => setOpen(!open)} type="button" aria-expanded={open}>
        <span className="td-tool-chevron">{open ? '▾' : '▸'}</span>
        <span className="td-tool-name">tool_call</span>
        <span className="td-tool-fn">{name}</span>
        <span className="td-tool-arg">{args}</span>
        <span className="td-tool-status" style={{ color: statusColor }}>{statusGlyph} {status}</span>
        {plus != null && <span style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>+{plus}</span>}
        {minus != null && <span style={{ color: 'var(--neon-pink)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>−{minus}</span>}
        {lines != null && <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{lines} lines</span>}
      </button>
      {open && children && <div className="td-tool-body">{children}</div>}
    </div>
  );
}

/**
 * Real transcript renderer over /events. Maps AgentSessionEvent → existing
 * Turn / ToolCall layout so the design stays intact.
 */
export function RealTranscript({ events, session }: { events: AgentSessionEvent[]; session: WBSession }) {
  const pairedOutputIndexes = findPairedToolOutputIndexes(events);
  return (
    <>
      {events.map((e, i) => {
        if (e.kind === 'tool_call') {
          const argPreview = e.meta ? truncateArgs(e.meta) : '';
          const output = findPairedToolOutput(events, i)?.event;
          const details = formatToolCallDetails(e, output);
          return (
            <ToolCall key={i} name={e.tool ?? e.text} args={argPreview} status="ok" collapsed={Boolean(details)}>
              {details ? <pre className="td-code">{details}</pre> : null}
            </ToolCall>
          );
        }
        if (e.kind === 'tool_output' && pairedOutputIndexes.has(i)) {
          return null;
        }
        const who = e.kind === 'user' ? 'you' : e.kind === 'assistant' ? 'agent' : e.kind;
        const kind: 'user' | 'assistant' | 'thinking' | 'tool' =
          e.kind === 'user' ? 'user' :
            e.kind === 'assistant' ? 'assistant' :
              e.kind === 'plan' ? 'thinking' : 'tool';
        return (
          <Turn key={i} kind={kind} who={who} at={fmt.ago(new Date(e.timestamp).getTime())}>
            {e.text}
            {e.truncated && <div style={{ color: 'var(--neon-orange)' }}>[event truncated to the transcript response limit]</div>}
          </Turn>
        );
      })}
      {session.state === 'live' && (
        <Turn kind="assistant" at="now" pending>
          <p>streaming…<span className="td-cursor">▎</span></p>
        </Turn>
      )}
    </>
  );
}

function findPairedToolOutputIndexes(events: AgentSessionEvent[]): Set<number> {
  const indexes = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event?.kind !== 'tool_call') continue;
    const output = findPairedToolOutput(events, i);
    if (output) indexes.add(output.index);
  }
  return indexes;
}

function findPairedToolOutput(events: AgentSessionEvent[], toolCallIndex: number): { event: AgentSessionEvent; index: number } | undefined {
  const call = events[toolCallIndex];
  if (!call || call.kind !== 'tool_call') return undefined;

  if (call.callId) {
    for (let i = toolCallIndex + 1; i < events.length; i++) {
      const candidate = events[i];
      if (candidate?.kind === 'tool_output' && candidate.callId === call.callId) {
        return { event: candidate, index: i };
      }
    }
    return undefined;
  }

  for (let i = toolCallIndex + 1; i < events.length; i++) {
    const candidate = events[i];
    if (!candidate) continue;
    if (candidate.kind === 'tool_call') return undefined;
    if (candidate.kind !== 'tool_output') continue;
    if (!candidate.callId) {
      return { event: candidate, index: i };
    }
  }
  return undefined;
}

export function formatToolCallDetails(call: AgentSessionEvent, output?: AgentSessionEvent): string {
  const sections: string[] = [];
  if (call.meta && Object.keys(call.meta).length > 0) {
    sections.push(`Arguments:\n${stringifyToolValue(call.meta)}`);
  }
  if (output?.text) {
    sections.push(`Output:\n${output.text.trimEnd()}`);
  }
  if (call.truncated || output?.truncated) sections.push('[event truncated to the transcript response limit]');
  return sections.join('\n\n');
}

function stringifyToolValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateArgs(meta: Record<string, unknown> | undefined): string {
  if (!meta) return '';
  try {
    const s = JSON.stringify(meta);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  } catch { return ''; }
}

function ToolCallSummary({ summary }: { summary: AgentSessionEventSummary | null }) {
  const rows = (summary?.toolCalls ?? [])
    .slice(0, 8)
    .map(({ name, count }, i) => ({ name, count, color: TOOL_COLOR[i % TOOL_COLOR.length]! }));
  return (
    <div className="surface" style={{ padding: '1rem' }}>
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> tool calls <span className="count">— {summary?.totalToolCalls ?? 0}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none recorded yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((t) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
              <span style={{ color: t.color }}>●</span>
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>{t.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>×{t.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TOOL_COLOR = [
  'var(--neon-cyan)', 'var(--neon-purple)', 'var(--neon-orange)',
  'var(--neon-green)', 'var(--neon-pink)', 'var(--text-secondary)',
];

function FilesTouched({ summary }: { summary: AgentSessionEventSummary | null }) {
  const rows = (summary?.filesTouched ?? []).slice(0, 12);
  return (
    <div className="surface" style={{ padding: '1rem' }}>
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> files touched <span className="count">— {summary?.totalFiles ?? 0}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(({ path, count }) => (
            <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
              <span style={{ color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{path}</span>
              <span style={{ color: 'var(--text-muted)' }}>×{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const sessionDetailStyles = `
.session-detail-inner { overflow: hidden; height: 100%; }
.sd-head {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
}
.sd-crumb { display: flex; align-items: center; }
.sd-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-top: 0.4rem;
}
.sd-header-actions { display: flex; gap: 0.4rem; }
.sd-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 1.25rem;
  flex: 1;
  min-height: 0;
}
.sd-sidebar {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  overflow-y: auto;
}
.sd-crumb-link {
  background: transparent;
  border: 0;
  color: var(--neon-cyan);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 0;
}
.sd-crumb-link:disabled {
  cursor: default;
  color: var(--text-muted);
}
.sd-action {
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  white-space: nowrap;
}
.sd-action:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
.sd-action.danger:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.sd-action:disabled,
.sd-side-btn:disabled {
  cursor: default;
  opacity: 0.45;
}
.sd-action:disabled:hover,
.sd-side-btn:disabled:hover {
  border-color: var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-glass);
}
.sd-side-btn {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  color: var(--text-secondary);
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  text-align: left;
}
.sd-side-btn:hover { border-color: var(--border-glow); color: var(--neon-cyan); background: rgba(0,255,242,0.04); }

.transcript {
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  box-shadow: inset 0 0 30px rgba(0,255,242,0.03);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.65;
  display: flex; flex-direction: column; gap: 0.85rem;
}

@media (max-width: 980px) {
  .session-detail-inner {
    height: auto;
    overflow: visible;
  }
  .sd-layout { grid-template-columns: minmax(0, 1fr); }
  .transcript,
  .sd-sidebar { overflow-y: visible !important; }
}

@media (max-width: 720px) {
  .sd-header-row { flex-direction: column; }
  .sd-header-actions { flex-wrap: wrap; }
  .sd-crumb { overflow-x: auto; }
  .transcript { padding: 0.8rem; }
}

.td-turn {
  display: grid; grid-template-columns: 24px 1fr; gap: 0.6rem;
  padding: 0.55rem 0;
  border-left: 2px solid transparent;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
}
.td-turn.thinking { opacity: 0.7; }
.td-turn.thinking .td-turn-body { font-style: italic; color: var(--text-secondary); }
.td-turn.pending { border-left-color: var(--neon-cyan); background: rgba(0,255,242,0.03); }
.td-turn-icon {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.95rem;
  padding-top: 1px;
}
.td-turn-meta {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  margin-bottom: 4px;
  text-transform: lowercase;
}
.td-turn-content { color: var(--text-secondary); }
.td-turn-content p { margin: 0; margin-bottom: 0.4rem; font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; }
.td-turn-content p:last-child { margin-bottom: 0; }
.td-turn-content code {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.8rem;
}
.td-cursor {
  display: inline-block;
  color: var(--neon-cyan);
  animation: blink 1s steps(1) infinite;
}

.td-code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-cyan);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.85rem;
  margin: 0.4rem 0;
  color: var(--neon-green);
  overflow-x: auto;
  white-space: pre;
  line-height: 1.55;
}

.td-tool {
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(191,90,242,0.03);
  overflow: hidden;
}
.td-tool.open { border-color: rgba(191,90,242,0.25); }
.td-tool-head {
  width: 100%;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
}
.td-tool-head:hover { background: rgba(191,90,242,0.05); }
.td-tool-chevron { color: var(--text-muted); font-size: 0.7rem; }
.td-tool-name { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.62rem; }
.td-tool-fn { color: var(--neon-purple); font-weight: 600; }
.td-tool-arg {
  color: var(--text-primary);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.td-tool-status { margin-left: auto; font-weight: 600; white-space: nowrap; }
.td-tool-body { padding: 0 0.75rem 0.75rem; }

.td-diff {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.td-diff-line { display: grid; grid-template-columns: 18px 38px 1fr; padding: 1px 0; }
.td-diff-line.add { background: rgba(48,209,88,0.07); }
.td-diff-line.rem { background: rgba(255,55,95,0.07); }
.td-diff-gutter { text-align: center; font-weight: 700; }
.td-diff-line.add .td-diff-gutter { color: var(--neon-green); }
.td-diff-line.rem .td-diff-gutter { color: var(--neon-pink); }
.td-diff-line.ctx .td-diff-gutter { color: var(--text-muted); }
.td-diff-n { color: var(--text-muted); text-align: right; padding-right: 8px; }
.td-diff-txt { white-space: pre; color: var(--text-primary); }
.td-diff-line.ctx .td-diff-txt { color: var(--text-secondary); }
`;
