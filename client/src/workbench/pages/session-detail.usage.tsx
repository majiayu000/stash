import { useEffect, useRef, useState } from 'react';
import type { AgentProvider, AgentSessionStatus, SessionUsageSummary } from '@stash/shared';
import { isFullyPriced } from '@stash/shared';
import { getAgentSessionUsage } from '../../api/agent-sessions';
import { fmt, type WBSession } from '../data';
import { LoadErrorPanel, Tile, toError } from '../shared';

const LIVE_USAGE_REFRESH_MS = 15_000;
const LIVE_SESSION_AGE_MS = 5 * 60_000;
const FAILED_REFRESH_MAX_AGE_MS = 30 * 60_000;
const MAX_FAILED_REFRESH_MS = 60_000;

function session_should_poll(
  status: AgentSessionStatus | undefined,
  last_active_at: string | null,
  refresh_failed: boolean,
): boolean {
  if (status === 'lost' || status === 'completed') return false;
  if (last_active_at === null) return false;
  const last_active_ms = Date.parse(last_active_at);
  if (!Number.isFinite(last_active_ms)) return false;
  const age_ms = Date.now() - last_active_ms;
  if (status === undefined) return age_ms < LIVE_SESSION_AGE_MS;
  if (refresh_failed) return age_ms < FAILED_REFRESH_MAX_AGE_MS;
  return status === 'running' || status === 'waiting' || status === 'idle';
}

/**
 * Measured usage for one session.
 *
 * #144 removed the fabricated dollar figures here and left activity estimates
 * behind; this replaces them with the session's own parsed token counts. The
 * cost carries the same treatment as every other spend surface: `≥ $x` when a
 * model in this session has no rate, and a named `no rate` marker so the gap
 * points at the model to fix rather than at a number to distrust.
 *
 * The activity estimate stays visible only while the first measured read is
 * pending. A failed read is explicit and retryable; a later refresh failure
 * preserves the last measured result while exposing the same retry path.
 */
export function SessionUsageMetrics({
  provider,
  sessionId,
  session,
}: {
  provider: AgentProvider;
  sessionId: string;
  session: WBSession;
}) {
  const usage_key = `${provider}:${sessionId}`;
  const [result, setResult] = useState<{
    key: string;
    usage: SessionUsageSummary | null;
    error: Error | null;
    loading: boolean;
  }>({ key: usage_key, usage: null, error: null, loading: false });
  const [retry_tick, setRetryTick] = useState(0);
  const last_activity_ref = useRef<{
    key: string;
    last_active_at: string | null;
    status: AgentSessionStatus;
  } | null>(null);
  const refresh_failures_ref = useRef({ key: usage_key, count: 0 });
  if (refresh_failures_ref.current.key !== usage_key) {
    refresh_failures_ref.current = { key: usage_key, count: 0 };
  }
  const request_sequence_ref = useRef(0);
  const active_request_ref = useRef<number | null>(null);
  const usage = result.key === usage_key ? result.usage : null;
  const error = result.key === usage_key ? result.error : null;
  const loading = result.key === usage_key && result.loading;

  function retry_usage() {
    if (active_request_ref.current === null) {
      setRetryTick((tick) => tick + 1);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let refresh_timer: number | undefined;
    async function load() {
      let refresh_failed = false;
      const request_id = request_sequence_ref.current + 1;
      request_sequence_ref.current = request_id;
      active_request_ref.current = request_id;
      setResult((current) => ({
        key: usage_key,
        usage: current.key === usage_key ? current.usage : null,
        error: current.key === usage_key ? current.error : null,
        loading: true,
      }));
      try {
        const next = await getAgentSessionUsage(provider, sessionId);
        if (!cancelled) {
          refresh_failures_ref.current = { key: usage_key, count: 0 };
          last_activity_ref.current = {
            key: usage_key,
            last_active_at: next.sessionLastActiveAt,
            status: next.sessionStatus,
          };
          setResult({ key: usage_key, usage: next, error: null, loading: false });
        }
      } catch (load_error) {
        if (!cancelled) {
          refresh_failed = true;
          refresh_failures_ref.current = {
            key: usage_key,
            count: refresh_failures_ref.current.count + 1,
          };
          setResult((current) => ({
            key: usage_key,
            usage: current.key === usage_key ? current.usage : null,
            error: toError(load_error),
            loading: false,
          }));
        }
      } finally {
        if (active_request_ref.current === request_id) {
          active_request_ref.current = null;
        }
        const last_activity = last_activity_ref.current;
        const should_poll = last_activity?.key === usage_key
          && session_should_poll(
            last_activity.status,
            last_activity.last_active_at,
            refresh_failed,
          );
        if (!cancelled && should_poll) {
          const failure_count = refresh_failures_ref.current.count;
          const refresh_delay = refresh_failed
            ? Math.min(
                LIVE_USAGE_REFRESH_MS * (2 ** Math.max(0, failure_count - 1)),
                MAX_FAILED_REFRESH_MS,
              )
            : LIVE_USAGE_REFRESH_MS;
          refresh_timer = window.setTimeout(() => {
            const latest_activity = last_activity_ref.current;
            if (latest_activity?.key === usage_key
              && session_should_poll(
                latest_activity.status,
                latest_activity.last_active_at,
                refresh_failed,
              )) {
              void load();
            }
          }, refresh_delay);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (refresh_timer !== undefined) window.clearTimeout(refresh_timer);
    };
  }, [provider, retry_tick, sessionId, usage_key]);

  if (usage === null && error) {
    return (
      <LoadErrorPanel
        title="measured session usage failed to load"
        endpoint={`/api/agent-sessions/${provider}/${sessionId}/usage`}
        error={error}
        onRetry={loading ? undefined : retry_usage}
        compact
      />
    );
  }

  if (usage === null) {
    return (
      <div className="surface" data-testid="estimated-session-metrics" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
          <span className="prompt">&gt;</span> estimated from activity counts
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Tile k="estimated tokens" v={fmt.k(session.estimatedTokens)} c="var(--neon-cyan)" />
          <Tile k="estimated duration" v={fmt.dur(session.estimatedDuration)} c="var(--neon-purple)" />
        </div>
      </div>
    );
  }

  // No usage records at all is a real answer — the session did no billable
  // work — and is not the same as usage that could not be priced.
  const has_recorded_usage = usage.totals.tokens > 0
    || usage.totals.cacheReadTokens > 0
    || usage.totals.cacheWriteTokens > 0;
  if (!has_recorded_usage) {
    return (
      <>
        <div className="surface" data-testid="measured-session-metrics" style={{ padding: '1rem' }}>
          <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
            <span className="prompt">&gt;</span> measured from session usage
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            no token usage recorded for this session · {fmt.dur(session.estimatedDuration)} estimated duration
          </div>
        </div>
        {error && <UsageRefreshError provider={provider} sessionId={sessionId} error={error} onRetry={loading ? undefined : retry_usage} />}
      </>
    );
  }

  const fullyPriced = isFullyPriced(usage.pricing);
  const unpricedModels = usage.modelMix.filter((m) => m.cost === undefined);
  const total_cost = format_session_cost(usage.totals.cost, fullyPriced);

  return (
    <>
      <div className="surface" data-testid="measured-session-metrics" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
          <span className="prompt">&gt;</span> measured from session usage
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Tile k="tokens" v={fmt.k(usage.totals.tokens)} c="var(--neon-cyan)" />
          <Tile
            k="cost"
            v={total_cost}
            c={fullyPriced ? 'var(--neon-green)' : 'var(--neon-orange)'}
          />
          <Tile k="input" v={fmt.k(usage.totals.inputTokens)} />
          <Tile k="output" v={fmt.k(usage.totals.outputTokens)} />
        </div>

        {(usage.totals.cacheReadTokens > 0 || usage.totals.cacheWriteTokens > 0) && (
          <div style={{ marginTop: '0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            cache read {fmt.k(usage.totals.cacheReadTokens)} · cache write {fmt.k(usage.totals.cacheWriteTokens)}
          </div>
        )}

        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {usage.modelMix.map((entry) => (
            <div key={entry.model} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
              <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{entry.model}</span>
              <span style={{ color: 'var(--text-muted)' }}>{fmt.k(entry.tokens)}</span>
              {entry.cost === undefined ? (
                <span style={{ color: 'var(--neon-orange)', fontWeight: 600 }} title="no rate configured for this model">no rate</span>
              ) : (
                <span style={{ color: 'var(--text-primary)' }}>{format_known_cost(entry.cost)}</span>
              )}
            </div>
          ))}
        </div>

        {!fullyPriced && (
          <div style={{ marginTop: '0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--neon-orange)', lineHeight: 1.5 }}>
            {fmt.k(usage.pricing.unpricedTokens)} tokens excluded from cost — no rate for {unpricedModels.map((m) => m.model).join(', ')}. Add one in Settings → model rates.
          </div>
        )}
      </div>
      {error && <UsageRefreshError provider={provider} sessionId={sessionId} error={error} onRetry={loading ? undefined : retry_usage} />}
    </>
  );
}

function format_known_cost(cost: number): string {
  return cost > 0 && cost < 0.01 ? '< $0.01' : `$${cost.toFixed(2)}`;
}

function format_session_cost(cost: number, fully_priced: boolean): string {
  if (fully_priced) return format_known_cost(cost);
  if (cost === 0) return 'unpriced';
  if (cost < 0.01) {
    if (cost < 0.00000001) return `≥ $${floor_scientific(cost, 2)}`;
    const decimals = Math.min(8, Math.max(3, Math.ceil(-Math.log10(cost)) + 1));
    return `≥ $${floor_fixed(cost, decimals)}`;
  }
  return `≥ $${floor_fixed(cost, 2)}`;
}

function floor_fixed(value: number, decimals: number): string {
  const scale = 10 ** decimals;
  let units = Math.floor(value * scale);
  if (units / scale > value) units--;
  return (units / scale).toFixed(decimals);
}

function floor_scientific(value: number, decimals: number): string {
  const [raw_mantissa, raw_exponent] = value.toExponential(15).split('e');
  const scale = 10 ** decimals;
  const exponent = Number(raw_exponent);
  let units = Math.floor(Number(raw_mantissa) * scale);
  let mantissa = units / scale;
  if (Number(`${mantissa}e${exponent}`) > value) {
    units--;
    mantissa = units / scale;
  }
  return `${mantissa.toFixed(decimals)}e${exponent}`;
}

function UsageRefreshError({
  provider,
  sessionId,
  error,
  onRetry,
}: {
  provider: AgentProvider;
  sessionId: string;
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <LoadErrorPanel
      title="measured session usage refresh failed"
      endpoint={`/api/agent-sessions/${provider}/${sessionId}/usage`}
      error={error}
      onRetry={onRetry}
      compact
    />
  );
}
