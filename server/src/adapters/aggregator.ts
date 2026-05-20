import type { AgentProvider, AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, SourceParseError } from './source.js';

const DEFAULT_SCAN_CACHE_TTL_MS = 2_000;

export interface AggregateOptions {
  limitPerSource?: number;
  provider?: AgentProvider | 'all';
}

export interface AggregateResult {
  sessions: AgentSession[];
  errors: SourceParseError[];
}

export interface AgentSourceAggregatorOptions {
  /**
   * Short in-process cache window for repeated scans during one page load.
   *
   * Session files are still the source of truth. This only prevents routes such
   * as /api/agent-sessions, /api/workboard, and /api/analytics/* from walking
   * and reparsing the same tree several times in the same render burst.
   */
  scanCacheTtlMs?: number;
  now?: () => number;
}

interface CachedScan {
  expiresAt: number;
  result: AggregateResult;
}

export class AgentSourceAggregator {
  private readonly scanCache = new Map<string, CachedScan>();
  private readonly scanCacheTtlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly sources: Map<AgentProvider, { source: AgentSource; root: string }>,
    options: AgentSourceAggregatorOptions = {},
  ) {
    this.scanCacheTtlMs = options.scanCacheTtlMs ?? DEFAULT_SCAN_CACHE_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  scan(options: AggregateOptions = {}): AggregateResult {
    const cacheKey = this.scanCacheKey(options);
    const cached = this.scanCache.get(cacheKey);
    const now = this.now();
    if (cached && cached.expiresAt > now) {
      return cloneResult(cached.result);
    }

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
    if (this.scanCacheTtlMs > 0) {
      this.scanCache.set(cacheKey, { expiresAt: now + this.scanCacheTtlMs, result: cloneResult(result) });
    }
    return result;
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

  invalidateScanCache(): void {
    this.scanCache.clear();
  }

  private scanCacheKey(options: AggregateOptions): string {
    const provider = options.provider ?? 'all';
    const limit = options.limitPerSource ?? 0;
    const roots = Array.from(this.sources.entries())
      .map(([p, entry]) => `${p}:${entry.root}`)
      .sort()
      .join('|');
    return `${provider}:${limit}:${roots}`;
  }
}

function cloneResult(result: AggregateResult): AggregateResult {
  return {
    sessions: [...result.sessions],
    errors: [...result.errors],
  };
}
