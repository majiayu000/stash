import type { AgentProvider } from '@stash/shared';
import { listAgentSessions, type SessionsScan } from '../api/agent-sessions';
import { useAsync, type AsyncState } from './useAsync';

export function useAgentSessions(
  provider: AgentProvider | 'all' = 'all',
): AsyncState<SessionsScan> {
  return useAsync<SessionsScan>(() => listAgentSessions(provider), [provider]);
}
