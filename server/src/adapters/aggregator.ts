import type { AgentProvider, AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, SourceParseError } from './source.js';

export interface AggregateOptions {
  limitPerSource?: number;
  provider?: AgentProvider | 'all';
}

export interface AggregateResult {
  sessions: AgentSession[];
  errors: SourceParseError[];
}

interface CacheEntry {
  at: number;
  result: AggregateResult;
}

export class AgentSourceAggregator {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly sources: Map<AgentProvider, { source: AgentSource; root: string }>,
    private readonly options: { cacheTtlMs?: number; now?: () => number } = {},
  ) {}

  scan(options: AggregateOptions = {}): AggregateResult {
    const cacheKey = this.cacheKey(options);
    const now = this.options.now?.() ?? Date.now();
    const ttl = this.options.cacheTtlMs ?? 1_000;
    const cached = ttl > 0 ? this.cache.get(cacheKey) : undefined;
    if (cached && now - cached.at <= ttl) return cloneResult(cached.result);

    const wanted = options.provider && options.provider !== 'all' ? [options.provider] : ['claude', 'codex'] as AgentProvider[];
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];

    for (const provider of wanted) {
      const entry = this.sources.get(provider);
      if (!entry) continue;
      try {
        const r = entry.source.scan({ root: entry.root, limit: options.limitPerSource });
        sessions.push(...r.sessions);
        errors.push(...r.errors);
      } catch (e) {
        errors.push({
          provider,
          sourcePath: entry.root,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    sessions.sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1));
    const result = { sessions, errors };
    if (ttl > 0) this.cache.set(cacheKey, { at: now, result });
    return cloneResult(result);
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

  private cacheKey(options: AggregateOptions): string {
    return JSON.stringify({
      provider: options.provider ?? 'all',
      limitPerSource: options.limitPerSource ?? 0,
    });
  }
}

function cloneResult(result: AggregateResult): AggregateResult {
  return {
    sessions: result.sessions.map((s) => ({ ...s, filesTouched: [...s.filesTouched] })),
    errors: result.errors.map((e) => ({ ...e })),
  };
}
