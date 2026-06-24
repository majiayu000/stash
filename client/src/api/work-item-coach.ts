import type {
  AiWriteDestination,
  CoachApplySummaryResponse,
  CoachAskResponse,
  CoachSummaryResponse,
  WorkItemCoachMessage,
} from '@stash/shared';
import { apiGet, apiPost } from './client';

export async function listCoachMessages(workItemId: string): Promise<WorkItemCoachMessage[]> {
  const res = await apiGet<{ data: WorkItemCoachMessage[] }>(`/work-items/${workItemId}/coach/messages`);
  return res.data;
}

export async function askCoach(workItemId: string, body: string): Promise<CoachAskResponse> {
  const res = await apiPost<{ data: CoachAskResponse }>(`/work-items/${workItemId}/coach/messages`, { body });
  return res.data;
}

export async function summarizeCoach(
  workItemId: string,
  destination: AiWriteDestination,
  messageIds?: string[],
): Promise<CoachSummaryResponse> {
  const res = await apiPost<{ data: CoachSummaryResponse }>(`/work-items/${workItemId}/coach/summarize`, {
    destination,
    messageIds,
  });
  return res.data;
}

export async function applyCoachSummary(
  workItemId: string,
  input: { runId: string; sourceMessageId: string; destination: AiWriteDestination },
): Promise<CoachApplySummaryResponse> {
  const res = await apiPost<{ data: CoachApplySummaryResponse }>(`/work-items/${workItemId}/coach/apply-summary`, input);
  return res.data;
}
