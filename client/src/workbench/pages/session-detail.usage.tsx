import { useEffect, useState } from 'react';
import type { AgentProvider, UsageSummary } from '@stash/shared';
import { isFullyPriced } from '@stash/shared';
import { getAgentSessionUsage } from '../../api/agent-sessions';
import { fmt, type WBSession } from '../data';
import { Tile } from '../shared';

/**
 * Measured usage for one session.
 *
 * #144 removed the fabricated dollar figures here and left activity estimates
 * behind; this replaces them with the session's own parsed token counts. The
 * cost carries the same treatment as every other spend surface: `≥ $x` when a
 * model in this session has no rate, and a named `no rate` marker so the gap
 * points at the model to fix rather than at a number to distrust.
 *
 * The activity estimate stays visible until real usage arrives, and comes back
 * if the read fails — a failed fetch must not look like a session that cost
 * nothing.
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
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUsage(null);
    setFailed(false);
    async function load() {
      try {
        const next = await getAgentSessionUsage(provider, sessionId);
        if (!cancelled) setUsage(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [provider, sessionId]);

  if (usage === null) {
    return (
      <div className="surface" data-testid="estimated-session-metrics" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
          <span className="prompt">&gt;</span> estimated from activity counts
          {failed && (
            <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--neon-orange)' }}>
              measured usage unavailable
            </span>
          )}
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
      <div className="surface" data-testid="measured-session-metrics" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
          <span className="prompt">&gt;</span> measured from session usage
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          no token usage recorded for this session · {fmt.dur(session.estimatedDuration)} estimated duration
        </div>
      </div>
    );
  }

  const fullyPriced = isFullyPriced(usage.pricing);
  const unpricedModels = usage.modelMix.filter((m) => m.cost === undefined);

  return (
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
  );
}
