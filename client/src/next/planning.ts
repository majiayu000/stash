import type { WBTodo } from '../workbench/data';

export interface DailyRecommendation {
  todo: WBTodo;
  score: number;
  reasons: string[];
}

const PRIORITY_SCORE: Record<WBTodo['priority'], number> = {
  p0: 240,
  p1: 140,
  p2: 40,
  p3: 0,
};

function calendarPart(value: string | undefined): string | undefined {
  return value?.slice(0, 10);
}

function ageInDays(updatedAt: string, nowIso: string): number {
  const age = Date.parse(nowIso) - Date.parse(updatedAt);
  if (!Number.isFinite(age) || age <= 0) return 0;
  return Math.floor(age / 86_400_000);
}

function isEligible(todo: WBTodo): boolean {
  return !todo.done
    && todo.status !== 'done'
    && todo.status !== 'dropped'
    && todo.status !== 'inbox'
    && todo.status !== 'waiting'
    && todo.status !== 'blocked'
    && todo.status !== 'someday'
    && todo.kind !== 'system';
}

export function isMyDayTodo(todo: WBTodo, calendarDate: string): boolean {
  if (!isEligible(todo)) return false;
  const due = calendarPart(todo.dueAt);
  const scheduled = calendarPart(todo.scheduledFor);
  return todo.status === 'active'
    || todo.todayPinned
    || Boolean(due && due <= calendarDate)
    || Boolean(scheduled && scheduled <= calendarDate);
}

export function sortMyDay(items: WBTodo[]): WBTodo[] {
  return [...items].sort((a, b) => {
    const aOrder = a.sortOrder ?? Number.POSITIVE_INFINITY;
    const bOrder = b.sortOrder ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    const priority = PRIORITY_SCORE[b.priority] - PRIORITY_SCORE[a.priority];
    return priority || a.updatedAt.localeCompare(b.updatedAt);
  });
}

export function buildDailyRecommendations(
  todos: WBTodo[],
  calendarDate: string,
  nowIso: string,
  limit = 5,
): DailyRecommendation[] {
  return todos
    .filter(isEligible)
    .map((todo) => scoreTodo(todo, calendarDate, nowIso))
    .sort((a, b) => b.score - a.score || a.todo.updatedAt.localeCompare(b.todo.updatedAt))
    .slice(0, limit);
}

function scoreTodo(todo: WBTodo, calendarDate: string, nowIso: string): DailyRecommendation {
  let score = PRIORITY_SCORE[todo.priority];
  const reasons: string[] = [];
  const due = calendarPart(todo.dueAt);
  const scheduled = calendarPart(todo.scheduledFor);

  if (todo.status === 'active') {
    score += 1_000;
    reasons.push('Already in progress');
  }
  if ((due && due < calendarDate) || (scheduled && scheduled < calendarDate)) {
    score += 800;
    reasons.push('Overdue');
  } else if (due === calendarDate) {
    score += 650;
    reasons.push('Due today');
  } else if (scheduled === calendarDate) {
    score += 600;
    reasons.push('Planned for today');
  }
  if (todo.todayPinned) {
    score += 350;
    reasons.push('Pinned to My Day');
  }
  if (todo.priority === 'p0' || todo.priority === 'p1') {
    reasons.push(todo.priority === 'p0' ? 'Critical priority' : 'High priority');
  }

  const age = ageInDays(todo.updatedAt, nowIso);
  score += Math.min(age, 30);
  if (reasons.length === 0 && age >= 7) reasons.push(`Waiting ${age} days`);
  if (reasons.length === 0) reasons.push('Best next open commitment');

  return { todo, score, reasons: reasons.slice(0, 2) };
}

export function estimatedPlanMinutes(recommendations: DailyRecommendation[]): number {
  return recommendations.reduce((total, item) => total + (item.todo.estimateMinutes ?? 30), 0);
}
