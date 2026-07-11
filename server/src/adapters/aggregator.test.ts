import { describe, expect, test } from 'bun:test';
import type {
  AgentProvider,
  AgentSessionEvent,
  UsageEvent,
} from '@stash/shared';
import { AgentSourceAggregator } from './aggregator.js';
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
});
