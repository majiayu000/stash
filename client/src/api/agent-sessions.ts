import type { AgentProvider, AgentSession, AgentSessionEvent } from '@stash/shared';
import { apiDelete, apiGet, apiPost } from './client';

export interface AgentSessionWithLinks extends AgentSession {
  linkedWorkItemIds: string[];
}

interface ListResponse {
  data: AgentSessionWithLinks[];
  errors: { provider: string; sourcePath: string; message: string }[];
  count: number;
}

interface EventsResponse {
  data: AgentSessionEvent[];
  count: number;
}

export interface SessionsScan {
  sessions: AgentSessionWithLinks[];
  errors: { provider: string; sourcePath: string; message: string }[];
}

export async function listAgentSessions(provider: AgentProvider | 'all' = 'all'): Promise<SessionsScan> {
  const res = await apiGet<ListResponse>('/agent-sessions', { provider });
  return { sessions: res.data, errors: res.errors };
}

export async function getAgentSessionEvents(
  provider: AgentProvider,
  id: string,
): Promise<AgentSessionEvent[]> {
  const res = await apiGet<EventsResponse>(`/agent-sessions/${provider}/${encodeURIComponent(id)}/events`);
  return res.data;
}

/** SPEC v0.3 §3h — regex-extracted decision candidates from a session's JSONL. */
export interface DecisionCandidate {
  raw: string;
  title: string;
  timestamp: string;
}

export async function getDecisionCandidates(
  provider: AgentProvider,
  id: string,
): Promise<DecisionCandidate[]> {
  const res = await apiGet<{ data: DecisionCandidate[] }>(
    `/agent-sessions/${provider}/${encodeURIComponent(id)}/decision-candidates`,
  );
  return res.data;
}

export interface LinkedSessionEdge {
  workItemId: string;
  provider: AgentProvider;
  sessionId: string;
  linkedAt: string;
}

export async function linkSession(
  workItemId: string,
  provider: AgentProvider,
  sessionId: string,
): Promise<LinkedSessionEdge> {
  const res = await apiPost<{ data: LinkedSessionEdge }>(
    `/work-items/${workItemId}/link-session`,
    { provider, sessionId },
  );
  return res.data;
}

export async function unlinkSession(
  workItemId: string,
  provider: AgentProvider,
  sessionId: string,
): Promise<void> {
  await apiDelete<void>(
    `/work-items/${workItemId}/link-session/${provider}/${encodeURIComponent(sessionId)}`,
  );
}

export async function listLinkedSessions(workItemId: string): Promise<LinkedSessionEdge[]> {
  const res = await apiGet<{ data: LinkedSessionEdge[] }>(`/work-items/${workItemId}/sessions`);
  return res.data;
}
