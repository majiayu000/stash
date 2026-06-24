import type { AiGenerationRun, DecisionDraft, MeetingTriageSource } from '@stash/shared';
import { apiPost } from './client';

export async function importMeetingTriage(input: {
  title?: string;
  text: string;
  sourcePath?: string;
}): Promise<{ source: MeetingTriageSource; run: AiGenerationRun; drafts: DecisionDraft[] }> {
  const res = await apiPost<{ data: { source: MeetingTriageSource; run: AiGenerationRun; drafts: DecisionDraft[] } }>(
    '/meeting-triage/import',
    input,
  );
  return res.data;
}
