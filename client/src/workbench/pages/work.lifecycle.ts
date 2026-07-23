import type { UpdateWorkItemInput } from '@stash/shared';
import type { WBTodo } from '../data';

export type TodoBoardColumn = 'inbox' | 'today' | 'doing' | 'later';

export interface TodoBoardGroups {
  inbox: WBTodo[];
  today: WBTodo[];
  doing: WBTodo[];
  later: WBTodo[];
  done: WBTodo[];
}

export function groupTodosForBoard(
  todos: WBTodo[],
  liveProjectIds: ReadonlySet<string>,
  calendar_date: string,
  now = new Date(),
): TodoBoardGroups {
  const nowIso = now.toISOString();
  const open = todos.filter((todo) => !todo.done && todo.status !== 'done');

  const inbox = sortByCreated(open.filter((todo) => todo.status === 'inbox'));
  const doing = sortByCreated(open.filter((todo) => todo.status === 'active' || isLiveProjectTodo(todo, liveProjectIds)));
  const todayItems = sortToday(
    open.filter((todo) => todo.status !== 'active'
      && !isLiveProjectTodo(todo, liveProjectIds)
      && isTodayTodo(todo, calendar_date, nowIso)),
  );
  const assigned = new Set([...inbox, ...doing, ...todayItems].map((todo) => todo.id));
  const later = sortByCreated(open.filter((todo) => !assigned.has(todo.id)));
  const done = sortDone(todos.filter((todo) => todo.done || todo.status === 'done'));

  return { inbox, today: todayItems, doing, later, done };
}

export function moveInputForColumn(column: TodoBoardColumn): UpdateWorkItemInput {
  switch (column) {
    case 'inbox':
      return {
        status: 'inbox',
        todayPinned: false,
        scheduledFor: null,
        startAt: null,
        dueAt: null,
        sortOrder: null,
      };
    case 'today':
      return {
        status: 'planned',
        todayPinned: true,
        scheduledForRelative: 'today',
      };
    case 'doing':
      return { status: 'active', todayPinned: false, scheduledFor: null, sortOrder: null };
    case 'later':
      return {
        status: 'planned',
        todayPinned: false,
        scheduledFor: null,
        startAt: null,
        dueAt: null,
        sortOrder: null,
      };
  }
}

export function doneMoveInput(): UpdateWorkItemInput {
  return { status: 'done', todayPinned: false, sortOrder: null };
}

function isLiveProjectTodo(todo: WBTodo, liveProjectIds: ReadonlySet<string>): boolean {
  return Boolean(todo.project && liveProjectIds.has(todo.project));
}

function isTodayTodo(todo: WBTodo, calendar_date: string, nowIso: string): boolean {
  if (todo.status === 'done' || todo.status === 'dropped') return false;
  if (todo.todayPinned) return true;
  if (todo.startAt && todo.startAt <= nowIso) return true;
  if (todo.dueAt && todo.dueAt < calendar_date) return true;
  return todo.scheduledFor === calendar_date;
}

function sortToday(items: WBTodo[]): WBTodo[] {
  return [...items].sort((a, b) => {
    if (a.todayPinned !== b.todayPinned) return a.todayPinned ? -1 : 1;
    const order = (a.sortOrder ?? Number.POSITIVE_INFINITY) - (b.sortOrder ?? Number.POSITIVE_INFINITY);
    if (order !== 0) return order;
    return priorityRank(a) - priorityRank(b) || a.updatedAt.localeCompare(b.updatedAt);
  });
}

function sortDone(items: WBTodo[]): WBTodo[] {
  return [...items].sort((a, b) =>
    (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
  );
}

function sortByCreated(items: WBTodo[]): WBTodo[] {
  return [...items].sort((a, b) => priorityRank(a) - priorityRank(b) || a.updatedAt.localeCompare(b.updatedAt));
}

function priorityRank(todo: WBTodo): number {
  return { p0: 0, p1: 1, p2: 2, p3: 3 }[todo.priority];
}
