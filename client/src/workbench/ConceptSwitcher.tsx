import { useLocation, useNavigate } from 'react-router-dom';
import { CONCEPTS, type ConceptId } from './concepts/registry';
import { isConceptBuilt } from './concepts/render';

const STORAGE_KEY = 'stash:lastConcept';

function activeFromPath(pathname: string): ConceptId {
  if (pathname === '/' || pathname === '') return 'e';
  const m = pathname.match(/^\/c\/([a-z]+)/);
  return (m?.[1] as ConceptId) ?? 'e';
}

/**
 * Secondary design switcher for the 16 concept artboards. Product navigation
 * lives in connected object surfaces; this stays available for reviewing
 * alternate artboards.
 */
export function ConceptSwitcher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeFromPath(pathname);

  function go(id: ConceptId) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* no-op */ }
    navigate(id === 'e' ? '/' : `/c/${id}`);
  }

  return (
    <details
      data-testid="concept-switcher"
      style={{
        padding: 6,
        border: '1px solid var(--border-hair)',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(20px)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.64rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          userSelect: 'none',
          padding: '2px 4px',
        }}
      >
        Concepts · {active === 'prd' ? 'PRD' : active.toUpperCase()}
      </summary>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          maxWidth: 360,
          paddingTop: 6,
        }}
      >
        {CONCEPTS.map((c) => {
          const isActive = c.id === active;
          const built = isConceptBuilt(c.id);
          return (
            <button
              key={c.id}
              type="button"
              data-testid={`concept-${c.id}`}
              title={`${c.title} — ${c.oneLiner}`}
              onClick={() => go(c.id)}
              style={{
                padding: '4px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.66rem',
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: isActive ? 'var(--bg-void)' : built ? 'var(--text-secondary)' : 'var(--text-muted)',
                background: isActive ? 'var(--neon-cyan)' : 'transparent',
                border: '1px solid ' + (isActive ? 'var(--neon-cyan)' : 'var(--border-hair)'),
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                opacity: built || isActive ? 1 : 0.55,
                transition: 'all 0.15s',
              }}
            >
              {c.id === 'prd' ? 'prd' : c.id}
              {!built && <span style={{ marginLeft: 4, fontSize: '0.55rem', opacity: 0.7 }}>·</span>}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function getLastConcept(): ConceptId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && CONCEPTS.some((c) => c.id === v)) return v as ConceptId;
  } catch { /* no-op */ }
  return null;
}
