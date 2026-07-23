import { describe, expect, test } from 'bun:test';
import type {
  AgentProvider,
  AgentSessionEvent,
  ModelRate,
  UsageEvent,
} from '@stash/shared';
import type { BurnAggregate, BurnAggregationRequest } from '../domain/analytics/burn.js';
import { AgentSourceAggregator, type AggregateResult } from './aggregator.js';
import type { SessionScanExecutor, SessionScanMode } from './session-scan-worker.js';
import type { AgentSource, ScanOptions, SourceScanResult } from './source.js';

class CountingSource implements AgentSource {
  readonly provider: AgentProvider = 'claude';
  scanCount = 0;
  activityScanCount = 0;
  readonly scanOptions: ScanOptions[] = [];

  scan(options: ScanOptions): SourceScanResult {
    this.scanCount++;
    this.scanOptions.push(options);
    return { sessions: [], errors: [] };
  }

  scanActivity(options: ScanOptions): SourceScanResult {
    this.activityScanCount++;
    this.scanOptions.push(options);
    return { sessions: [], errors: [], usageBySource: new Map() };
  }

  getEvents(_sourcePath: string): AgentSessionEvent[] {
    return [];
  }

  getUsage(_sourcePath: string): UsageEvent[] {
    return [];
  }
}

class CountingExecutor implements SessionScanExecutor {
  burnRequests: BurnAggregationRequest[] = [];

  scan(_mode: SessionScanMode, _options: ScanOptions): Promise<AggregateResult> {
    throw new Error('scan should not be called');
  }

  async aggregateBurn(request: BurnAggregationRequest): Promise<BurnAggregate> {
    this.burnRequests.push(request);
    await Promise.resolve();
    return emptyBurnAggregate();
  }
}

describe('AgentSourceAggregator.scanAsync', () => {
  test('shares concurrent scans for the same provider and limit', async () => {
    const source = new CountingSource();
    const sources = new Map<AgentProvider, { source: AgentSource; root: string }>([
      ['claude', { source, root: '/fake' }],
    ]);
    const aggregator = new AgentSourceAggregator(sources);

    const first = aggregator.scanAsync({ provider: 'claude', limitPerSource: 100 });
    const second = aggregator.scanAsync({ provider: 'claude', limitPerSource: 100 });

    expect(first).toBe(second);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(source.scanCount).toBe(1);
  });

  test('keeps different modified-since windows in separate singleflight lanes', async () => {
    const source = new CountingSource();
    const sources = new Map<AgentProvider, { source: AgentSource; root: string }>([
      ['claude', { source, root: '/fake' }],
    ]);
    const aggregator = new AgentSourceAggregator(sources);

    const first = aggregator.scanAsync({ provider: 'claude', modifiedSinceMs: 100 });
    const same = aggregator.scanAsync({ provider: 'claude', modifiedSinceMs: 100 });
    const different = aggregator.scanAsync({ provider: 'claude', modifiedSinceMs: 200 });

    expect(first).toBe(same);
    expect(first).not.toBe(different);
    await Promise.all([first, same, different]);
    expect(source.scanCount).toBe(2);
    expect(source.scanOptions.map((options) => options.modifiedSinceMs)).toEqual([100, 200]);
  });

  test('does not share full-session and analytics activity scans', async () => {
    const source = new CountingSource();
    const sources = new Map<AgentProvider, { source: AgentSource; root: string }>([
      ['claude', { source, root: '/fake' }],
    ]);
    const aggregator = new AgentSourceAggregator(sources);

    const full = aggregator.scanAsync({ provider: 'claude', modifiedSinceMs: 100 });
    const activity = aggregator.scanActivityAsync({ provider: 'claude', modifiedSinceMs: 100 });

    expect(full).not.toBe(activity);
    await Promise.all([full, activity]);
    expect(source.scanCount).toBe(1);
    expect(source.activityScanCount).toBe(1);
  });

  test('shares Burn work only when window and complete rates match', async () => {
    const executor = new CountingExecutor();
    const aggregator = new AgentSourceAggregator(new Map(), executor);
    const rates: ModelRate[] = [{
      model: 'custom',
      inputPerM: 1,
      outputPerM: 2,
      cacheReadPerM: 3,
      cacheWritePerM: 4,
    }];
    const request: BurnAggregationRequest = {
      startMs: 100,
      bucketEndMs: 200,
      startDate: '1970-01-01',
      endDateExclusive: '1970-01-02',
      timeZone: 'UTC',
      days: 30,
      rates,
    };

    const first = aggregator.aggregateBurnAsync(request);
    const same = aggregator.aggregateBurnAsync({ ...request, rates: [...rates] });
    const differentWindow = aggregator.aggregateBurnAsync({ ...request, startMs: 200 });
    const differentRates = aggregator.aggregateBurnAsync({
      ...request,
      rates: [{ ...rates[0]!, outputPerM: 20 }],
    });
    const differentZone = aggregator.aggregateBurnAsync({
      ...request,
      timeZone: 'Asia/Shanghai',
    });
    const dailyProjects = aggregator.aggregateBurnAsync({
      ...request,
      includeDailyProjectSpend: true,
    });

    expect(first).toBe(same);
    expect(first).not.toBe(differentWindow);
    expect(first).not.toBe(differentRates);
    expect(first).not.toBe(differentZone);
    expect(first).not.toBe(dailyProjects);
    await Promise.all([
      first,
      same,
      differentWindow,
      differentRates,
      differentZone,
      dailyProjects,
    ]);
    expect(executor.burnRequests).toHaveLength(5);
  });

  test('clears failed Burn singleflight entries so callers can retry', async () => {
    let attempts = 0;
    const executor: SessionScanExecutor = {
      scan: () => Promise.reject(new Error('unused')),
      aggregateBurn: async () => {
        attempts++;
        throw new Error('burn failed');
      },
    };
    const aggregator = new AgentSourceAggregator(new Map(), executor);
    const request: BurnAggregationRequest = {
      startMs: 100,
      bucketEndMs: 200,
      startDate: '1970-01-01',
      endDateExclusive: '1970-01-02',
      timeZone: 'UTC',
      days: 30,
      rates: [],
    };

    await expect(aggregator.aggregateBurnAsync(request)).rejects.toThrow('burn failed');
    await expect(aggregator.aggregateBurnAsync(request)).rejects.toThrow('burn failed');
    expect(attempts).toBe(2);
  });
});

function emptyBurnAggregate(): BurnAggregate {
  return {
    calendar: {
      timeZone: 'UTC',
      bucketRange: {
        start: '1970-01-01T00:00:00.000Z',
        end: '1970-01-02T00:00:00.000Z',
        startDate: '1970-01-01',
        endDateExclusive: '1970-01-02',
      },
      evaluationRange: { start: '1970-01-01T00:00:00.000Z', end: null },
    },
    totals: { tokens: 0, cost: 0, sessions: 0 },
    dailySpend: [],
    hourlyHeatmap: Array.from({ length: 7 }, () => Array<number>(24).fill(0)),
    modelMix: [],
    perProjectLeaderboard: [],
    dailyProjectSpend: [],
    cache: {
      refreshState: 'fresh',
      generatedAt: '2026-05-14T00:00:00.000Z',
      filesDiscovered: 0,
      filesSeen: 0,
      filesIndexed: 0,
      filesReused: 0,
      sources: [],
    },
  };
}
