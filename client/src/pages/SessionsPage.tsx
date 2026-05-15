import { useEffect, useState } from 'react';
import type { AgentProvider, AgentSession, AgentSessionEvent } from '@stash/shared';
import { useAgentSessions } from '../hooks/useAgentSessions';
import { SessionRow } from '../components/SessionRow';
import { getAgentSessionEvents } from '../api/agent-sessions';
import { ProviderBadge } from '../components/ProviderBadge';

export function SessionsPage() {
  const [provider, setProvider] = useState<AgentProvider | 'all'>('all');
  const { data, loading, error } = useAgentSessions(provider);
  const [selected, setSelected] = useState<AgentSession | null>(null);
  const [events, setEvents] = useState<AgentSessionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    getAgentSessionEvents(selected.provider, selected.id)
      .then((es) => setEvents(es))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [selected?.provider, selected?.id]);

  return (
    <div className="grid grid-rows-[78px_1fr] h-full">
      <header className="border-b border-line bg-surface px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl leading-none m-0">Sessions</h1>
          <p className="text-muted text-xs mt-1">
            Claude / Codex sessions inferred from local jsonl. Read-only.
          </p>
        </div>
        <div className="flex gap-1" data-testid="provider-filter">
          {(['all', 'claude', 'codex'] as const).map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`provider-${p}`}
              onClick={() => setProvider(p)}
              className={
                'h-8 px-3 rounded-full text-xs font-extrabold border ' +
                (provider === p
                  ? 'border-ink bg-accent text-ink'
                  : 'border-line bg-surface text-muted hover:text-ink')
              }
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      <section className="p-4 grid grid-cols-[1fr_360px] gap-3 overflow-hidden">
        <div className="panel overflow-auto">
          <div className="grid grid-cols-[80px_minmax(0,1fr)_96px_140px] gap-2 items-center px-3 py-2 bg-surface-soft border-b border-line text-[11px] font-extrabold tracking-wider uppercase text-muted">
            <div>Provider</div>
            <div>Title / cwd</div>
            <div>Status</div>
            <div>Last active</div>
          </div>

          {loading && !data ? <div className="p-4 text-muted text-xs">Loading…</div> : null}
          {error ? <div className="p-4 text-status-blocked text-xs">{error.message}</div> : null}
          {data && data.sessions.length === 0 ? (
            <div className="p-4 text-muted text-xs">No sessions found in configured roots.</div>
          ) : null}
          {data?.errors.length ? (
            <div className="px-3 py-2 text-status-blocked text-[11px]">
              {data.errors.length} file(s) failed to parse — others still load.
            </div>
          ) : null}
          <div data-testid="sessions-list">
            {data?.sessions.map((s) => (
              <SessionRow
                key={`${s.provider}:${s.id}`}
                session={s}
                selected={selected?.id === s.id && selected.provider === s.provider}
                onSelect={(item) => setSelected(item)}
              />
            ))}
          </div>
        </div>

        <aside className="panel overflow-auto p-3">
          <div className="section-title mb-2">Transcript preview</div>
          {!selected ? (
            <div className="text-muted text-xs">Select a session to preview.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <ProviderBadge provider={selected.provider} />
                <span className="font-extrabold text-[13px] truncate">{selected.title}</span>
              </div>
              <div className="text-muted text-[10px] font-mono mb-2 truncate">{selected.cwd}</div>
              {eventsLoading ? (
                <div className="text-muted text-xs">Loading transcript…</div>
              ) : events.length === 0 ? (
                <div className="text-muted text-xs">No events.</div>
              ) : (
                <ol className="flex flex-col gap-2" data-testid="transcript-events">
                  {events.slice(0, 50).map((e, i) => (
                    <li key={i} className="border border-line rounded-md p-2 bg-surface">
                      <div className="text-[10px] font-mono uppercase text-muted mb-1">
                        {e.kind}
                        {e.tool ? ` · ${e.tool}` : ''}
                      </div>
                      <div className="text-[12px] leading-snug whitespace-pre-wrap">
                        {e.text.length > 240 ? e.text.slice(0, 240) + '…' : e.text}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
