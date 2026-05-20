import type { SourceHealthError } from '../api/agent-sessions';

interface SourceHealthBannerProps {
  errors: SourceHealthError[];
  onRetry: () => void;
}

export function SourceHealthBanner({ errors, onRetry }: SourceHealthBannerProps) {
  if (errors.length === 0) return null;

  const visible = errors.slice(0, 3);
  const remaining = errors.length - visible.length;

  return (
    <section className="source-health-banner" role="alert" data-testid="source-health">
      <div>
        <div className="source-health-title">Agent source scan issue</div>
        <div className="source-health-copy">
          {errors.length} source {errors.length === 1 ? 'path needs' : 'paths need'} attention.
        </div>
        <ul>
          {visible.map((err) => (
            <li key={`${err.provider}:${err.sourcePath}:${err.message}`}>
              <strong>{err.provider}</strong>
              <span>{err.sourcePath}</span>
              <em>{err.message}</em>
            </li>
          ))}
        </ul>
        {remaining > 0 && <div className="source-health-more">+{remaining} more</div>}
      </div>
      <button type="button" onClick={onRetry}>Retry</button>
      <style>{`
        .source-health-banner {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin: 0 0 12px;
          padding: 12px 14px;
          border: 1px solid color-mix(in srgb, var(--neon-pink), transparent 48%);
          border-radius: 8px;
          background: color-mix(in srgb, var(--neon-pink), transparent 92%);
          color: var(--text-main);
          font-family: var(--font-mono);
        }
        .source-health-title {
          color: var(--neon-pink);
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
        }
        .source-health-copy,
        .source-health-more {
          color: var(--text-muted);
          font-size: 0.72rem;
          margin-top: 2px;
        }
        .source-health-banner ul {
          display: grid;
          gap: 4px;
          margin: 8px 0 0;
          padding: 0;
          list-style: none;
        }
        .source-health-banner li {
          display: grid;
          gap: 2px;
          font-size: 0.72rem;
        }
        .source-health-banner span,
        .source-health-banner em {
          color: var(--text-muted);
          font-style: normal;
          overflow-wrap: anywhere;
        }
        .source-health-banner button {
          border: 1px solid color-mix(in srgb, var(--neon-pink), transparent 42%);
          background: transparent;
          color: var(--neon-pink);
          border-radius: 6px;
          padding: 6px 10px;
          font: inherit;
          cursor: pointer;
          min-width: 72px;
        }
        @media (max-width: 640px) {
          .source-health-banner {
            flex-direction: column;
          }
        }
      `}</style>
    </section>
  );
}
