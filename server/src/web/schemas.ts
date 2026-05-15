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
});

export const UpdateWorkItemBody = CreateWorkItemBody.partial();

export const ListWorkItemsQuery = z.object({
  status: z
    .union([Status, z.array(Status)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  areaId: z.string().optional(),
  projectId: z.string().optional(),
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

export const ChecklistAppendBody = z.object({ text: z.string().min(1) });
export const ChecklistUpdateBody = z.object({
  text: z.string().min(1).optional(),
  toggle: z.boolean().optional(),
});

export type CreateAreaInputDto = z.infer<typeof CreateAreaBody>;
export type CreateWorkItemInputDto = z.infer<typeof CreateWorkItemBody>;
