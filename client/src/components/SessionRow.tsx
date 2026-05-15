import type { AgentSession } from '@stash/shared';
import { ProviderBadge } from './ProviderBadge';

export interface SessionRowProps {
  session: AgentSession;
  selected?: boolean;
  onSelect?: (s: AgentSession) => void;
}

export function SessionRow({ session, selected, onSelect }: SessionRowProps) {
  return (
    <button
      type="button"
      data-testid="session-row"
      data-session-id={session.id}
      onClick={() => onSelect?.(session)}
      className={
        'w-full text-left grid grid-cols-[80px_minmax(0,1fr)_96px_140px] gap-2 items-center px-3 py-2 border-b border-line ' +
        (selected ? 'bg-accent/10' : 'bg-surface hover:bg-surface-soft')
      }
    >
      <ProviderBadge provider={session.provider} />
      <div className="min-w-0">
        <div className="font-extrabold text-[13px] truncate">{session.title}</div>
        <div className="text-muted font-mono text-[10px] truncate">{session.cwd}</div>
      </div>
      <div className="text-muted font-mono text-[10px] uppercase">{session.status}</div>
      <div className="text-muted font-mono text-[10px]">
        {session.lastActiveAt.slice(0, 16).replace('T', ' ')}
      </div>
    </button>
  );
}
