import type { WorkItem } from '@stash/shared';
import { StatusPill } from './StatusPill';

export interface TaskRowProps {
  item: WorkItem;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onToggleDone?: (id: string) => void;
}

export function TaskRow({ item, selected = false, onSelect, onToggleDone }: TaskRowProps) {
  return (
    <div
      className={
        'grid grid-cols-[32px_minmax(260px,1fr)_94px_120px_88px_104px] gap-2 items-center min-h-[64px] px-3 py-2 border-b border-line ' +
        (selected ? 'bg-accent/10' : 'bg-surface hover:bg-surface-soft')
      }
      data-testid="task-row"
      data-task-id={item.id}
    >
      <button
        type="button"
        aria-label={item.status === 'done' ? 'mark not done' : 'mark done'}
        onClick={() => onToggleDone?.(item.id)}
        className={
          'w-[18px] h-[18px] rounded-sm border-2 ' +
          (item.status === 'done'
            ? 'bg-status-active border-status-active'
            : 'bg-surface border-line-strong')
        }
      />

      <button
        type="button"
        onClick={() => onSelect?.(item.id)}
        className="text-left min-w-0"
      >
        <div className="font-extrabold text-[13px] text-ink truncate">{item.title}</div>
        <div className="text-muted font-mono text-[10px] truncate">
          {item.projectId ?? 'no project'}
          {item.labels.length ? ` · ${item.labels.join(', ')}` : ''}
        </div>
      </button>

      <StatusPill status={item.status} />

      <div className="text-muted font-mono text-[10px] truncate">{item.areaId ?? '—'}</div>

      <div className="text-muted font-mono text-[10px] uppercase">{item.priority}</div>

      <div className="text-muted font-mono text-[10px]">
        {item.scheduledFor ?? 'no date'}
      </div>
    </div>
  );
}
