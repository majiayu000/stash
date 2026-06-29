import type { CreateWorkItemInput, JournalEntry, Priority, UpdateWorkItemInput, WorkItem, WorkItemKind, WorkItemStatus } from '@stash/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type CapturePreviewChipType = 'proj' | 'tag' | 'pri' | 'kind' | 'date' | 'due' | 'time' | 'est' | 'unresolved';

export interface CapturePreviewChip {
  type: CapturePreviewChipType;
  label: string;
  value?: string;
}

export interface CaptureParsed {
  title: string;
  projectId?: string;
  areaId?: string;
  projectName?: string;
  labels: string[];
  kind?: WorkItemKind;
  priority?: Priority;
  scheduledFor?: string;
  dueAt?: string;
  startAt?: string;
  estimateMinutes?: number;
  unresolved: string[];
  chips: CapturePreviewChip[];
}

export interface CapturePreviewResponse {
  parsed: CaptureParsed;
}

export interface CaptureResponse extends CapturePreviewResponse {
  data: WorkItem;
}

export interface WorkItemFilter {
  status?: WorkItemStatus | WorkItemStatus[];
  kind?: WorkItemKind | WorkItemKind[];
  areaId?: string;
  projectId?: string;
  parentId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  scheduledIsNull?: boolean;
  includeDropped?: boolean;
  q?: string;
  priority?: Priority;
  dueBefore?: string;
  todayPinned?: boolean;
  label?: string;
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
  if (filter.kind) {
    query.kind = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
  }
  if (filter.areaId) query.areaId = filter.areaId;
  if (filter.projectId) query.projectId = filter.projectId;
  if (filter.parentId) query.parentId = filter.parentId;
  if (filter.scheduledFrom) query.scheduledFrom = filter.scheduledFrom;
  if (filter.scheduledTo) query.scheduledTo = filter.scheduledTo;
  if (filter.scheduledIsNull !== undefined) {
    query.scheduledIsNull = String(filter.scheduledIsNull);
  }
  if (filter.includeDropped !== undefined) {
    query.includeDropped = String(filter.includeDropped);
  }
  if (filter.q) query.q = filter.q;
  if (filter.priority) query.priority = filter.priority;
  if (filter.dueBefore) query.dueBefore = filter.dueBefore;
  if (filter.todayPinned !== undefined) query.todayPinned = String(filter.todayPinned);
  if (filter.label) query.label = filter.label;
  const res = await apiGet<ListResponse>('/work-items', query);
  return res.data;
}

export async function createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
  const res = await apiPost<ItemResponse>('/work-items', input);
  return res.data;
}

export async function getWorkItem(id: string): Promise<WorkItem> {
  const res = await apiGet<ItemResponse>(`/work-items/${id}`);
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

/** SPEC v0.3 §3b/§3f — token-aware quick capture. Returns the saved item + parsed structure. */
export async function captureWorkItem(raw: string): Promise<CaptureResponse> {
  return apiPost<CaptureResponse>('/work-items/capture', { raw });
}

/** SPEC v0.5 §7.1 — server-owned quick capture preview without persistence. */
export async function previewCapture(raw: string): Promise<CapturePreviewResponse> {
  return apiPost<CapturePreviewResponse>('/work-items/capture/preview', { raw });
}

/** SPEC v0.3 §3d — canonical Today list. */
export async function listToday(): Promise<WorkItem[]> {
  const res = await apiGet<ListResponse>('/work-items/today');
  return res.data;
}

/** SPEC v0.3 §3h — inbox/planned items untouched ≥ N days (default 30). */
export async function listStale(days?: number): Promise<WorkItem[]> {
  const qs = days !== undefined ? `?days=${days}` : '';
  const res = await apiGet<ListResponse>(`/work-items/stale${qs}`);
  return res.data;
}

/** SPEC v0.3 §3e — single-keystroke triage helpers. */
export async function togglePin(id: string, pinned: boolean): Promise<WorkItem> {
  const res = await apiPost<ItemResponse>(`/work-items/${id}/today-pin`, { pinned });
  return res.data;
}

export async function setPriority(id: string, priority: Priority): Promise<WorkItem> {
  const res = await apiPost<ItemResponse>(`/work-items/${id}/priority`, { priority });
  return res.data;
}

/** v0.8 — per-todo journal. */
export async function listJournal(workItemId: string): Promise<JournalEntry[]> {
  const res = await apiGet<{ data: JournalEntry[] }>(`/work-items/${workItemId}/journal`);
  return res.data;
}

export async function appendJournal(workItemId: string, body: string): Promise<JournalEntry> {
  const res = await apiPost<{ data: JournalEntry }>(`/work-items/${workItemId}/journal`, { body });
  return res.data;
}

export async function deleteJournalEntry(workItemId: string, entryId: string): Promise<void> {
  await apiDelete<void>(`/work-items/${workItemId}/journal/${entryId}`);
}

/** Systems feature: run a system template to create a fresh checklist instance. */
export async function runSystem(templateId: string, opts: { title?: string; areaId?: string; scheduledFor?: string } = {}): Promise<WorkItem> {
  const res = await apiPost<ItemResponse>(`/work-items/${templateId}/run`, opts);
  return res.data;
}
