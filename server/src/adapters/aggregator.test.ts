import { describe, expect, test } from 'bun:test';
import type { AgentSession } from '@stash/shared';
import { AgentSourceAggregator } from './aggregator.js';
import type { AgentSource, ScanOptions, SourceScanResult } from './source.js';

describe('AgentSourceAggregator', () => {
  test('caches bounded scans for a short window', () => {
    let now = 1_000;
    const source = new FakeSource('claude');
    const aggregator = new AgentSourceAggregator(
      new Map([['claude', { source, root: '/tmp/claude' }]]),
      { cacheTtlMs: 250, now: () => now },
    );

    const first = aggregator.scan({ provider: 'claude', limitPerSource: 25 });
    const second = aggregator.scan({ provider: 'claude', limitPerSource: 25 });
    expect(first.sessions).toHaveLength(1);
    expect(second.sessions).toHaveLength(1);
    expect(source.calls).toBe(1);
    expect(source.lastLimit).toBe(25);

    first.sessions[0]!.title = 'mutated by caller';
    expect(second.sessions[0]!.title).toBe('session 1');

    now += 251;
    aggregator.scan({ provider: 'claude', limitPerSource: 25 });
    expect(source.calls).toBe(2);
  });

  test('keeps provider and limit in the cache key', () => {
    const claude = new FakeSource('claude');
    const codex = new FakeSource('codex');
    const aggregator = new AgentSourceAggregator(
      new Map([
        ['claude', { source: claude, root: '/tmp/claude' }],
        ['codex', { source: codex, root: '/tmp/codex' }],
      ]),
      { cacheTtlMs: 1_000, now: () => 2_000 },
    );

    aggregator.scan({ provider: 'claude', limitPerSource: 10 });
    aggregator.scan({ provider: 'claude', limitPerSource: 20 });
    aggregator.scan({ provider: 'codex', limitPerSource: 10 });

    expect(claude.calls).toBe(2);
    expect(codex.calls).toBe(1);
  });
});

class FakeSource implements AgentSource {
  calls = 0;
  lastLimit: number | undefined;

  constructor(readonly provider: 'claude' | 'codex') {}

  scan(options: ScanOptions): SourceScanResult {
    this.calls += 1;
    this.lastLimit = options.limit;
    return {
      sessions: [session(this.provider, this.calls)],
      errors: [],
    };
  }

  getEvents() {
    return [];
  }

  getUsage() {
    return [];
  }
}

function session(provider: 'claude' | 'codex', calls: number): AgentSession {
  return {
    id: `${provider}-${calls}`,
    provider,
    title: `session ${calls}`,
    sourcePath: `/tmp/${provider}/${calls}.jsonl`,
    cwd: '/tmp/project',
    status: 'completed',
    startedAt: '2026-05-20T00:00:00.000Z',
    lastActiveAt: '2026-05-20T00:00:00.000Z',
    messageCount: 1,
    toolCount: 0,
    filesTouched: [],
  };
}
