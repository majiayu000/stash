import type { Area, CreateAreaInput, UpdateAreaInput } from '@stash/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

interface AreaListResponse {
  data: Area[];
}

interface AreaResponse {
  data: Area;
}

export async function listAreas(): Promise<Area[]> {
  const res = await apiGet<AreaListResponse>('/areas');
  return res.data;
}

export async function createArea(input: CreateAreaInput): Promise<Area> {
  const res = await apiPost<AreaResponse>('/areas', input);
  return res.data;
}

export async function updateArea(id: string, input: UpdateAreaInput): Promise<Area> {
  const res = await apiPatch<AreaResponse>(`/areas/${id}`, input);
  return res.data;
}

export async function deleteArea(id: string): Promise<void> {
  await apiDelete<void>(`/areas/${id}`);
}
