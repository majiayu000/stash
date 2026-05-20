import { apiGet, apiPost } from './client';
import type { DispatchRun } from '@stash/shared';

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
  run: DispatchRun;
}

export async function startSession(input: DispatchInput): Promise<DispatchResult> {
  const res = await apiPost<{ data: DispatchResult }>('/sessions/start', input);
  return res.data;
}

export async function composeSession(input: DispatchInput): Promise<ComposeResult> {
  const res = await apiPost<{ data: ComposeResult }>('/sessions/compose', input);
  return res.data;
}

export async function listDispatchRuns(workItemId?: string): Promise<DispatchRun[]> {
  const query = workItemId ? `?workItemId=${encodeURIComponent(workItemId)}` : '';
  const res = await apiGet<{ data: DispatchRun[] }>(`/sessions/runs${query}`);
  return res.data;
}

export async function closeDispatchRun(id: string): Promise<DispatchRun> {
  const res = await apiPost<{ data: DispatchRun }>(`/sessions/runs/${id}/close`, {});
  return res.data;
}
