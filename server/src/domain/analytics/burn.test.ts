import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import {
  fixedClock,
  type AgentProvider,
  type AgentSession,
  type AgentSessionEvent,
  type UsageEvent,
} from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { AgentSourceAggregator } from '../../adapters/aggregator.js';
import type { AgentSource, SourceScanResult } from '../../adapters/source.js';
import { AreaService } from '../area/service.js';
import { BurnService } from './burn.js';

class FakeSource implements AgentSource {
  readonly provider: AgentProvider;
  readonly usageReads: string[] = [];
  private readonly sessions: AgentSession[];
  private readonly usageBySource: Map<string, UsageEvent[]>;

  constructor(
    provider: AgentProvider,
    sessions: AgentSession[],
    usage: Record<string, UsageEvent[]> = {},
  ) {
    this.provider = provider;
    this.sessions = sessions;
    this.usageBySource = new Map(Object.entries(usage));
  }

  scan(): SourceScanResult {
    return { sessions: this.sessions, errors: [] };
  }
  getEvents(): AgentSessionEvent[] {
    return [];
  }
  getUsage(sourcePath: string): UsageEvent[] {
    this.usageReads.push(sourcePath);
    return this.usageBySource.get(sourcePath) ?? [];
  }
}

function makeSession(overrides: Partial<AgentSession>): AgentSession {
  return {
    id: 'sess-1',
    provider: 'claude',
    sourcePath: '/tmp/sess-1.jsonl',
    cwd: '/tmp',
    status: 'idle',
    title: 't',
    filesTouched: [],
    toolCount: 0,
    messageCount: 0,
    lastActiveAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}

describe('BurnService', () => {
  let db: Database;
  let areaService: AreaService;
  const at = '2026-05-14T12:00:00.000Z';

  beforeEach(() => {
    db = freshDb();
    areaService = new AreaService({ db, clock: fixedClock(at) });
  });

  function build(
    sessions: AgentSession[],
    usage: Record<string, UsageEvent[]>,
    time_zone = 'UTC',
  ): BurnService {
    const sources = new Map<AgentProvider, { source: AgentSource; root: string }>();
    sources.set('claude', { source: new FakeSource('claude', sessions, usage), root: '/fake' });
    const aggregator = new AgentSourceAggregator(sources);
    return new BurnService({
      aggregator,
      areaService,
      clock: fixedClock(at),
      time_zone,
    });
  }

  test('empty input produces zeroed snapshot of requested width', () => {
    const svc = build([], {});
    const snap = svc.snapshot({ days: 7 });
    expect(snap.totals).toEqual({ tokens: 0, cost: 0, sessions: 0 });
    expect(snap.dailySpend).toHaveLength(7);
    expect(snap.dailySpend.every((d) => d.tokens === 0 && d.cost === 0)).toBe(true);
    expect(snap.modelMix).toHaveLength(0);
    expect(snap.perProjectLeaderboard).toHaveLength(0);
  });

  test('buckets daily spend by UTC date and computes total cost', () => {
    const s = makeSession({ id: 'a', sourcePath: '/p/a.jsonl', projectId: 'proj-1' });
    const usage: Record<string, UsageEvent[]> = {
      '/p/a.jsonl': [
        // Sonnet 4.6: input $3/M, output $15/M
        { ts: '2026-05-13T08:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 1_000_000, outputTokens: 100_000, sourcePath: '/p/a.jsonl' },
        { ts: '2026-05-14T09:30:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 500_000, outputTokens: 50_000, sourcePath: '/p/a.jsonl' },
      ],
    };
    const snap = build([s], usage).snapshot({ days: 7 });

    // total tokens 1.65M, cost = 1.5M*$3 + 0.15M*$15 = 4.5 + 2.25 = 6.75
    expect(snap.totals.tokens).toBe(1_650_000);
    expect(snap.totals.cost).toBeCloseTo(6.75, 5);
    expect(snap.totals.sessions).toBe(1);

    const dayMay13 = snap.dailySpend.find((d) => d.date === '2026-05-13');
    const dayMay14 = snap.dailySpend.find((d) => d.date === '2026-05-14');
    expect(dayMay13?.tokens).toBe(1_100_000);
    expect(dayMay14?.tokens).toBe(550_000);
  });

  test('hourly heatmap places event in the right (dow, hour) cell', () => {
    // 2026-05-14 = Thursday => UTC dow=4, Monday-indexed dow=3
    const s = makeSession({ id: 'h', sourcePath: '/h.jsonl' });
    const usage: Record<string, UsageEvent[]> = {
      '/h.jsonl': [
        { ts: '2026-05-14T09:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 1000, outputTokens: 500, sourcePath: '/h.jsonl' },
      ],
    };
    const snap = build([s], usage).snapshot({ days: 7 });
    expect(snap.hourlyHeatmap[3]?.[9]).toBe(1500);
  });

  test('buckets dates and hours in the configured zone across UTC midnight', () => {
    const sourcePath = '/shanghai.jsonl';
    const session = makeSession({ sourcePath });
    const snap = build([session], {
      [sourcePath]: [
        {
          ts: '2026-05-13T16:30:00.000Z',
          model: 'claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 50,
          sourcePath,
        },
      ],
    }, 'Asia/Shanghai').snapshot({ days: 2 });

    expect(snap.dailySpend.find((bucket) => bucket.date === '2026-05-14')?.tokens).toBe(150);
    expect(snap.hourlyHeatmap[3]?.[0]).toBe(150);
    expect(snap.calendar).toEqual({
      timeZone: 'Asia/Shanghai',
      bucketRange: {
        start: '2026-05-12T16:00:00.000Z',
        end: '2026-05-14T16:00:00.000Z',
        startDate: '2026-05-13',
        endDateExclusive: '2026-05-15',
      },
      evaluationRange: {
        start: '2026-05-12T16:00:00.000Z',
        end: null,
      },
    });
  });

  test('uses exact DST bucket ranges and combines repeated local hours', () => {
    const sourcePath = '/dst.jsonl';
    const session = makeSession({
      sourcePath,
      lastActiveAt: '2026-11-01T10:00:00.000Z',
    });
    const service = new BurnService({
      aggregator: new AgentSourceAggregator(new Map([[
        'claude',
        {
          source: new FakeSource('claude', [session], {
            [sourcePath]: [
              {
                ts: '2026-11-01T05:30:00.000Z',
                model: 'claude-sonnet-4-6',
                inputTokens: 100,
                outputTokens: 0,
                sourcePath,
              },
              {
                ts: '2026-11-01T06:30:00.000Z',
                model: 'claude-sonnet-4-6',
                inputTokens: 200,
                outputTokens: 0,
                sourcePath,
              },
            ],
          }),
          root: '/fake',
        },
      ]])),
      areaService,
      clock: fixedClock('2026-11-01T12:00:00.000Z'),
      time_zone: 'America/New_York',
    });
    const snap = service.snapshot({ days: 1 });

    expect(Date.parse(snap.calendar.bucketRange.end)
      - Date.parse(snap.calendar.bucketRange.start)).toBe(25 * 3_600_000);
    expect(snap.hourlyHeatmap[6]?.[1]).toBe(300);
    expect(snap.dailySpend[0]).toMatchObject({ date: '2026-11-01', tokens: 300 });
    expect(snap.dailySpend[0]?.cost).toBeCloseTo(0.0009, 12);
  });

  test('model mix aggregates by model with share', () => {
    const s = makeSession({ id: 'm', sourcePath: '/m.jsonl' });
    const usage: Record<string, UsageEvent[]> = {
      '/m.jsonl': [
        { ts: '2026-05-14T08:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 600, outputTokens: 400, sourcePath: '/m.jsonl' },
        { ts: '2026-05-14T08:00:00.000Z', model: 'claude-opus-4-7',   inputTokens: 200, outputTokens: 800, sourcePath: '/m.jsonl' },
      ],
    };
    const snap = build([s], usage).snapshot({ days: 7 });
    const sonnet = snap.modelMix.find((m) => m.model === 'claude-sonnet-4-6');
    const opus = snap.modelMix.find((m) => m.model === 'claude-opus-4-7');
    expect(sonnet?.tokens).toBe(1000);
    expect(opus?.tokens).toBe(1000);
    expect(sonnet?.share).toBeCloseTo(0.5, 5);
    expect(opus?.share).toBeCloseTo(0.5, 5);
  });

  test('per-project leaderboard resolves area name and shares', () => {
    const area = areaService.create({ name: 'aurora' });
    const s1 = makeSession({ id: 's1', sourcePath: '/s1.jsonl', projectId: area.id });
    const s2 = makeSession({ id: 's2', sourcePath: '/s2.jsonl' });
    const usage: Record<string, UsageEvent[]> = {
      '/s1.jsonl': [
        { ts: '2026-05-14T08:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 600, outputTokens: 200, sourcePath: '/s1.jsonl' },
      ],
      '/s2.jsonl': [
        { ts: '2026-05-14T08:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 200, outputTokens: 0,   sourcePath: '/s2.jsonl' },
      ],
    };
    const snap = build([s1, s2], usage).snapshot({ days: 7 });
    const row = snap.perProjectLeaderboard.find((r) => r.projectId === area.id);
    const unlinked = snap.perProjectLeaderboard.find((r) => r.projectId === '__unlinked__');
    expect(row?.projectName).toBe('aurora');
    expect(row?.tokens).toBe(800);
    expect(row?.share).toBeCloseTo(0.8, 5);
    expect(unlinked?.projectName).toBe('unlinked');
    expect(unlinked?.tokens).toBe(200);
  });

  test('events older than the window are skipped', () => {
    const s = makeSession({ id: 'old', sourcePath: '/o.jsonl' });
    const usage: Record<string, UsageEvent[]> = {
      '/o.jsonl': [
        { ts: '2026-04-01T08:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 9000, outputTokens: 1000, sourcePath: '/o.jsonl' },
      ],
    };
    const snap = build([s], usage).snapshot({ days: 7 });
    expect(snap.totals.tokens).toBe(0);
  });

  test('rolling totals preserve future events while fixed daily buckets stay in range', () => {
    const sourcePath = '/future.jsonl';
    const session = makeSession({
      id: 'future',
      sourcePath,
      lastActiveAt: '2026-05-15T08:00:00.000Z',
    });
    const snap = build([session], {
      [sourcePath]: [{
        ts: '2026-05-15T08:00:00.000Z',
        model: 'claude-sonnet-4-6',
        inputTokens: 100,
        outputTokens: 50,
        sourcePath,
      }],
    }).snapshot({ days: 1 });

    expect(snap.totals).toMatchObject({ tokens: 150, sessions: 1 });
    expect(snap.dailySpend).toEqual([{ date: '2026-05-14', tokens: 0, cost: 0 }]);
    expect(snap.modelMix[0]?.tokens).toBe(150);
    expect(snap.calendar.evaluationRange.end).toBeNull();
  });

  test('bounded callers use the same end for buckets and evaluation totals', () => {
    const sourcePath = '/bounded.jsonl';
    const session = makeSession({
      sourcePath,
      lastActiveAt: '2026-05-16T00:00:00.000Z',
    });
    const endMs = Date.parse('2026-05-15T00:00:00.000Z');
    const snap = build([session], {
      [sourcePath]: [
        {
          ts: '2026-05-14T23:59:59.999Z',
          model: 'claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 0,
          sourcePath,
        },
        {
          ts: '2026-05-15T00:00:00.000Z',
          model: 'claude-sonnet-4-6',
          inputTokens: 999,
          outputTokens: 0,
          sourcePath,
        },
      ],
    }).snapshot({ days: 1, endMs });

    expect(snap.totals.tokens).toBe(100);
    expect(snap.calendar.bucketRange.end).toBe('2026-05-15T00:00:00.000Z');
    expect(snap.calendar.evaluationRange.end).toBe('2026-05-15T00:00:00.000Z');
  });

  test('totalsBetween uses exact half-open boundaries', () => {
    const s = makeSession({
      id: 'range',
      sourcePath: '/range.jsonl',
      lastActiveAt: '2026-05-18T00:00:00.000Z',
    });
    const usage: Record<string, UsageEvent[]> = {
      '/range.jsonl': [
        { ts: '2026-05-10T23:59:59.999Z', model: 'claude-sonnet-4-6', inputTokens: 999, outputTokens: 0, sourcePath: '/range.jsonl' },
        { ts: '2026-05-11T00:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 50, sourcePath: '/range.jsonl' },
        { ts: '2026-05-17T23:59:59.999Z', model: 'claude-sonnet-4-6', inputTokens: 200, outputTokens: 25, sourcePath: '/range.jsonl' },
        { ts: '2026-05-18T00:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 888, outputTokens: 0, sourcePath: '/range.jsonl' },
      ],
    };
    const svc = build([s], usage);

    const totals = svc.totalsBetween(
      Date.parse('2026-05-11T00:00:00.000Z'),
      Date.parse('2026-05-18T00:00:00.000Z'),
    );

    expect(totals.tokens).toBe(375);
    expect(totals.sessions).toBe(1);
    expect(totals.cost).toBeCloseTo(0.002025, 9);
  });

  test('does not read usage files for sessions older than the burn window', () => {
    const old = makeSession({
      id: 'old',
      sourcePath: '/old.jsonl',
      lastActiveAt: '2026-04-01T08:00:00.000Z',
    });
    const recent = makeSession({
      id: 'recent',
      sourcePath: '/recent.jsonl',
      lastActiveAt: '2026-05-14T08:00:00.000Z',
    });
    const source = new FakeSource('claude', [old, recent], {
      '/old.jsonl': [
        { ts: '2026-04-01T08:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 9000, outputTokens: 1000, sourcePath: '/old.jsonl' },
      ],
      '/recent.jsonl': [
        { ts: '2026-05-14T08:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 1000, outputTokens: 500, sourcePath: '/recent.jsonl' },
      ],
    });
    const sources = new Map<AgentProvider, { source: AgentSource; root: string }>();
    sources.set('claude', { source, root: '/fake' });
    const svc = new BurnService({
      aggregator: new AgentSourceAggregator(sources),
      areaService,
      clock: fixedClock(at),
    });

    const snap = svc.snapshot({ days: 7 });

    expect(snap.totals.tokens).toBe(1500);
    expect(source.usageReads).toEqual(['/recent.jsonl']);
  });

  test('clamps days between 1 and 365', () => {
    const svc = build([], {});
    expect(svc.snapshot({ days: 0 }).dailySpend).toHaveLength(1);
    expect(svc.snapshot({ days: 9999 }).dailySpend).toHaveLength(365);
  });
});
