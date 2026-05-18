// Workbench-shape data types + adapters from real backend data.
// Concept components consume `{ projects, todos, sessions, stats }` exactly like
// the original workbench (window.AppData), but the values come from real hooks.

import type { AgentSession, Area, WorkItem } from '@stash/shared';

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
  tokens24h: number;
  cost24h: number;
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
  tokens: number;
  cost: number;
  duration: number;
  at: number;
}

export interface WBTodo {
  id: string;
  text: string;
  project: string | null;
  tags: string[];
  done: boolean;
  /** Raw work-item status — needed by InboxTriage to match what the API filters on. */
  status: 'inbox' | 'planned' | 'active' | 'waiting' | 'blocked' | 'someday' | 'done';
  priority: 'high' | 'med' | 'low';
  kind: 'task' | 'idea';
  due?: 'today' | 'this-week' | 'someday';
  /** v0.6 — visual flags for TodoItem chrome. */
  recurring: boolean;
  reminding: boolean;
}

export interface WBStats {
  activeSessions: number;
  totalTokens24h: number;
  totalCost24h: number;
  projects: number;
  todosOpen: number;
  todosDone: number;
}

export interface WBData {
  projects: WBProject[];
  sessions: WBSession[];
  todos: WBTodo[];
  stats: WBStats;
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

const PRIORITY_MAP: Record<string, WBTodo['priority']> = {
  p0: 'high',
  p1: 'high',
  p2: 'med',
  p3: 'low',
};

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Adapt real backend payloads into workbench-shape data. Concept components
 * read from this consistent shape; reshape lives in one place.
 */
export interface AdaptInput {
  items: WorkItem[];
  sessions: AgentSession[];
  workboardProjects: { projectId: string; itemCount: number; activeCount: number; blockedCount: number; items: WorkItem[]; sessions: AgentSession[] }[];
  areas: Area[];
}

export function adaptToWorkbenchData(input: AdaptInput): WBData {
  const today = todayIso();
  const areasById = new Map(input.areas.map((a) => [a.id, a]));

  // Projects derived from workboard groups.
  const projects: WBProject[] = input.workboardProjects.map((wb, idx) => {
    const done = wb.items.filter((i) => i.status === 'done').length;
    const total = wb.items.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const doingItem = wb.items.find((i) => i.status === 'active');
    const status: WBProject['status'] =
      wb.activeCount > 0 ? 'active' :
      wb.items.every((i) => i.status === 'done') ? 'shipping' :
      wb.items.some((i) => i.status === 'inbox') ? 'fresh' : 'paused';
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
      tokens24h: wb.sessions.reduce((acc, s) => acc + (s.toolCount + s.messageCount) * 80, 0),
      cost24h: wb.sessions.length * 0.05,
      lastModel: wb.sessions[0]?.provider === 'codex' ? 'codex-1' : 'sonnet-4.5',
      lastTouched: wb.sessions[0] ? new Date(wb.sessions[0].lastActiveAt).getTime() : Date.now() - 3600_000,
    };
  });

  // Sessions, ordered by most recent.
  const sessions: WBSession[] = input.sessions.slice(0, 30).map((s) => ({
    id: s.id,
    provider: s.provider,
    project: s.projectId ?? s.cwd,
    model: s.provider === 'codex' ? 'codex-1' : 'sonnet-4.5',
    tool: s.provider === 'codex' ? 'codex' : 'claude-code',
    state: sessionState(s),
    title: s.title,
    preview: s.lastMessage ?? s.initialPrompt ?? '',
    tokens: (s.toolCount + s.messageCount) * 80,
    cost: (s.toolCount + s.messageCount) * 0.001,
    duration: Math.max(60, s.toolCount * 30),
    at: new Date(s.lastActiveAt).getTime(),
  }));

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
      priority: PRIORITY_MAP[i.priority] ?? 'med',
      kind: i.kind === 'idea' ? 'idea' : 'task',
      due: todoDue(i, today),
      recurring: i.recurrence !== undefined,
      reminding: i.reminderAt !== undefined,
    }));

  // Stats.
  const stats: WBStats = {
    activeSessions: sessions.filter((s) => s.state === 'live').length,
    totalTokens24h: sessions.reduce((a, s) => a + s.tokens, 0),
    totalCost24h: sessions.reduce((a, s) => a + s.cost, 0),
    projects: projects.length,
    todosOpen: todos.filter((t) => !t.done).length,
    todosDone: todos.filter((t) => t.done).length,
  };

  return { projects, sessions, todos, stats };
}
