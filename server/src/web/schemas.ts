import { z } from 'zod';
import {
  assert_utc_instant,
  parse_calendar_date,
  parse_local_date_time,
} from '@stash/shared';

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
  'system',
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
const CalendarDate = z.string().superRefine((value, ctx) => {
  try {
    parse_calendar_date(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'expected Gregorian calendar date YYYY-MM-DD' });
  }
});
const UtcInstant = z.string().superRefine((value, ctx) => {
  try {
    assert_utc_instant(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'expected valid UTC instant ending in Z' });
  }
});
const LocalDateTime = z.string().superRefine((value, ctx) => {
  try {
    parse_local_date_time(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'expected local date-time YYYY-MM-DDTHH:mm' });
  }
});

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
  until: CalendarDate.optional(),
  count: z.number().int().positive().optional(),
  offsetDays: z.number().int().positive().optional(),
});

export const CreateAreaBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().max(8).optional(),
  reviewCadence: ReviewCadence.optional(),
});

export const UpdateAreaBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  emoji: z.string().max(8).optional(),
  reviewCadence: ReviewCadence.optional(),
});

const WorkItemBodyShape = {
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
  reminderAt: UtcInstant.optional(),
  reminderLocalDateTime: LocalDateTime.optional(),
  blockedBy: z.string().optional(),
  waitingOn: z.string().optional(),
  links: z.array(z.string()).optional(),
  reviewAt: CalendarDate.optional(),
  startAt: UtcInstant.optional(),
  dueAt: CalendarDate.optional(),
  scheduledFor: CalendarDate.optional(),
  scheduledForRelative: z.enum(['today', 'tomorrow']).optional(),
  todayPinned: z.boolean().optional(),
  sortOrder: z.number().optional(),
  recurrence: Recurrence.optional(),
  rawInput: z.string().optional(),
};

function validateSemanticCalendarFields(
  value: {
    scheduledFor?: string | null;
    scheduledForRelative?: 'today' | 'tomorrow';
    reminderAt?: string | null;
    reminderLocalDateTime?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.scheduledFor !== undefined && value.scheduledFor !== null
    && value.scheduledForRelative !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['scheduledForRelative'],
      message: 'scheduledForRelative is mutually exclusive with scheduledFor',
    });
  }
  if (value.reminderAt !== undefined && value.reminderAt !== null
    && value.reminderLocalDateTime !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['reminderLocalDateTime'],
      message: 'reminderLocalDateTime is mutually exclusive with reminderAt',
    });
  }
}

export const CreateWorkItemBody = z.object(WorkItemBodyShape)
  .superRefine(validateSemanticCalendarFields);

export const UpdateWorkItemBody = z.object(WorkItemBodyShape).partial().extend({
  projectId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  estimateMinutes: z.number().int().nonnegative().nullable().optional(),
  reminderAt: UtcInstant.nullable().optional(),
  blockedBy: z.string().nullable().optional(),
  waitingOn: z.string().nullable().optional(),
  reviewAt: CalendarDate.nullable().optional(),
  startAt: UtcInstant.nullable().optional(),
  dueAt: CalendarDate.nullable().optional(),
  scheduledFor: CalendarDate.nullable().optional(),
  sortOrder: z.number().nullable().optional(),
  recurrence: Recurrence.nullable().optional(),
  rawInput: z.string().nullable().optional(),
}).superRefine(validateSemanticCalendarFields);

export const ListWorkItemsQuery = z.object({
  status: z
    .union([Status, z.array(Status)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  kind: z
    .union([Kind, z.array(Kind)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  areaId: z.string().optional(),
  projectId: z.string().optional(),
  parentId: z.string().optional(),
  parentIsNull: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  q: z.string().optional(),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  dueBefore: CalendarDate.optional(),
  todayPinned: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  label: z.string().optional(),
  scheduledFrom: CalendarDate.optional(),
  scheduledTo: CalendarDate.optional(),
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
