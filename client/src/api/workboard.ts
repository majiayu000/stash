import type { AgentSession } from '@stash/shared';
import { apiGet } from './client';

/** Sessions linked to one project's work items. Work items are not repeated here. */
export interface ProjectSessionGroup {
  projectId: string;
  sessions: AgentSession[];
}

export interface WorkboardData {
  projects: ProjectSessionGroup[];
  parseErrors: { provider: string; sourcePath: string; message: string }[];
}

export async function getWorkboard(): Promise<WorkboardData> {
  const res = await apiGet<{ data: WorkboardData }>('/workboard');
  return res.data;
}
