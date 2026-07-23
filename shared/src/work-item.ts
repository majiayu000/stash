export type WorkItemKind =
  | 'epic'
  | 'feature'
  | 'task'
  | 'bug'
  | 'chore'
  | 'idea'
  | 'research'
  | 'decision'
  | 'reminder'
  | 'system';

export type WorkItemStatus =
  | 'inbox'
  | 'planned'
  | 'active'
  | 'waiting'
  | 'blocked'
  | 'someday'
  | 'done'
  | 'dropped';

export type Priority = 'p0' | 'p1' | 'p2' | 'p3';

export type WorkItemSource =
  | 'manual'
  | 'claude_plan'
  | 'codex_goal'
  | 'session_inferred';

export type Confidence = 'explicit' | 'inferred';

export type Assignee = 'human' | 'claude' | 'codex' | 'mixed';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

/**
 * Recurrence rule. SPEC v0.3 §3c — minimal viable subset.
 * `rrule` mode covers calendar recurrence; `after_completion` shifts the next
 * instance from `completed_at` (Things-style), which RFC 5545 can't model.
 */
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type RecurrenceWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface RecurrenceRule {
  type: 'rrule' | 'after_completion';
  freq?: RecurrenceFreq;
  interval?: number;
  byDay?: RecurrenceWeekday[];
  until?: string;
  count?: number;
  offsetDays?: number;
}

export interface WorkItem {
  id: string;
  projectId?: string;
  areaId?: string;
  parentId?: string;
  title: string;
  description?: string;
  outcome?: string;
  context?: string;
  kind: WorkItemKind;
  status: WorkItemStatus;
  priority: Priority;
  source: WorkItemSource;
  confidence: Confidence;
  assignee: Assignee;
  labels: string[];
  checklist: ChecklistItem[];
  estimateMinutes?: number;
  reminderAt?: string;
  blockedBy?: string;
  waitingOn?: string;
  links: string[];
  reviewAt?: string;
  startAt?: string;
  dueAt?: string;
  scheduledFor?: string;
  /** v0.3 — manual "Today" pin, orthogonal to date columns. */
  todayPinned: boolean;
  /** v0.3 — fractional drag-order; null = use default sort. */
  sortOrder?: number;
  /** v0.3 — recurrence definition. */
  recurrence?: RecurrenceRule;
  /** v0.3 — original capture string before token parsing. */
  rawInput?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// Input shapes for the API.
export interface CreateWorkItemInput {
  title: string;
  description?: string;
  outcome?: string;
  context?: string;
  projectId?: string;
  areaId?: string;
  parentId?: string;
  kind?: WorkItemKind;
  status?: WorkItemStatus;
  priority?: Priority;
  source?: WorkItemSource;
  confidence?: Confidence;
  assignee?: Assignee;
  labels?: string[];
  checklist?: ChecklistItem[];
  estimateMinutes?: number;
  reminderAt?: string;
  reminderLocalDateTime?: string;
  blockedBy?: string;
  waitingOn?: string;
  links?: string[];
  reviewAt?: string;
  startAt?: string;
  dueAt?: string;
  scheduledFor?: string;
  scheduledForRelative?: 'today' | 'tomorrow';
  todayPinned?: boolean;
  sortOrder?: number;
  recurrence?: RecurrenceRule;
  rawInput?: string;
}

type ClearableWorkItemInputField =
  | 'projectId'
  | 'areaId'
  | 'parentId'
  | 'description'
  | 'outcome'
  | 'context'
  | 'estimateMinutes'
  | 'reminderAt'
  | 'blockedBy'
  | 'waitingOn'
  | 'reviewAt'
  | 'startAt'
  | 'dueAt'
  | 'scheduledFor'
  | 'sortOrder'
  | 'recurrence'
  | 'rawInput';

type WorkItemUpdateBase = Omit<CreateWorkItemInput, 'title'> & { title: string };

export type UpdateWorkItemInput = Partial<Omit<WorkItemUpdateBase, ClearableWorkItemInputField>> & {
  [K in ClearableWorkItemInputField]?: WorkItemUpdateBase[K] | null;
};

export const WORK_ITEM_KINDS = [
  'epic',
  'feature',
  'task',
  'bug',
  'chore',
  'idea',
  'research',
  'decision',
  'reminder',
  'system',
] as const satisfies readonly WorkItemKind[];

export const WORK_ITEM_STATUSES = [
  'inbox',
  'planned',
  'active',
  'waiting',
  'blocked',
  'someday',
  'done',
  'dropped',
] as const satisfies readonly WorkItemStatus[];

export const PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const satisfies readonly Priority[];

/** v0.8 — append-only dated journal entry on a work item. */
export interface JournalEntry {
  id: string;
  workItemId: string;
  body: string;
  createdAt: string;
}

export interface CreateJournalEntryInput {
  body: string;
}

// Allowed status transitions (SPEC §10).
export const STATUS_TRANSITIONS: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  inbox: ['planned', 'active', 'someday', 'dropped', 'done'],
  planned: ['active', 'waiting', 'blocked', 'done', 'dropped', 'inbox', 'someday'],
  active: ['waiting', 'blocked', 'done', 'planned', 'dropped'],
  waiting: ['active', 'blocked', 'done', 'planned', 'dropped'],
  blocked: ['active', 'waiting', 'done', 'dropped', 'planned'],
  someday: ['planned', 'dropped', 'inbox'],
  done: ['planned', 'active'],
  dropped: ['inbox', 'planned'],
} as const;
