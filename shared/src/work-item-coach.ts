import type { AiGenerationRun } from './ai-draft.js';
import type { JournalEntry, WorkItem } from './work-item.js';

export type CoachMessageRole = 'user' | 'assistant';
export type CoachMessagePurpose = 'chat' | 'summary';
export type AiWriteDestination = 'description' | 'journal' | 'checklist';

export interface WorkItemCoachMessage {
  id: string;
  workItemId: string;
  runId?: string;
  role: CoachMessageRole;
  purpose: CoachMessagePurpose;
  destination?: AiWriteDestination;
  body: string;
  provider?: string;
  model?: string;
  createdAt: string;
}

export interface WorkItemAiWrite {
  id: string;
  workItemId: string;
  runId: string;
  sourceMessageId?: string;
  destination: AiWriteDestination;
  body: string;
  createdJournalEntryId?: string;
  createdAt: string;
}

export interface CoachAskResponse {
  userMessage: WorkItemCoachMessage;
  assistantMessage: WorkItemCoachMessage;
  run: AiGenerationRun;
  suggestedActions: string[];
}

export interface CoachSummaryResponse {
  message: WorkItemCoachMessage;
  run: AiGenerationRun;
  destination: AiWriteDestination;
}

export interface CoachApplySummaryResponse {
  write: WorkItemAiWrite;
  item?: WorkItem;
  journalEntry?: JournalEntry;
}
