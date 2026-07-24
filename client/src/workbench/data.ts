// Workbench-shape data types + adapters from real backend data.
// Workbench pages consume `{ projects, todos, sessions, stats }` exactly like
// the original workbench (window.AppData), but the values come from real hooks.

import type { AgentSession, Area, Priority, WorkItem, WorkItemKind } from '@stash/shared';
import type { SourceHealthError } from '../api/agent-sessions';
import type { RuntimeMetadata } from '../api/runtime';

export interface WBProject {
  id: string;
  name: string;
  emoji: string;
  progress: number;
  status: 'active' | 'shipping' | 'paused' | 'fresh';
  doing: string;
  features: { name: string; progress: number; status: 'done' | 'almost' | 'wip' | 'todo' }[];
  todoCount: number;
  todoDone: number;
  sessions: number;
  estimatedTokens: number;
  estimatedCost: number;
  lastModel: string;
  lastTouched: number;
}

export interface WBSession {
  id: string;
  /** Raw agent provider — needed to hit /api/agent-sessions/:provider/:id endpoints. */
  provider: 'claude' | 'codex';
  project: string;
  model: string;
  tool: 'claude-code' | 'codex';
  state: 'live' | 'idle' | 'done' | 'error';
  title: string;
  preview: string;
  estimatedTokens: number;
  estimatedCost: number;
  estimatedDuration: number;
  at: number;
}

export interface WBTodo {
  id: string;
  text: string;
  project: string | null;
  tags: string[];
  done: boolean;
  /** Raw work-item status — needed by InboxTriage to match what the API filters on. */
  status: 'inbox' | 'planned' | 'active' | 'waiting' | 'blocked' | 'someday' | 'done' | 'dropped';
  priority: Priority;
  kind: WorkItemKind;
  due?: 'today' | 'this-week' | 'someday';
  scheduledFor?: string;
  startAt?: string;
  dueAt?: string;
  todayPinned: boolean;
  sortOrder?: number;
  updatedAt: string;
  completedAt?: string;
  /** v0.6 — visual flags for TodoItem chrome. */
  recurring: boolean;
  reminding: boolean;
}

export interface WBStats {
  activeSessions: number;
  totalEstimatedTokens: number;
  totalEstimatedCost: number;
  projects: number;
  todosOpen: number;
  todosDone: number;
}

export interface WBData {
  runtime: RuntimeMetadata;
  projects: WBProject[];
  sessions: WBSession[];
  todos: WBTodo[];
  stats: WBStats;
  sourceErrors: SourceHealthError[];
  sessionDataState?: 'loading' | 'ready' | 'error';
}

// ─── helpers ────────────────────────────────────────────────────────────────
export const fmt = {
  k: (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)),
  cost: (n: number) => '$' + n.toFixed(2),
  ago: (t: number) => {
    const d = Math.max(0, Date.now() - t);
    if (d < 60_000) return 'just now';
    if (d < 3_600_000) return Math.round(d / 60_000) + 'm ago';
    if (d < 86_400_000) return Math.round(d / 3_600_000) + 'h ago';
    return Math.round(d / 86_400_000) + 'd ago';
  },
  dur: (s: number) => {
    if (s < 60) return s + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    return (s / 3600).toFixed(1) + 'h';
  },
};

const PROJECT_EMOJIS = ['🌌', '🎨', '🤖', '🧭', '📚', '👻', '🔮', '⚡', '🚀', '🛸'];

function emojiFor(seed: string, idx: number): string {
  return PROJECT_EMOJIS[idx % PROJECT_EMOJIS.length] ?? '📦';
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function todoDue(item: WorkItem, todayIso: string): WBTodo['due'] | undefined {
  if (item.status === 'someday') return 'someday';
  if (!item.scheduledFor) return undefined;
  if (item.scheduledFor === todayIso) return 'today';
  return 'this-week';
}

function sessionState(s: AgentSession): WBSession['state'] {
  if (s.status === 'running') return 'live';
  if (s.status === 'idle') return 'idle';
  if (s.status === 'lost') return 'error';
  if (s.status === 'completed') return 'done';
  return 'idle';
}

/**
 * Activity-only fallback for surfaces that do not receive usage telemetry.
 * These values are estimates, not measured token/cost/duration values, and no
 * time-window filter (including 24h) is applied here.
 */
export function estimateSessionActivity(toolCount: number, messageCount: number) {
  const activityCount = toolCount + messageCount;
  return {
    estimatedTokens: activityCount * 80,
    estimatedCost: activityCount * 0.001,
    estimatedDuration: Math.max(60, toolCount * 30),
  };
}

export function toWorkbenchSession(session: AgentSession): WBSession {
  const estimate = estimateSessionActivity(session.toolCount, session.messageCount);
  return {
    id: session.id,
    provider: session.provider,
    project: session.projectId ?? session.cwd,
    model: session.model ?? (session.provider === 'codex' ? 'codex' : 'claude'),
    tool: session.provider === 'codex' ? 'codex' : 'claude-code',
    state: sessionState(session),
    title: session.title,
    preview: session.lastMessage ?? session.initialPrompt ?? '',
    ...estimate,
    at: new Date(session.lastActiveAt).getTime(),
  };
}

export function sessionPath(session: Pick<WBSession, 'provider' | 'id'>): string {
  return `/sessions/${session.provider}/${encodeURIComponent(session.id)}`;
}

/**
 * Adapt real backend payloads into workbench-shape data. Workbench pages
 * read from this consistent shape; reshape lives in one place.
 */
export interface AdaptInput {
  runtime: RuntimeMetadata;
  items: WorkItem[];
  sessions: AgentSession[];
  sourceErrors: SourceHealthError[];
  workboardProjects: { projectId: string; itemCount: number; activeCount: number; blockedCount: number; items: WorkItem[]; sessions: AgentSession[] }[];
  areas: Area[];
  sessionDataState?: WBData['sessionDataState'];
}

export function adaptToWorkbenchData(input: AdaptInput): WBData {
  const today = input.runtime.calendarDate;
  const areasById = new Map(input.areas.map((a) => [a.id, a]));

  // Areas are the durable project registry. Workboard groups only exist after a
  // project receives its first work item, so append missing areas as empty
  // summaries instead of making them disappear from project surfaces.
  const workboardProjectIds = new Set(input.workboardProjects.map((project) => project.projectId));
  const projectSummaries = [
    ...input.workboardProjects,
    ...input.areas
      .filter((area) => !workboardProjectIds.has(area.id))
      .map((area) => ({
        projectId: area.id,
        itemCount: 0,
        activeCount: 0,
        blockedCount: 0,
        items: [] as WorkItem[],
        sessions: [] as AgentSession[],
      })),
  ];

  const projects: WBProject[] = projectSummaries.map((wb, idx) => {
    const done = wb.items.filter((i) => i.status === 'done').length;
    const total = wb.items.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const doingItem = wb.items.find((i) => i.status === 'active');
    const status: WBProject['status'] =
      wb.activeCount > 0 ? 'active' :
      total > 0 && wb.items.every((i) => i.status === 'done') ? 'shipping' :
      wb.items.some((i) => i.status === 'inbox') ? 'fresh' : 'paused';
    const estimatedTokens = wb.sessions.reduce(
      (total, session) => total + estimateSessionActivity(session.toolCount, session.messageCount).estimatedTokens,
      0,
    );
    return {
      id: wb.projectId,
      name: areasById.get(wb.projectId)?.name ?? basename(wb.projectId),
      emoji: areasById.get(wb.projectId)?.emoji || emojiFor(wb.projectId, idx),
      progress,
      status,
      doing: doingItem?.title ?? (wb.blockedCount > 0 ? 'blocked' : 'no active work'),
      features: wb.items.slice(0, 4).map((i) => ({
        name: i.title.slice(0, 32),
        progress: i.status === 'done' ? 100 : i.status === 'active' ? 50 : i.status === 'planned' ? 20 : 0,
        status: i.status === 'done' ? 'done' : i.status === 'active' ? 'almost' : i.status === 'planned' ? 'wip' : 'todo',
      })),
      todoCount: wb.items.filter((i) => i.status !== 'done' && i.status !== 'dropped').length,
      todoDone: done,
      sessions: wb.sessions.length,
      estimatedTokens,
      estimatedCost: wb.sessions.length * 0.05,
      lastModel: wb.sessions[0]?.model ?? (wb.sessions[0]?.provider === 'codex' ? 'codex' : wb.sessions[0]?.provider === 'claude' ? 'claude' : '—'),
      lastTouched: wb.sessions[0] ? new Date(wb.sessions[0].lastActiveAt).getTime() : Date.now() - 3600_000,
    };
  });

  // Sessions, ordered by most recent.
  const sessions: WBSession[] = input.sessions.slice(0, 30).map(toWorkbenchSession);

  // Todos.
  const todos: WBTodo[] = input.items
    .filter((i) => i.status !== 'dropped')
    .map((i) => ({
      id: i.id,
      text: i.title,
      project: i.projectId ?? null,
      tags: i.labels.map((l) => '#' + l),
      done: i.status === 'done',
      status: i.status as WBTodo['status'],
      priority: i.priority,
      kind: i.kind,
      due: todoDue(i, today),
      scheduledFor: i.scheduledFor,
      startAt: i.startAt,
      dueAt: i.dueAt,
      todayPinned: i.todayPinned,
      sortOrder: i.sortOrder,
      updatedAt: i.updatedAt,
      completedAt: i.completedAt,
      recurring: i.recurrence !== undefined,
      reminding: i.reminderAt !== undefined,
    }));

  // Stats.
  const stats: WBStats = {
    activeSessions: sessions.filter((s) => s.state === 'live').length,
    totalEstimatedTokens: sessions.reduce((a, s) => a + s.estimatedTokens, 0),
    totalEstimatedCost: sessions.reduce((a, s) => a + s.estimatedCost, 0),
    projects: projects.length,
    todosOpen: todos.filter((t) => !t.done).length,
    todosDone: todos.filter((t) => t.done).length,
  };

  return {
    runtime: input.runtime,
    projects,
    sessions,
    todos,
    stats,
    sourceErrors: input.sourceErrors,
    sessionDataState: input.sessionDataState ?? 'ready',
  };
}
