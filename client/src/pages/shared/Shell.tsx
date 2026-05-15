import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS: { label: string; to: string }[] = [
  { label: 'Overview', to: '/overview' },
  { label: 'Inbox', to: '/inbox' },
  { label: 'Todo', to: '/todo' },
  { label: 'Projects', to: '/projects' },
  { label: 'Workboard', to: '/workboard' },
  { label: 'Sessions', to: '/sessions' },
  { label: 'Evidence', to: '/evidence' },
  { label: 'Analytics', to: '/analytics' },
];

export function Shell() {
  return (
    <div className="min-h-screen p-6 flex flex-col items-center">
      <section className="w-full max-w-[1440px] bg-surface border border-line-strong rounded-lg shadow-panel overflow-hidden grid grid-rows-[64px_1fr] min-h-[900px]">
        <header className="grid grid-cols-[220px_1fr_auto] gap-3 items-center px-4 border-b border-line bg-surface">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md border-2 border-ink bg-accent grid place-items-center font-mono text-[12px] font-extrabold">
              ST
            </div>
            <div>
              <strong className="block text-[15px] leading-none">stash</strong>
              <span className="block mt-1 text-muted text-[10px] font-extrabold tracking-wider uppercase whitespace-nowrap">
                Capture first, projects second
              </span>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto min-w-0" aria-label="Primary pages">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  'h-8 px-3 rounded-full border text-xs font-extrabold whitespace-nowrap inline-flex items-center ' +
                  (isActive
                    ? 'border-ink bg-accent text-ink'
                    : 'border-line bg-surface text-muted hover:text-ink')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex gap-2 items-center" />
        </header>

        <main className="bg-surface-soft min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
