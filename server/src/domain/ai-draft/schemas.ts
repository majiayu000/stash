import { z } from 'zod';
import {
  AI_GENERATION_FEATURES,
  AI_RUN_SOURCE_KINDS,
  DRAFT_SOURCE_KINDS,
  PRIORITIES,
  WORK_ITEM_KINDS,
  WORK_ITEM_STATUSES,
} from '@stash/shared';

const nonEmptyString = z.string().trim().min(1);

export const SourceSpanSchema = z.object({
  label: z.string().optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  text: nonEmptyString,
}).refine(
  (span) => span.start === undefined || span.end === undefined || span.end >= span.start,
  { message: 'source span end must be greater than or equal to start' },
);

export const ChecklistItemSchema = z.object({
  id: nonEmptyString,
  text: nonEmptyString,
  completed: z.boolean(),
});

export const CreateAiGenerationRunSchema = z.object({
  feature: z.enum(AI_GENERATION_FEATURES),
  sourceKind: z.enum(AI_RUN_SOURCE_KINDS),
  sourceWorkItemId: z.string().optional(),
  sourceRecordId: z.string().optional(),
  sourcePath: z.string().optional(),
  provider: nonEmptyString,
  model: z.string().optional(),
  promptHash: nonEmptyString,
  status: z.enum(['pending', 'succeeded', 'failed', 'accepted', 'discarded']).optional(),
  rawResponseJson: z.string().optional(),
  error: z.string().optional(),
});

export const CreateDecisionDraftSchema = z.object({
  sourceKind: z.enum(DRAFT_SOURCE_KINDS),
  sourceWorkItemId: z.string().optional(),
  sourceRecordId: z.string().optional(),
  sourcePath: z.string().optional(),
  sourceSpans: z.array(SourceSpanSchema).optional(),
  proposedTitle: nonEmptyString,
  proposedDescription: z.string().optional(),
  proposedKind: z.enum(WORK_ITEM_KINDS).optional(),
  proposedPriority: z.enum(PRIORITIES).optional(),
  proposedLabels: z.array(z.string()).optional(),
  proposedScheduledFor: z.string().optional(),
  proposedDueAt: z.string().optional(),
  proposedChecklist: z.array(ChecklistItemSchema).optional(),
  sortOrder: z.number().optional(),
  reviewFlags: z.array(z.enum(['high_risk', 'unclear', 'missing_source_span'])).optional(),
  reviewReason: z.string().optional(),
});

export const AcceptDecisionDraftSchema = z.object({
  draftId: nonEmptyString,
  title: nonEmptyString.optional(),
  description: z.string().optional(),
  kind: z.enum(WORK_ITEM_KINDS).optional(),
  priority: z.enum(PRIORITIES).optional(),
  labels: z.array(z.string()).optional(),
  scheduledFor: z.string().optional(),
  dueAt: z.string().optional(),
  checklist: z.array(ChecklistItemSchema).optional(),
});

export const AcceptDecisionDraftsSchema = z.object({
  drafts: z.array(AcceptDecisionDraftSchema).min(1),
  sourceIdeaStatus: z.enum(WORK_ITEM_STATUSES).optional().refine(
    (status) => status === undefined || status === 'planned' || status === 'done',
    { message: 'sourceIdeaStatus must be planned or done' },
  ),
});
