import type {
  CreateDecisionInput,
  CreateLessonInput,
  CreateMilestoneInput,
  Decision,
  Lesson,
  Milestone,
  ProjectIntent,
  ProjectNotes,
  UpdateDecisionInput,
  UpdateLessonInput,
  UpdateMilestoneInput,
} from '@stash/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

interface IntentResp     { data: ProjectIntent | null }
interface IntentSetResp  { data: ProjectIntent }
interface MilestoneListResp { data: Milestone[] }
interface MilestoneResp     { data: Milestone }
interface DecisionListResp  { data: Decision[] }
interface DecisionResp      { data: Decision }
interface NotesResp     { data: ProjectNotes | null }
interface NotesSetResp  { data: ProjectNotes }
interface LessonListResp { data: Lesson[] }
interface LessonResp     { data: Lesson }

// ─── intent ───────────────────────────────────────────────────────────────

export async function getProjectIntent(projectId: string): Promise<ProjectIntent | null> {
  const res = await apiGet<IntentResp>(`/projects/${projectId}/intent`);
  return res.data;
}

export async function setProjectIntent(projectId: string, text: string): Promise<ProjectIntent> {
  const res = await apiPut<IntentSetResp>(`/projects/${projectId}/intent`, { text });
  return res.data;
}

// ─── milestones ───────────────────────────────────────────────────────────

export async function listMilestones(projectId: string): Promise<Milestone[]> {
  const res = await apiGet<MilestoneListResp>(`/projects/${projectId}/milestones`);
  return res.data;
}

export async function createMilestone(projectId: string, input: CreateMilestoneInput): Promise<Milestone> {
  const res = await apiPost<MilestoneResp>(`/projects/${projectId}/milestones`, input);
  return res.data;
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<Milestone> {
  const res = await apiPatch<MilestoneResp>(`/projects/${projectId}/milestones/${milestoneId}`, input);
  return res.data;
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<void> {
  await apiDelete<void>(`/projects/${projectId}/milestones/${milestoneId}`);
}

// ─── decisions ────────────────────────────────────────────────────────────

export async function listDecisions(projectId: string): Promise<Decision[]> {
  const res = await apiGet<DecisionListResp>(`/projects/${projectId}/decisions`);
  return res.data;
}

export async function createDecision(projectId: string, input: CreateDecisionInput): Promise<Decision> {
  const res = await apiPost<DecisionResp>(`/projects/${projectId}/decisions`, input);
  return res.data;
}

export async function updateDecision(
  projectId: string,
  decisionId: string,
  input: UpdateDecisionInput,
): Promise<Decision> {
  const res = await apiPatch<DecisionResp>(`/projects/${projectId}/decisions/${decisionId}`, input);
  return res.data;
}

export async function deleteDecision(projectId: string, decisionId: string): Promise<void> {
  await apiDelete<void>(`/projects/${projectId}/decisions/${decisionId}`);
}

// ─── notes ────────────────────────────────────────────────────────────────

export async function getProjectNotes(projectId: string): Promise<ProjectNotes | null> {
  const res = await apiGet<NotesResp>(`/projects/${projectId}/notes`);
  return res.data;
}

export async function setProjectNotes(projectId: string, markdown: string): Promise<ProjectNotes> {
  const res = await apiPut<NotesSetResp>(`/projects/${projectId}/notes`, { markdown });
  return res.data;
}

// ─── lessons ──────────────────────────────────────────────────────────────

export async function listLessons(filter?: { projectId?: string; crossOnly?: boolean }): Promise<Lesson[]> {
  const params = new URLSearchParams();
  if (filter?.projectId) params.set('projectId', filter.projectId);
  if (filter?.crossOnly) params.set('crossOnly', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await apiGet<LessonListResp>(`/lessons${qs}`);
  return res.data;
}

export async function createLesson(input: CreateLessonInput): Promise<Lesson> {
  const res = await apiPost<LessonResp>('/lessons', input);
  return res.data;
}

export async function updateLesson(id: string, input: UpdateLessonInput): Promise<Lesson> {
  const res = await apiPatch<LessonResp>(`/lessons/${id}`, input);
  return res.data;
}

export async function deleteLesson(id: string): Promise<void> {
  await apiDelete<void>(`/lessons/${id}`);
}
