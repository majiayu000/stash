import type {
  ChecklistItem,
  Priority,
  WorkItemKind,
  WorkItemStatus,
} from './work-item.js';

export const AI_GENERATION_FEATURES = [
  'idea_decomposition',
  'task_coach',
  'coach_summary',
  'meeting_triage',
  'session_inferred',
  'manual_split',
] as const;

export type AiGenerationFeature = (typeof AI_GENERATION_FEATURES)[number];

export const AI_RUN_SOURCE_KINDS = [
  'idea_decomposition',
  'meeting_triage',
  'session_inferred',
  'manual_split',
  'task_coach',
  'coach_summary',
] as const;

export type AiRunSourceKind = (typeof AI_RUN_SOURCE_KINDS)[number];

export const DRAFT_SOURCE_KINDS = [
  'idea_decomposition',
  'meeting_triage',
  'session_inferred',
  'manual_split',
] as const;

export type DraftSourceKind = (typeof DRAFT_SOURCE_KINDS)[number];

export type AiGenerationStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'accepted'
  | 'discarded';

export type DecisionDraftStatus = 'draft' | 'accepted' | 'rejected' | 'edited';

export type DecisionDraftReviewFlag =
  | 'high_risk'
  | 'unclear'
  | 'missing_source_span';

export interface SourceSpan {
  label?: string;
  start?: number;
  end?: number;
  text: string;
}

export interface AiGenerationRun {
  id: string;
  feature: AiGenerationFeature;
  sourceKind: AiRunSourceKind;
  sourceWorkItemId?: string;
  sourceRecordId?: string;
  sourcePath?: string;
  provider: string;
  model?: string;
  promptHash: string;
  status: AiGenerationStatus;
  rawResponseJson?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
}

export interface DecisionDraft {
  id: string;
  runId: string;
  sourceKind: DraftSourceKind;
  sourceWorkItemId?: string;
  sourceRecordId?: string;
  sourcePath?: string;
  sourceSpans: SourceSpan[];
  proposedTitle: string;
  proposedDescription?: string;
  proposedKind: WorkItemKind;
  proposedPriority: Priority;
  proposedLabels: string[];
  proposedScheduledFor?: string;
  proposedDueAt?: string;
  proposedChecklist: ChecklistItem[];
  sortOrder?: number;
  status: DecisionDraftStatus;
  reviewFlags: DecisionDraftReviewFlag[];
  reviewReason?: string;
  rejectReason?: string;
  createdWorkItemId?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiGenerationRunInput {
  feature: AiGenerationFeature;
  sourceKind: AiRunSourceKind;
  sourceWorkItemId?: string;
  sourceRecordId?: string;
  sourcePath?: string;
  provider: string;
  model?: string;
  promptHash: string;
  status?: AiGenerationStatus;
  rawResponseJson?: string;
  error?: string;
}

export interface CreateDecisionDraftInput {
  sourceKind: DraftSourceKind;
  sourceWorkItemId?: string;
  sourceRecordId?: string;
  sourcePath?: string;
  sourceSpans?: SourceSpan[];
  proposedTitle: string;
  proposedDescription?: string;
  proposedKind?: WorkItemKind;
  proposedPriority?: Priority;
  proposedLabels?: string[];
  proposedScheduledFor?: string;
  proposedDueAt?: string;
  proposedChecklist?: ChecklistItem[];
  sortOrder?: number;
  reviewFlags?: DecisionDraftReviewFlag[];
  reviewReason?: string;
}

export interface AcceptDecisionDraftInput {
  draftId: string;
  title?: string;
  description?: string;
  kind?: WorkItemKind;
  priority?: Priority;
  labels?: string[];
  scheduledFor?: string;
  dueAt?: string;
  checklist?: ChecklistItem[];
  reviewed?: true;
}

export interface AcceptDecisionDraftsInput {
  drafts: AcceptDecisionDraftInput[];
  sourceIdeaStatus?: Extract<WorkItemStatus, 'planned' | 'done'>;
}
