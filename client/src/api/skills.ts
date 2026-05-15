import type { CreateSkillInput, ProjectSkillBinding, Skill, UpdateSkillInput } from '@stash/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

interface SkillListResponse { data: Skill[] }
interface SkillResponse     { data: Skill }
interface BindingListResponse { data: ProjectSkillBinding[] }
interface BindingResponse     { data: ProjectSkillBinding }

export async function listSkills(filter?: { installed?: boolean }): Promise<Skill[]> {
  const qs = filter?.installed !== undefined ? `?installed=${filter.installed}` : '';
  const res = await apiGet<SkillListResponse>(`/skills${qs}`);
  return res.data;
}

export async function getSkill(id: string): Promise<Skill> {
  const res = await apiGet<SkillResponse>(`/skills/${id}`);
  return res.data;
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const res = await apiPost<SkillResponse>('/skills', input);
  return res.data;
}

export async function updateSkill(id: string, input: UpdateSkillInput): Promise<Skill> {
  const res = await apiPatch<SkillResponse>(`/skills/${id}`, input);
  return res.data;
}

export async function deleteSkill(id: string): Promise<void> {
  await apiDelete<void>(`/skills/${id}`);
}

export async function listProjectSkills(projectId: string): Promise<ProjectSkillBinding[]> {
  const res = await apiGet<BindingListResponse>(`/projects/${projectId}/skills`);
  return res.data;
}

export async function setProjectSkills(projectId: string, skillIds: string[]): Promise<ProjectSkillBinding[]> {
  const res = await apiPut<BindingListResponse>(`/projects/${projectId}/skills`, { skillIds });
  return res.data;
}

export async function toggleProjectSkill(projectId: string, skillId: string, enabled: boolean): Promise<ProjectSkillBinding> {
  const res = await apiPost<BindingResponse>(`/projects/${projectId}/skills/${skillId}`, { enabled });
  return res.data;
}

export async function unbindProjectSkill(projectId: string, skillId: string): Promise<void> {
  await apiDelete<void>(`/projects/${projectId}/skills/${skillId}`);
}
