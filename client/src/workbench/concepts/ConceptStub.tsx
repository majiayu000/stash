import { Link } from 'react-router-dom';
import type { ConceptEntry } from './registry';

/**
 * Placeholder rendered for concepts that haven't been ported yet.
 * Faithful to the dashboard-canvas wrapper so theme overrides cascade.
 */
export function ConceptStub({ entry }: { entry: ConceptEntry }) {
  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="surface" style={{ maxWidth: 540, padding: '2rem 2.25rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
            concept {entry.id} · stub
          </div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 10 }}>
            {entry.title}
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
            {entry.oneLiner}
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Not built yet. Tracked in <code>docs/PLAN.md</code> Phase 2.
          </div>
          <Link to="/" style={{ display: 'inline-block', marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-cyan)', textDecoration: 'none' }}>
            ← back to Concept E (default)
          </Link>
        </div>
      </div>
    </div>
  );
}
