import type { CreateWorkItemInput, UpdateWorkItemInput, WorkItem, WorkItemStatus } from '@stash/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface WorkItemFilter {
  status?: WorkItemStatus | WorkItemStatus[];
  areaId?: string;
  projectId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  scheduledIsNull?: boolean;
  includeDropped?: boolean;
}

interface ListResponse {
  data: WorkItem[];
  count: number;
}

interface ItemResponse {
  data: WorkItem;
}

export async function listWorkItems(filter: WorkItemFilter = {}): Promise<WorkItem[]> {
  const query: Record<string, string | string[] | undefined> = {};
  if (filter.status) {
    query.status = Array.isArray(filter.status) ? filter.status : [filter.status];
  }
  if (filter.areaId) query.areaId = filter.areaId;
  if (filter.projectId) query.projectId = filter.projectId;
  if (filter.scheduledFrom) query.scheduledFrom = filter.scheduledFrom;
  if (filter.scheduledTo) query.scheduledTo = filter.scheduledTo;
  if (filter.scheduledIsNull !== undefined) {
    query.scheduledIsNull = String(filter.scheduledIsNull);
  }
  if (filter.includeDropped !== undefined) {
    query.includeDropped = String(filter.includeDropped);
  }
  const res = await apiGet<ListResponse>('/work-items', query);
  return res.data;
}

export async function createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
  const res = await apiPost<ItemResponse>('/work-items', input);
  return res.data;
}

export async function updateWorkItem(id: string, input: UpdateWorkItemInput): Promise<WorkItem> {
  const res = await apiPatch<ItemResponse>(`/work-items/${id}`, input);
  return res.data;
}

export async function deleteWorkItem(id: string): Promise<void> {
  await apiDelete<void>(`/work-items/${id}`);
}

export async function appendChecklist(id: string, text: string): Promise<WorkItem> {
  const res = await apiPost<ItemResponse>(`/work-items/${id}/checklist`, { text });
  return res.data;
}

export async function toggleChecklist(id: string, itemId: string): Promise<WorkItem> {
  const res = await apiPatch<ItemResponse>(`/work-items/${id}/checklist/${itemId}`, { toggle: true });
  return res.data;
}

export async function removeChecklist(id: string, itemId: string): Promise<WorkItem> {
  const res = await apiDelete<ItemResponse>(`/work-items/${id}/checklist/${itemId}`);
  return res.data;
}
