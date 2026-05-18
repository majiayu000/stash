import type { Budget, CreateBudgetInput, UpdateBudgetInput } from '@stash/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

interface ListResp { data: Budget[] }
interface ItemResp { data: Budget }

export async function listBudgets(): Promise<Budget[]> {
  const res = await apiGet<ListResp>('/budgets');
  return res.data;
}

export async function createBudget(input: CreateBudgetInput): Promise<Budget> {
  const res = await apiPost<ItemResp>('/budgets', input);
  return res.data;
}

export async function updateBudget(id: string, input: UpdateBudgetInput): Promise<Budget> {
  const res = await apiPatch<ItemResp>(`/budgets/${id}`, input);
  return res.data;
}

export async function deleteBudget(id: string): Promise<void> {
  await apiDelete<void>(`/budgets/${id}`);
}
