import type { AgentProvider, AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import {
  aggregateBurnFromScan,
  type BurnAggregate,
  type BurnAggregationRequest,
} from '../domain/analytics/burn.js';
import type { AgentSource, SourceParseError, SourceScanCacheStats } from './source.js';
import type { SessionFileFingerprint } from './session-cache.js';
import type { SessionScanExecutor, SessionScanMode } from './session-scan-worker.js';

export interface AggregateOptions {
  limitPerSource?: number;
  provider?: AgentProvider | 'all';
  modifiedSinceMs?: number;
}

export interface AggregateResult {
  sessions: AgentSession[];
  errors: SourceParseError[];
  cache: AggregateScanCacheStats;
  /** Window-scoped usage from activity scans; keyed by provider + source path. */
  usageBySource?: Map<string, UsageEvent[]>;
  /** Metadata-scan file generations, keyed by provider + source path. */
  fingerprintsBySource?: Map<string, SessionFileFingerprint>;
}

export interface AggregateScanCacheStats {
  refreshState: 'fresh' | 'refreshing';
  generatedAt: string;
  filesDiscovered: number;
  filesSeen: number;
  filesIndexed: number;
  filesReused: number;
  sources: SourceScanCacheStats[];
}

export class AgentSourceAggregator {
  private readonly inflight = new Map<string, Promise<AggregateResult>>();
  private readonly burnInflight = new Map<string, Promise<BurnAggregate>>();

  constructor(
    private readonly sources: Map<AgentProvider, { source: AgentSource; root: string }>,
    private readonly scanExecutor?: SessionScanExecutor,
  ) {}

  scan(options: AggregateOptions = {}): AggregateResult {
    return this.scanWith(options, 'full');
  }

  scanActivity(options: AggregateOptions = {}): AggregateResult {
    return this.scanWith(options, 'activity');
  }

  private scanWith(options: AggregateOptions, mode: 'full' | 'activity'): AggregateResult {
    const wanted = options.provider && options.provider !== 'all' ? [options.provider] : ['claude', 'codex'] as AgentProvider[];
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];
    const sourceStats: SourceScanCacheStats[] = [];
    const usageBySource = new Map<string, UsageEvent[]>();
    const fingerprintsBySource = new Map<string, SessionFileFingerprint>();

    for (const provider of wanted) {
      const entry = this.sources.get(provider);
      if (!entry) continue;
      try {
        const scanOptions = {
          root: entry.root,
          limit: options.limitPerSource,
          modifiedSinceMs: options.modifiedSinceMs,
        };
        const r = mode === 'activity' && entry.source.scanActivity
          ? entry.source.scanActivity(scanOptions)
          : entry.source.scan(scanOptions);
        sessions.push(...r.sessions);
        errors.push(...r.errors);
        if (r.cache) sourceStats.push(r.cache);
        for (const [sourcePath, usage] of r.usageBySource ?? []) {
          usageBySource.set(usageKey(provider, sourcePath), usage);
        }
        for (const [sourcePath, fingerprint] of r.fingerprintsBySource ?? []) {
          fingerprintsBySource.set(usageKey(provider, sourcePath), fingerprint);
        }
      } catch (e) {
        errors.push({
          provider,
          sourcePath: entry.root,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    sessions.sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1));
    return {
      sessions,
      errors,
      cache: aggregateCacheStats(sourceStats, 'fresh'),
      ...(usageBySource.size > 0 ? { usageBySource } : {}),
      ...(fingerprintsBySource.size > 0 ? { fingerprintsBySource } : {}),
    };
  }

  scanAsync(options: AggregateOptions = {}): Promise<AggregateResult> {
    return this.scanWithSingleflight(options, 'full');
  }

  scanActivityAsync(options: AggregateOptions = {}): Promise<AggregateResult> {
    return this.scanWithSingleflight(options, 'activity');
  }

  aggregateBurnAsync(request: BurnAggregationRequest): Promise<BurnAggregate> {
    const key = burnKey(request);
    const current = this.burnInflight.get(key);
    if (current) return current;

    const pending = (this.scanExecutor
      ? this.scanExecutor.aggregateBurn(request)
      : Promise.resolve().then(() => aggregateBurnFromScan(this, this.scan({}), request)))
      .finally(() => {
        this.burnInflight.delete(key);
      });
    this.burnInflight.set(key, pending);
    return pending;
  }

  private scanWithSingleflight(
    options: AggregateOptions,
    mode: SessionScanMode,
  ): Promise<AggregateResult> {
    const key = scanKey(options, mode);
    const current = this.inflight.get(key);
    if (current) return current;

    const pending = (this.scanExecutor
      ? this.scanExecutor.scan(mode, options)
      : Promise.resolve().then(() => mode === 'activity' ? this.scanActivity(options) : this.scan(options)))
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

  getUsage(
    provider: AgentProvider,
    sourcePath: string,
    fingerprint?: SessionFileFingerprint,
  ): UsageEvent[] {
    const entry = this.sources.get(provider);
    if (!entry) return [];
    return entry.source.getUsage(sourcePath, fingerprint);
  }

  getUsageForScan(
    scanResult: AggregateResult | undefined,
    provider: AgentProvider,
    sourcePath: string,
  ): UsageEvent[] {
    return scanResult?.usageBySource?.get(usageKey(provider, sourcePath))
      ?? this.getUsage(
        provider,
        sourcePath,
        scanResult?.fingerprintsBySource?.get(usageKey(provider, sourcePath)),
      );
  }

  has(provider: AgentProvider): boolean {
    return this.sources.has(provider);
  }
}

function usageKey(provider: AgentProvider, sourcePath: string): string {
  return `${provider}\0${sourcePath}`;
}

function scanKey(options: AggregateOptions, mode: SessionScanMode): string {
  return JSON.stringify({
    mode,
    provider: options.provider ?? 'all',
    limitPerSource: options.limitPerSource ?? 0,
    modifiedSinceMs: options.modifiedSinceMs ?? null,
  });
}

function burnKey(request: BurnAggregationRequest): string {
  return JSON.stringify({
    kind: 'burn',
    startMs: request.startMs,
    beforeMs: request.beforeMs ?? null,
    days: request.days,
    rates: request.rates,
  });
}

function aggregateCacheStats(
  sources: SourceScanCacheStats[],
  refreshState: AggregateScanCacheStats['refreshState'],
): AggregateScanCacheStats {
  let filesDiscovered = 0;
  let filesSeen = 0;
  let filesIndexed = 0;
  let filesReused = 0;
  for (const source of sources) {
    filesDiscovered += source.filesDiscovered;
    filesSeen += source.filesSeen;
    filesIndexed += source.filesIndexed;
    filesReused += source.filesReused;
  }
  return {
    refreshState,
    generatedAt: new Date().toISOString(),
    filesDiscovered,
    filesSeen,
    filesIndexed,
    filesReused,
    sources,
  };
}
