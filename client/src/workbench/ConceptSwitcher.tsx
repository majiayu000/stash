import { useLocation, useNavigate } from 'react-router-dom';
import { CONCEPTS, type ConceptId } from './concepts/registry';

const STORAGE_KEY = 'stash:lastConcept';
const PRIMARY_NAV: Array<{ id: ConceptId; label: string; description: string; path: string }> = [
  { id: 'e', label: 'Workbench', description: 'Capture, triage, and plan todos', path: '/' },
  { id: 'f', label: 'Projects', description: 'Create and edit projects', path: '/projects' },
  { id: 'g', label: 'Sessions', description: 'Review Claude and Codex runs', path: '/sessions' },
  { id: 'm', label: 'Skills', description: 'Manage reusable skills', path: '/skills' },
  { id: 'h', label: 'Analytics', description: 'Track model usage and cost', path: '/analytics' },
  { id: 'done', label: 'Done', description: 'Browse completed todos', path: '/done' },
  { id: 'n', label: 'Settings', description: 'Configure stash', path: '/settings' },
];

function activeFromPath(pathname: string): ConceptId {
  if (pathname === '/' || pathname === '') return 'e';
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return 'f';
  if (pathname.startsWith('/tasks/')) return 'e';
  if (pathname === '/sessions' || pathname.startsWith('/sessions/')) return 'g';
  if (pathname === '/skills') return 'm';
  if (pathname === '/analytics') return 'h';
  if (pathname === '/done') return 'done';
  if (pathname === '/settings') return 'n';
  if (pathname === '/agent/new') return 'e';
  const m = pathname.match(/^\/c\/([a-z]+)/);
  const legacy = m?.[1] as ConceptId | undefined;
  if (legacy === 'f' || legacy === 'k') return 'f';
  if (legacy === 'l' || legacy === 'o') return 'e';
  if (legacy === 'g') return 'g';
  if (legacy === 'm') return 'm';
  if (legacy === 'h') return 'h';
  if (legacy === 'done') return 'done';
  if (legacy === 'n') return 'n';
  return 'e';
}

function conceptPath(id: ConceptId): string {
  return PRIMARY_NAV.find((c) => c.id === id)?.path ?? '/';
}

function rememberConcept(id: ConceptId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (err) {
    console.warn('failed to persist selected concept', err);
  }
}

/**
 * Product navigation. Internal concept routes still work for old links, while
 * the primary UI exposes task-oriented destinations for ordinary users.
 */
export function ConceptSwitcher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeFromPath(pathname);

  function go(id: ConceptId) {
    rememberConcept(id);
    navigate(conceptPath(id));
  }

  return (
    <div
      data-testid="concept-switcher"
      style={{
        display: 'flex',
        gap: 6,
        padding: 6,
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        flex: '1 1 auto',
        border: '1px solid var(--border-hair)',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(20px)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      {PRIMARY_NAV.map((c) => {
        const isActive = c.id === active;
        return (
          <button
            key={c.id}
            type="button"
            data-testid={`concept-${c.id}`}
            title={c.description}
            onClick={() => go(c.id)}
            style={{
              padding: '7px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              fontWeight: isActive ? 700 : 500,
              letterSpacing: 0,
              color: isActive ? 'var(--bg-void)' : 'var(--text-secondary)',
              background: isActive ? 'var(--neon-cyan)' : 'transparent',
              border: '1px solid ' + (isActive ? 'var(--neon-cyan)' : 'var(--border-hair)'),
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export function getLastConcept(): ConceptId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && CONCEPTS.some((c) => c.id === v)) return v as ConceptId;
  } catch (err) {
    console.warn('failed to read selected concept', err);
  }
  return null;
}
