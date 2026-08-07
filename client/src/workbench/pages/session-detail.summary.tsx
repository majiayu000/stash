import type { AgentSessionEventSummary } from '@stash/shared';

/** Aggregate views over a session's events: tool-call counts and files touched. */

export function ToolCallSummary({ summary }: { summary: AgentSessionEventSummary | null }) {
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

export function FilesTouched({ summary }: { summary: AgentSessionEventSummary | null }) {
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
