import type { AgentProvider } from './agent-session.js';

export type DispatchRunStatus = 'pending' | 'spawned' | 'failed' | 'matched' | 'closed';

export interface DispatchRun {
  id: string;
  workItemId: string;
  provider: AgentProvider;
  cwd: string;
  promptFile: string;
  promptHash: string;
  spawnCommand: string;
  pid?: number;
  status: DispatchRunStatus;
  error?: string;
  matchedSessionId?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export type DecisionCandidateStatus = 'candidate' | 'accepted' | 'ignored';

export interface DecisionCandidateRecord {
  id: string;
  projectId?: string;
  provider: AgentProvider;
  sessionId: string;
  sourcePath: string;
  raw: string;
  title: string;
  timestamp: string;
  status: DecisionCandidateStatus;
  decisionId?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  ignoredAt?: string;
}
