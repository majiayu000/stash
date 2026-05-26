import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS_TRANSITIONS, type WorkItemStatus } from '@stash/shared';
import { updateWorkItem } from '../../api/work-items';
import type { WBTodo } from '../data';

export type ToastTone = 'info' | 'ok' | 'error';

export interface ToastAction {
  label: string;
  run: () => Promise<void>;
}

type Flash = (message: string, tone?: ToastTone, action?: ToastAction) => void;

export function isStatusMoveAllowed(from: WorkItemStatus, to: WorkItemStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
}

export function invalidMoveMessage(todo: WBTodo, to?: WorkItemStatus): string | null {
  if (!to || isStatusMoveAllowed(todo.status, to)) return null;
  const allowed = STATUS_TRANSITIONS[todo.status]
    .filter((status) => status !== 'dropped')
    .map(statusLabel)
    .join(', ');
  return `${statusLabel(todo.status)} 不能移动到 ${statusLabel(to)}。可移动到：${allowed}。`;
}

export function statusLabel(status: WorkItemStatus): string {
  switch (status) {
    case 'inbox': return '收件箱';
    case 'planned': return '已计划';
    case 'active': return '进行中';
    case 'waiting': return '等待中';
    case 'blocked': return '阻塞';
    case 'someday': return '以后';
    case 'done': return '完成';
    case 'dropped': return '丢弃';
  }
}

async function restoreFromDone(id: string, previousStatus: WorkItemStatus) {
  if (previousStatus === 'done') return;
  if (isStatusMoveAllowed('done', previousStatus)) {
    await updateWorkItem(id, { status: previousStatus });
    return;
  }
  await updateWorkItem(id, { status: 'planned' });
  if (previousStatus !== 'planned') {
    await updateWorkItem(id, { status: previousStatus });
  }
}

export function DoneDropZone({
  active,
  allTodos,
  draggingTodo,
  onDragEnd,
  onFlash,
}: {
  active: boolean;
  allTodos: WBTodo[];
  draggingTodo: WBTodo | null;
  onDragEnd: () => void;
  onFlash: Flash;
}) {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const invalidTarget = Boolean(draggingTodo && !isStatusMoveAllowed(draggingTodo.status, 'done'));
  const doneCount = allTodos.filter((todo) => todo.status === 'done').length;

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('application/stash-todo')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    onDragEnd();
    const id = e.dataTransfer.getData('application/stash-todo');
    if (!id) return;
    const todo = allTodos.find((t) => t.id === id);
    if (!todo) return;
    const invalid = invalidMoveMessage(todo, 'done');
    if (invalid) {
      onFlash(invalid, 'error');
      return;
    }
    const previousStatus = todo.status;
    try {
      await updateWorkItem(id, { status: 'done' });
      window.dispatchEvent(new CustomEvent('stash:captured'));
      onFlash('已完成', 'ok', {
        label: '撤销',
        run: async () => {
          await restoreFromDone(id, previousStatus);
          window.dispatchEvent(new CustomEvent('stash:captured'));
          onFlash('已恢复', 'info');
        },
      });
    } catch (err) {
      onFlash(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  function openDonePage() {
    if (active) return;
    navigate('/done');
  }

  return (
    <div
      className={`done-drop-zone ${active ? 'active' : ''} ${dragOver ? 'drag-over' : ''} ${dragOver && invalidTarget ? 'invalid-over' : ''}`}
      onClick={openDonePage}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDonePage();
        }
      }}
      role="button"
      tabIndex={0}
      data-testid="done-drop-zone"
    >
      <span className="done-drop-icon">✓</span>
      <span className="done-drop-title">完成</span>
      <span className="done-drop-hint">{active ? '拖到这里完成' : `${doneCount} 个已完成 - 打开归档`}</span>
    </div>
  );
}
