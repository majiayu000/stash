import type {
  AcceptDecisionDraftsInput,
  AiGenerationRun,
  DecisionDraft,
  DecisionDraftStatus,
} from '@stash/shared';
import { apiGet, apiPost } from './client';

export interface DecisionDraftListResponse {
  data: DecisionDraft[];
  runs: AiGenerationRun[];
}

export interface DecomposeIdeaResponse {
  data: {
    run: AiGenerationRun;
    drafts: DecisionDraft[];
  };
}

export async function listDecisionDrafts(filter: {
  status?: DecisionDraftStatus;
  runId?: string;
} = {}): Promise<DecisionDraftListResponse> {
  const query: Record<string, string | undefined> = {
    status: filter.status,
    runId: filter.runId,
  };
  return apiGet<DecisionDraftListResponse>('/work-items/ai-drafts', query);
}

export async function decomposeIdea(workItemId: string, projectContext?: string): Promise<DecomposeIdeaResponse['data']> {
  const res = await apiPost<DecomposeIdeaResponse>(`/work-items/${workItemId}/decompose`, { projectContext });
  return res.data;
}

export async function acceptDecisionDrafts(
  runId: string,
  input: AcceptDecisionDraftsInput,
): Promise<DecisionDraft[]> {
  const res = await apiPost<{ data: DecisionDraft[] }>(`/work-items/ai-runs/${runId}/accept-drafts`, input);
  return res.data;
}

export async function rejectDecisionDraft(draftId: string, reason?: string): Promise<DecisionDraft> {
  const res = await apiPost<{ data: DecisionDraft }>(`/work-items/ai-drafts/${draftId}/reject`, { reason });
  return res.data;
}
