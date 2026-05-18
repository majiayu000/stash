import { apiPost } from './client';

export interface DispatchInput {
  workItemId: string;
  tool: 'claude' | 'codex';
  extraInstructions?: string;
}

export interface ComposeResult {
  prompt: string;
  promptFile: string;
  suggestedCommand: string;
}

export interface DispatchResult extends ComposeResult {
  spawned: boolean;
  pid?: number;
  spawnError?: string;
}

export async function startSession(input: DispatchInput): Promise<DispatchResult> {
  const res = await apiPost<{ data: DispatchResult }>('/sessions/start', input);
  return res.data;
}

export async function composeSession(input: DispatchInput): Promise<ComposeResult> {
  const res = await apiPost<{ data: ComposeResult }>('/sessions/compose', input);
  return res.data;
}
