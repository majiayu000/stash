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
  meta?: Record<string, unknown>;
}
