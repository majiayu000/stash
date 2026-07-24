import { Link, useLocation } from 'react-router-dom';

type AppSection = 'work' | 'projects' | 'sessions' | 'review' | 'settings';

const NAV_ITEMS: Array<{ section: AppSection; to: string; icon: string; label: string }> = [
  { section: 'work', to: '/', icon: '✓', label: 'Work' },
  { section: 'projects', to: '/projects', icon: '◫', label: 'Projects' },
  { section: 'sessions', to: '/sessions', icon: '›_', label: 'Sessions' },
  { section: 'review', to: '/review', icon: '↗', label: 'Review' },
  { section: 'settings', to: '/settings', icon: '⚙', label: 'Settings' },
];

function sectionFromPath(pathname: string): AppSection {
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/sessions')) return 'sessions';
  if (pathname.startsWith('/review')) return 'review';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'work';
}

export function AppNavigation() {
  const { pathname } = useLocation();
  const activeSection = sectionFromPath(pathname);

  return (
    <nav className="app-navigation" aria-label="Primary navigation">
      <Link className="app-navigation-brand" to="/" aria-label="stash work">
        <span className="app-navigation-mark" aria-hidden>🎯</span>
        <span className="app-navigation-brand-copy">
          <strong>stash</strong>
          <span>local workbench</span>
        </span>
      </Link>

      <div className="app-navigation-links">
        {NAV_ITEMS.map((item) => {
          const active = item.section === activeSection;
          return (
            <Link
              key={item.section}
              className={`app-navigation-link${active ? ' active' : ''}`}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              data-testid={`nav-${item.section}`}
            >
              <span className="app-navigation-icon" aria-hidden>{item.icon}</span>
              <span className="app-navigation-label">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="app-navigation-help">
        <kbd>⌘K</kbd>
        <span>Search tasks</span>
      </div>

      <style>{appNavigationStyles}</style>
    </nav>
  );
}

const appNavigationStyles = `
.app-navigation {
  position: fixed;
  inset: 1rem auto 1rem 1rem;
  z-index: 60;
  width: 11.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1rem 0.75rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-xl);
  background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
  box-shadow: var(--shadow-card);
}
.app-navigation-brand {
  min-height: 3rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.25rem 0.4rem;
  color: var(--text-primary);
  text-decoration: none;
  border-radius: var(--radius-md);
}
.app-navigation-brand:focus-visible,
.app-navigation-link:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 2px;
}
.app-navigation-mark {
  font-size: 1.35rem;
  filter: drop-shadow(0 0 10px var(--neon-cyan));
}
.app-navigation-brand-copy {
  min-width: 0;
  display: grid;
  line-height: 1.2;
}
.app-navigation-brand-copy strong {
  font-family: var(--font-mono);
  font-size: 1rem;
  color: var(--neon-cyan);
}
.app-navigation-brand-copy span {
  font-size: 0.68rem;
  color: var(--text-muted);
}
.app-navigation-links {
  display: grid;
  gap: 0.35rem;
}
.app-navigation-link {
  min-height: 2.75rem;
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
  transition: background 180ms var(--ease-smooth), border-color 180ms var(--ease-smooth), color 180ms var(--ease-smooth);
}
.app-navigation-link:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}
.app-navigation-link.active {
  color: var(--neon-cyan);
  border-color: color-mix(in srgb, var(--neon-cyan) 28%, transparent);
  background: color-mix(in srgb, var(--neon-cyan) 8%, var(--bg-elevated));
}
.app-navigation-icon {
  font-family: var(--font-mono);
  text-align: center;
  color: currentColor;
}
.app-navigation-help {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.45rem 0.15rem;
  color: var(--text-muted);
  font-size: 0.68rem;
}
.app-navigation-help kbd {
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: var(--font-mono);
}
@media (max-width: 1100px) and (min-width: 721px) {
  .app-navigation {
    inset: 0.75rem 5.75rem auto 0.75rem;
    width: auto;
    min-height: 3.5rem;
    padding: 0.4rem 0.55rem;
    flex-direction: row;
    align-items: center;
    gap: 0.65rem;
  }
  .app-navigation-brand { min-height: 2.5rem; }
  .app-navigation-brand-copy span,
  .app-navigation-help { display: none; }
  .app-navigation-links {
    flex: 1;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .app-navigation-link {
    min-height: 2.5rem;
    grid-template-columns: auto auto;
    justify-content: center;
    padding: 0.35rem 0.45rem;
  }
}
@media (max-width: 720px) {
  .app-navigation {
    inset: auto 0 0;
    width: auto;
    min-height: 4rem;
    padding: 0.35rem max(0.35rem, env(safe-area-inset-right)) max(0.35rem, env(safe-area-inset-bottom)) max(0.35rem, env(safe-area-inset-left));
    border-width: 1px 0 0;
    border-radius: 0;
    background: color-mix(in srgb, var(--bg-primary) 97%, transparent);
  }
  .app-navigation-brand,
  .app-navigation-help { display: none; }
  .app-navigation-links {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.15rem;
  }
  .app-navigation-link {
    min-height: 3.25rem;
    grid-template-columns: 1fr;
    justify-items: center;
    align-content: center;
    gap: 0.05rem;
    padding: 0.2rem;
    font-size: 0.66rem;
  }
  .app-navigation-icon { font-size: 0.82rem; }
}
`;
