import type { AgentProvider, AgentSession, AgentSessionEvent } from '@stash/shared';
import type { DecisionCandidateRecord } from '@stash/shared';
import { apiDelete, apiGet, apiPost } from './client';

export interface AgentSessionWithLinks extends AgentSession {
  linkedWorkItemIds: string[];
}

export interface SourceHealthError {
  provider: string;
  sourcePath: string;
  message: string;
}

interface ListResponse {
  data: AgentSessionWithLinks[];
  errors: SourceHealthError[];
  count: number;
}

interface EventsResponse {
  data: AgentSessionEvent[];
  count: number;
}

export interface SessionsScan {
  sessions: AgentSessionWithLinks[];
  errors: SourceHealthError[];
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

export async function getDecisionCandidates(
  provider: AgentProvider,
  id: string,
  projectId?: string,
): Promise<DecisionCandidateRecord[]> {
  const res = await apiGet<{ data: DecisionCandidateRecord[] }>(
    `/agent-sessions/${provider}/${encodeURIComponent(id)}/decision-candidates`,
    { projectId },
  );
  return res.data;
}

export async function acceptDecisionCandidate(candidateId: string, decisionId: string): Promise<DecisionCandidateRecord> {
  const res = await apiPost<{ data: DecisionCandidateRecord }>(
    `/agent-sessions/decision-candidates/${encodeURIComponent(candidateId)}/accept`,
    { decisionId },
  );
  return res.data;
}

export async function ignoreDecisionCandidate(candidateId: string): Promise<DecisionCandidateRecord> {
  const res = await apiPost<{ data: DecisionCandidateRecord }>(
    `/agent-sessions/decision-candidates/${encodeURIComponent(candidateId)}/ignore`,
    {},
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
