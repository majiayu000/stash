import type { WorkItemStatus } from '@stash/shared';

const CLASS: Record<WorkItemStatus, string> = {
  inbox: 'pill pill-status-inbox',
  planned: 'pill pill-status-planned',
  active: 'pill pill-status-active',
  waiting: 'pill pill-status-waiting',
  blocked: 'pill pill-status-blocked',
  someday: 'pill pill-status-someday',
  done: 'pill pill-status-done',
  dropped: 'pill pill-status-dropped',
};

export function StatusPill({ status }: { status: WorkItemStatus }) {
  return <span className={CLASS[status]}>{status}</span>;
}
