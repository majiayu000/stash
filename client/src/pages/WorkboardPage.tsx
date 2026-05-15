import { useWorkboard } from '../hooks/useWorkboard';
import { ProviderBadge } from '../components/ProviderBadge';
import { StatusPill } from '../components/StatusPill';

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function WorkboardPage() {
  const { data, loading, error } = useWorkboard();

  return (
    <div className="grid grid-rows-[78px_1fr] h-full">
      <header className="border-b border-line bg-surface px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl leading-none m-0">Workboard</h1>
          <p className="text-muted text-xs mt-1">
            Projects grouped from work items, with linked agent sessions as execution evidence.
          </p>
        </div>
      </header>

      <section className="p-4 grid grid-rows-[auto_1fr] gap-3 overflow-hidden">
        {loading && !data ? <div className="text-muted text-xs">Loading…</div> : null}
        {error ? <div className="text-status-blocked text-xs">{error.message}</div> : null}

        {data?.parseErrors.length ? (
          <div className="border border-status-blocked/30 bg-status-blocked/5 text-status-blocked rounded-md p-2 text-xs">
            {data.parseErrors.length} source(s) failed to parse.
          </div>
        ) : null}

        <div className="overflow-auto flex flex-col gap-3" data-testid="workboard-projects">
          {data?.projects.length === 0 ? (
            <div className="text-muted text-xs">
              No projects yet. Set <code>projectId</code> on work items to see them here.
            </div>
          ) : null}

          {data?.projects.map((p) => (
            <article
              key={p.projectId}
              className="panel p-3"
              data-testid="workboard-project"
              data-project-id={p.projectId}
            >
              <header className="flex items-center justify-between mb-2 gap-2">
                <div className="min-w-0">
                  <div className="font-extrabold text-[14px]">{basename(p.projectId)}</div>
                  <div className="text-muted font-mono text-[10px] truncate">{p.projectId}</div>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold text-muted">
                  <span>{p.itemCount} items</span>
                  {p.activeCount > 0 ? (
                    <span className="text-status-active">{p.activeCount} active</span>
                  ) : null}
                  {p.blockedCount > 0 ? (
                    <span className="text-status-blocked">{p.blockedCount} blocked</span>
                  ) : null}
                </div>
              </header>

              <div className="grid grid-cols-[1fr_240px] gap-3">
                <ul className="flex flex-col gap-1">
                  {p.items.slice(0, 6).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 text-[12px] border-b border-line/50 py-1"
                    >
                      <StatusPill status={item.status} />
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className="text-muted font-mono text-[10px] uppercase">{item.priority}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col gap-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    Sessions
                  </div>
                  {p.sessions.length === 0 ? (
                    <div className="text-muted text-[11px]">none linked</div>
                  ) : (
                    p.sessions.map((s) => (
                      <div
                        key={`${s.provider}:${s.id}`}
                        className="flex items-center gap-2 text-[11px] truncate"
                        data-testid="project-session-chip"
                      >
                        <ProviderBadge provider={s.provider} />
                        <span className="truncate">{s.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
