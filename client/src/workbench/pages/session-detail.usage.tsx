import { useEffect, useState } from 'react';
import type { AgentProvider, SessionUsageSummary } from '@stash/shared';
import { isFullyPriced } from '@stash/shared';
import { getAgentSessionUsage } from '../../api/agent-sessions';
import { fmt, type WBSession } from '../data';
import { LoadErrorPanel, Tile, toError } from '../shared';

const LIVE_USAGE_REFRESH_MS = 15_000;
const LIVE_SESSION_AGE_MS = 5 * 60_000;

function session_is_live(last_active_at: string | null): boolean {
  if (last_active_at === null) return false;
  const last_active_ms = Date.parse(last_active_at);
  return Number.isFinite(last_active_ms) && Date.now() - last_active_ms < LIVE_SESSION_AGE_MS;
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
  }>({ key: usage_key, usage: null, error: null });
  const [retry_tick, setRetryTick] = useState(0);
  const usage = result.key === usage_key ? result.usage : null;
  const error = result.key === usage_key ? result.error : null;

  useEffect(() => {
    let cancelled = false;
    let refresh_timer: number | undefined;
    async function load() {
      let continue_refresh = false;
      try {
        const next = await getAgentSessionUsage(provider, sessionId);
        if (!cancelled) {
          setResult({ key: usage_key, usage: next, error: null });
          continue_refresh = session_is_live(next.sessionLastActiveAt);
        }
      } catch (load_error) {
        if (!cancelled) {
          setResult((current) => ({
            key: usage_key,
            usage: current.key === usage_key ? current.usage : null,
            error: toError(load_error),
          }));
        }
      } finally {
        if (!cancelled && continue_refresh) {
          refresh_timer = window.setTimeout(load, LIVE_USAGE_REFRESH_MS);
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
        onRetry={() => setRetryTick((tick) => tick + 1)}
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
  if (usage.totals.tokens === 0) {
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
        {error && <UsageRefreshError provider={provider} sessionId={sessionId} error={error} onRetry={() => setRetryTick((tick) => tick + 1)} />}
      </>
    );
  }

  const fullyPriced = isFullyPriced(usage.pricing);
  const unpricedModels = usage.modelMix.filter((m) => m.cost === undefined);

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
            v={(fullyPriced ? '$' : '≥ $') + usage.totals.cost.toFixed(2)}
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
                <span style={{ color: 'var(--text-primary)' }}>${entry.cost.toFixed(2)}</span>
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
      {error && <UsageRefreshError provider={provider} sessionId={sessionId} error={error} onRetry={() => setRetryTick((tick) => tick + 1)} />}
    </>
  );
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
  onRetry: () => void;
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
