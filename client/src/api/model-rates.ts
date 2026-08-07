import type { ModelRate, ModelRateOverride, UpsertModelRateInput } from '@stash/shared';
import { apiDelete, apiGet, apiPut } from './client';

export interface ModelRateCard {
  /** What the user configured. */
  overrides: ModelRateOverride[];
  /** Overrides merged over the shipped defaults — what costing actually uses. */
  effective: ModelRate[];
}

interface CardResp { data: ModelRateCard }
interface ItemResp { data: ModelRateOverride }

export async function getModelRates(): Promise<ModelRateCard> {
  const res = await apiGet<CardResp>('/model-rates');
  return res.data;
}

export async function upsertModelRate(input: UpsertModelRateInput): Promise<ModelRateOverride> {
  const res = await apiPut<ItemResp>('/model-rates', input);
  return res.data;
}

export async function deleteModelRate(model: string): Promise<void> {
  await apiDelete<void>(`/model-rates/${encodeURIComponent(model)}`);
}
