import { apiPost } from './client';

export interface DispatchInput {
  workItemId: string;
  tool: 'claude' | 'codex';
  extraInstructions?: string;
}

export interface DispatchResult {
  prompt: string;
  promptFile: string;
  suggestedCommand: string;
  spawned: boolean;
  pid?: number;
  spawnError?: string;
}

export async function startSession(input: DispatchInput): Promise<DispatchResult> {
  const res = await apiPost<{ data: DispatchResult }>('/sessions/start', input);
  return res.data;
}
