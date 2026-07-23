export type AgentProvider = 'claude' | 'codex';

export type AgentSessionStatus =
  | 'running'
  | 'waiting'
  | 'idle'
  | 'lost'
  | 'completed';

export interface AgentSession {
  id: string;
  provider: AgentProvider;
  sourcePath: string;
  cwd: string;
  projectId?: string;
  linkedWorkItemId?: string;
  status: AgentSessionStatus;
  title: string;
  initialPrompt?: string;
  lastMessage?: string;
  lastTool?: string;
  lastToolInput?: string;
  filesTouched: string[];
  toolCount: number;
  messageCount: number;
  /** Latest model the session ran on, parsed from JSONL (Claude: message.model, Codex: turn_context.model). */
  model?: string;
  startedAt?: string;
  lastActiveAt: string;
}

export type AgentSessionEventKind =
  | 'user'
  | 'assistant'
  | 'tool_call'
  | 'tool_output'
  | 'system'
  | 'plan';

export interface AgentSessionEvent {
  kind: AgentSessionEventKind;
  text: string;
  timestamp: string;
  tool?: string;
  callId?: string;
  meta?: Record<string, unknown>;
  /** True when an oversized event was shortened to enforce the API payload bound. */
  truncated?: boolean;
}

export interface AgentSessionEventSummary {
  totalToolCalls: number;
  totalFiles: number;
  toolCalls: Array<{ name: string; count: number }>;
  filesTouched: Array<{ path: string; count: number }>;
}

export interface AgentSessionEventPage {
  data: AgentSessionEvent[];
  page: {
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
    totalEvents: number;
    responseBytes: number;
  };
  summary: AgentSessionEventSummary;
}
