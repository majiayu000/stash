import type { AgentProvider, AgentSession, UsageEvent } from '@stash/shared';
import type { SessionFileFingerprint } from './session-cache.js';

export interface AnalyticsCacheEntry {
  fingerprint: SessionFileFingerprint;
  activeSinceMs: number;
  session: AgentSession;
  usage: UsageEvent[];
}

export function createAnalyticsSession(
  provider: AgentProvider,
  sourcePath: string,
  lastActiveAt: string,
): AgentSession {
  return {
    id: sourcePath,
    provider,
    sourcePath,
    cwd: '',
    status: 'lost',
    title: '',
    filesTouched: [],
    toolCount: 0,
    messageCount: 0,
    lastActiveAt,
  };
}

export function isFreshAnalyticsEntry(
  cached: AnalyticsCacheEntry | undefined,
  fingerprint: SessionFileFingerprint,
  activeSinceMs: number,
): cached is AnalyticsCacheEntry {
  return cached !== undefined
    && cached.activeSinceMs === activeSinceMs
    && Math.abs(cached.fingerprint.mtimeMs - fingerprint.mtimeMs) < 0.001
    && cached.fingerprint.sizeBytes === fingerprint.sizeBytes;
}
