import type { AgentProvider, AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, SourceParseError, SourceScanCacheStats } from './source.js';

export interface AggregateOptions {
  limitPerSource?: number;
  provider?: AgentProvider | 'all';
}

export interface AggregateResult {
  sessions: AgentSession[];
  errors: SourceParseError[];
  cache: AggregateScanCacheStats;
}

export interface AggregateScanCacheStats {
  refreshState: 'fresh' | 'refreshing';
  generatedAt: string;
  filesSeen: number;
  filesIndexed: number;
  filesReused: number;
  sources: SourceScanCacheStats[];
}

export class AgentSourceAggregator {
  private readonly inflight = new Map<string, Promise<AggregateResult>>();

  constructor(private readonly sources: Map<AgentProvider, { source: AgentSource; root: string }>) {}

  scan(options: AggregateOptions = {}): AggregateResult {
    const wanted = options.provider && options.provider !== 'all' ? [options.provider] : ['claude', 'codex'] as AgentProvider[];
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];
    const sourceStats: SourceScanCacheStats[] = [];

    for (const provider of wanted) {
      const entry = this.sources.get(provider);
      if (!entry) continue;
      try {
        const r = entry.source.scan({ root: entry.root, limit: options.limitPerSource });
        sessions.push(...r.sessions);
        errors.push(...r.errors);
        if (r.cache) sourceStats.push(r.cache);
      } catch (e) {
        errors.push({
          provider,
          sourcePath: entry.root,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    sessions.sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1));
    return { sessions, errors, cache: aggregateCacheStats(sourceStats, 'fresh') };
  }

  scanAsync(options: AggregateOptions = {}): Promise<AggregateResult> {
    const key = scanKey(options);
    const current = this.inflight.get(key);
    if (current) return current;

    const pending = Promise.resolve()
      .then(() => this.scan(options))
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, pending);
    return pending;
  }

  getEvents(provider: AgentProvider, sourcePath: string): AgentSessionEvent[] {
    const entry = this.sources.get(provider);
    if (!entry) return [];
    return entry.source.getEvents(sourcePath);
  }

  getUsage(provider: AgentProvider, sourcePath: string): UsageEvent[] {
    const entry = this.sources.get(provider);
    if (!entry) return [];
    return entry.source.getUsage(sourcePath);
  }

  has(provider: AgentProvider): boolean {
    return this.sources.has(provider);
  }
}

function scanKey(options: AggregateOptions): string {
  return JSON.stringify({
    provider: options.provider ?? 'all',
    limitPerSource: options.limitPerSource ?? 0,
  });
}

function aggregateCacheStats(
  sources: SourceScanCacheStats[],
  refreshState: AggregateScanCacheStats['refreshState'],
): AggregateScanCacheStats {
  let filesSeen = 0;
  let filesIndexed = 0;
  let filesReused = 0;
  for (const source of sources) {
    filesSeen += source.filesSeen;
    filesIndexed += source.filesIndexed;
    filesReused += source.filesReused;
  }
  return {
    refreshState,
    generatedAt: new Date().toISOString(),
    filesSeen,
    filesIndexed,
    filesReused,
    sources,
  };
}
