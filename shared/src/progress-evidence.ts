import type { AgentProvider } from './agent-session.js';

export type EvidenceKind =
  | 'plan_task'
  | 'tool_call'
  | 'assistant_summary'
  | 'file_change'
  | 'manual_note';

export interface ProgressEvidence {
  id: string;
  workItemId: string;
  sessionId?: string;
  provider?: AgentProvider;
  kind: EvidenceKind;
  text: string;
  sourcePath?: string;
  timestamp: string;
  // Set when an inferred completion is suggested but not yet accepted.
  pendingAcceptance?: boolean;
}

export interface CreateEvidenceInput {
  workItemId: string;
  sessionId?: string;
  provider?: AgentProvider;
  kind: EvidenceKind;
  text: string;
  sourcePath?: string;
  pendingAcceptance?: boolean;
}
