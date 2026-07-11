import { useEffect, useState } from 'react';
import {
  WORKBENCH_ASYNC_ERROR_EVENT,
  type WorkbenchAsyncErrorDetail,
} from './reportAsyncError';

const MAX_VISIBLE_ERRORS = 3;

export function AsyncErrorHost() {
  const [errors, setErrors] = useState<WorkbenchAsyncErrorDetail[]>([]);
  const [retryingIds, setRetryingIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    function onAsyncError(event: Event) {
      const detail = (event as CustomEvent<WorkbenchAsyncErrorDetail>).detail;
      if (!detail) return;
      setErrors((current) => [
        ...current.filter((candidate) => candidate.scope !== detail.scope),
        detail,
      ].slice(-MAX_VISIBLE_ERRORS));
    }

    window.addEventListener(WORKBENCH_ASYNC_ERROR_EVENT, onAsyncError);
    return () => window.removeEventListener(WORKBENCH_ASYNC_ERROR_EVENT, onAsyncError);
  }, []);

  function dismiss(id: number) {
    setErrors((current) => current.filter((error) => error.id !== id));
  }

  async function retry(error: WorkbenchAsyncErrorDetail) {
    if (!error.retry || retryingIds.has(error.id)) return;
    setRetryingIds((current) => new Set(current).add(error.id));
    try {
      await error.retry();
      dismiss(error.id);
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : String(retryError);
      setErrors((current) => current.map((candidate) => (
        candidate.id === error.id ? { ...candidate, message } : candidate
      )));
    } finally {
      setRetryingIds((current) => {
        const next = new Set(current);
        next.delete(error.id);
        return next;
      });
    }
  }

  if (errors.length === 0) return null;

  return (
    <aside className="async-error-host" data-testid="async-error-host" aria-label="Workbench errors">
      {errors.map((error) => {
        const retrying = retryingIds.has(error.id);
        return (
          <section className="async-error-card" role="alert" key={error.id}>
            <div className="async-error-copy">
              <strong>{error.scope}</strong>
              <span>{error.message}</span>
            </div>
            <div className="async-error-actions">
              {error.retry && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={() => { void retry(error); }}
                  aria-label={`retry ${error.scope}`}
                >
                  {retrying ? 'retrying…' : 'retry'}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(error.id)}
                aria-label={`dismiss ${error.scope}`}
              >
                dismiss
              </button>
            </div>
          </section>
        );
      })}

      <style>{`
        .async-error-host {
          position: fixed;
          left: 24px;
          bottom: 24px;
          z-index: 1400;
          display: grid;
          gap: 8px;
          width: min(420px, calc(100vw - 48px));
          pointer-events: none;
        }
        .async-error-card {
          display: grid;
          gap: 10px;
          padding: 12px 14px;
          border: 1px solid rgba(255, 69, 58, 0.45);
          border-radius: var(--radius-md);
          background: color-mix(in srgb, var(--bg-secondary) 94%, black);
          box-shadow: var(--shadow-deep), 0 0 22px rgba(255, 69, 58, 0.12);
          color: var(--text-primary);
          font-family: var(--font-mono);
          pointer-events: auto;
        }
        .async-error-copy {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .async-error-copy strong {
          color: var(--neon-pink);
          font-size: 0.72rem;
        }
        .async-error-copy span {
          overflow-wrap: anywhere;
          color: var(--text-secondary);
          font-size: 0.72rem;
          line-height: 1.45;
        }
        .async-error-actions {
          display: flex;
          gap: 6px;
        }
        .async-error-actions button {
          padding: 3px 8px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font: inherit;
          font-size: 0.65rem;
        }
        .async-error-actions button:hover:not(:disabled) {
          border-color: var(--neon-cyan);
          color: var(--neon-cyan);
        }
        .async-error-actions button:disabled {
          cursor: progress;
          opacity: 0.6;
        }
      `}</style>
    </aside>
  );
}
