import { describe, expect, test } from 'bun:test';
import type { AgentProvider, AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import { AgentSourceAggregator } from './aggregator.js';
import type { AgentSource, ScanOptions, SourceScanResult } from './source.js';

class CountingSource implements AgentSource {
  calls = 0;

  constructor(
    readonly provider: AgentProvider,
    private readonly sessionId: string,
  ) {}

  scan(options: ScanOptions): SourceScanResult {
    this.calls += 1;
    return {
      sessions: [
        {
          id: `${this.sessionId}-${options.limit ?? 0}`,
          provider: this.provider,
          title: `${this.provider} session`,
          cwd: `/tmp/${this.provider}`,
          sourcePath: `/tmp/${this.provider}/${this.sessionId}.jsonl`,
          startedAt: '2026-05-20T00:00:00.000Z',
          lastActiveAt: '2026-05-20T00:00:00.000Z',
          status: 'completed',
          messageCount: 1,
          toolCount: 0,
          filesTouched: [],
        } satisfies AgentSession,
      ],
      errors: [],
    };
  }

  getEvents(): AgentSessionEvent[] {
    return [];
  }

  getUsage(): UsageEvent[] {
    return [];
  }
}

describe('AgentSourceAggregator scan cache', () => {
  test('reuses identical scans inside the cache window', () => {
    let now = 1_000;
    const claude = new CountingSource('claude', 'one');
    const aggregator = new AgentSourceAggregator(
      new Map([['claude', { source: claude, root: '/tmp/claude' }]]),
      { scanCacheTtlMs: 2_000, now: () => now },
    );

    const first = aggregator.scan({ provider: 'claude', limitPerSource: 100 });
    const second = aggregator.scan({ provider: 'claude', limitPerSource: 100 });

    expect(first.sessions.map((s) => s.id)).toEqual(second.sessions.map((s) => s.id));
    expect(claude.calls).toBe(1);

    now += 2_001;
    aggregator.scan({ provider: 'claude', limitPerSource: 100 });
    expect(claude.calls).toBe(2);
  });

  test('keeps separate cache entries for provider and limit', () => {
    const claude = new CountingSource('claude', 'one');
    const codex = new CountingSource('codex', 'two');
    const aggregator = new AgentSourceAggregator(
      new Map([
        ['claude', { source: claude, root: '/tmp/claude' }],
        ['codex', { source: codex, root: '/tmp/codex' }],
      ]),
      { scanCacheTtlMs: 2_000, now: () => 1_000 },
    );

    aggregator.scan({ provider: 'claude', limitPerSource: 100 });
    aggregator.scan({ provider: 'claude', limitPerSource: 100 });
    aggregator.scan({ provider: 'codex', limitPerSource: 100 });
    aggregator.scan({ provider: 'claude', limitPerSource: 500 });

    expect(claude.calls).toBe(2);
    expect(codex.calls).toBe(1);
  });

  test('can be invalidated after external writes', () => {
    const claude = new CountingSource('claude', 'one');
    const aggregator = new AgentSourceAggregator(
      new Map([['claude', { source: claude, root: '/tmp/claude' }]]),
      { scanCacheTtlMs: 2_000, now: () => 1_000 },
    );

    aggregator.scan({ provider: 'claude' });
    aggregator.invalidateScanCache();
    aggregator.scan({ provider: 'claude' });

    expect(claude.calls).toBe(2);
  });
});
