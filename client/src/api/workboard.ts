import type { AgentSession, WorkItem } from '@stash/shared';
import { apiGet } from './client';

export interface ProjectSummary {
  projectId: string;
  itemCount: number;
  activeCount: number;
  blockedCount: number;
  items: WorkItem[];
  sessions: AgentSession[];
}

export interface WorkboardData {
  projects: ProjectSummary[];
  unassigned: WorkItem[];
  parseErrors: { provider: string; sourcePath: string; message: string }[];
}

export async function getWorkboard(): Promise<WorkboardData> {
  const res = await apiGet<{ data: WorkboardData }>('/workboard');
  return res.data;
}
