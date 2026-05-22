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

  scan(_options: ScanOptions): SourceScanResult {
    this.scanCount++;
    return { sessions: [], errors: [] };
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
});
