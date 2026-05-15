import type { CreateEvidenceInput, ProgressEvidence, WorkItem } from '@stash/shared';
import { apiGet, apiPost } from './client';

interface ListResponse {
  data: ProgressEvidence[];
  count: number;
}

interface ItemResponse {
  data: ProgressEvidence;
}

export async function listEvidence(params: {
  workItemId?: string;
  pendingOnly?: boolean;
}): Promise<ProgressEvidence[]> {
  const query: Record<string, string | undefined> = {};
  if (params.workItemId) query.workItemId = params.workItemId;
  if (params.pendingOnly !== undefined) query.pendingOnly = String(params.pendingOnly);
  const res = await apiGet<ListResponse>('/evidence', query);
  return res.data;
}

export async function createEvidence(input: CreateEvidenceInput): Promise<ProgressEvidence> {
  const res = await apiPost<ItemResponse>('/evidence', input);
  return res.data;
}

export async function inferEvidence(workItemId: string): Promise<ProgressEvidence[]> {
  const res = await apiPost<ListResponse>(`/evidence/infer/${workItemId}`, {});
  return res.data;
}

export async function acceptCompletion(workItemId: string): Promise<WorkItem> {
  const res = await apiPost<{ data: WorkItem }>(
    `/work-items/${workItemId}/accept-completion`,
    {},
  );
  return res.data;
}

export async function rejectCompletion(workItemId: string): Promise<number> {
  const res = await apiPost<{ data: { cleared: number } }>(
    `/work-items/${workItemId}/reject-completion`,
    {},
  );
  return res.data.cleared;
}
