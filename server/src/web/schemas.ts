import { z } from 'zod';

const Priority = z.enum(['p0', 'p1', 'p2', 'p3']);
const Kind = z.enum([
  'epic',
  'feature',
  'task',
  'bug',
  'chore',
  'idea',
  'research',
  'decision',
  'reminder',
]);
const Status = z.enum([
  'inbox',
  'planned',
  'active',
  'waiting',
  'blocked',
  'someday',
  'done',
  'dropped',
]);
const Source = z.enum(['manual', 'claude_plan', 'codex_goal', 'session_inferred']);
const Confidence = z.enum(['explicit', 'inferred']);
const Assignee = z.enum(['human', 'claude', 'codex', 'mixed']);
const ReviewCadence = z.enum(['daily', 'weekly', 'monthly', 'ad_hoc']);

const ChecklistItem = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
});

const RecurrenceFreq = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
const RecurrenceWeekday = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
const Recurrence = z.object({
  type: z.enum(['rrule', 'after_completion']),
  freq: RecurrenceFreq.optional(),
  interval: z.number().int().positive().optional(),
  byDay: z.array(RecurrenceWeekday).optional(),
  until: z.string().optional(),
  count: z.number().int().positive().optional(),
  offsetDays: z.number().int().positive().optional(),
});

export const CreateAreaBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  reviewCadence: ReviewCadence.optional(),
});

export const UpdateAreaBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  reviewCadence: ReviewCadence.optional(),
});

export const CreateWorkItemBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  outcome: z.string().optional(),
  context: z.string().optional(),
  projectId: z.string().optional(),
  areaId: z.string().optional(),
  parentId: z.string().optional(),
  kind: Kind.optional(),
  status: Status.optional(),
  priority: Priority.optional(),
  source: Source.optional(),
  confidence: Confidence.optional(),
  assignee: Assignee.optional(),
  labels: z.array(z.string()).optional(),
  checklist: z.array(ChecklistItem).optional(),
  estimateMinutes: z.number().int().nonnegative().optional(),
  reminderAt: z.string().optional(),
  repeatRule: z.string().optional(),
  blockedBy: z.string().optional(),
  waitingOn: z.string().optional(),
  links: z.array(z.string()).optional(),
  reviewAt: z.string().optional(),
  startAt: z.string().optional(),
  dueAt: z.string().optional(),
  scheduledFor: z.string().optional(),
  todayPinned: z.boolean().optional(),
  sortOrder: z.number().optional(),
  recurrence: Recurrence.optional(),
  rawInput: z.string().optional(),
});

export const UpdateWorkItemBody = CreateWorkItemBody.partial();

export const ListWorkItemsQuery = z.object({
  status: z
    .union([Status, z.array(Status)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  areaId: z.string().optional(),
  projectId: z.string().optional(),
  parentId: z.string().optional(),
  parentIsNull: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  scheduledFrom: z.string().optional(),
  scheduledTo: z.string().optional(),
  scheduledIsNull: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  includeDropped: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const SkillSource = z.enum(['official', 'community']);

export const CreateSkillBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().optional(),
  description: z.string().optional(),
  source: SkillSource.optional(),
  stars: z.number().int().nonnegative().optional(),
  installed: z.boolean().optional(),
  version: z.string().optional(),
});

export const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  emoji: z.string().optional(),
  description: z.string().optional(),
  source: SkillSource.optional(),
  stars: z.number().int().nonnegative().optional(),
  installed: z.boolean().optional(),
  version: z.string().optional(),
});

export const SetProjectBindingsBody = z.object({
  skillIds: z.array(z.string()),
});

export const ToggleBindingBody = z.object({
  enabled: z.boolean(),
});

const MilestoneStatusZ = z.enum(['planned', 'wip', 'done']);

export const SetIntentBody = z.object({ text: z.string() });

export const CreateMilestoneBody = z.object({
  name: z.string().min(1),
  date: z.string().optional(),
  status: MilestoneStatusZ.optional(),
  progress: z.number().optional(),
});

export const UpdateMilestoneBody = CreateMilestoneBody.partial();

export const CreateDecisionBody = z.object({
  date: z.string().optional(),
  title: z.string().min(1),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
});

export const UpdateDecisionBody = CreateDecisionBody.partial();

export const SetNotesBody = z.object({ markdown: z.string() });

export const CreateLessonBody = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  cross: z.boolean().optional(),
  projectId: z.string().optional(),
});

export const UpdateLessonBody = CreateLessonBody.partial();

export const ListLessonsQuery = z.object({
  projectId: z.string().optional(),
  crossOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const ChecklistAppendBody = z.object({ text: z.string().min(1) });
export const ChecklistUpdateBody = z.object({
  text: z.string().min(1).optional(),
  toggle: z.boolean().optional(),
});

export type CreateAreaInputDto = z.infer<typeof CreateAreaBody>;
export type CreateWorkItemInputDto = z.infer<typeof CreateWorkItemBody>;
