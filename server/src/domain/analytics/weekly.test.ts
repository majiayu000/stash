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
import type { AgentSource, ScanOptions, SourceScanResult } from '../../adapters/source.js';
import { AreaService } from '../area/service.js';
import { WorkItemService } from '../work-item/service.js';
import { BurnService } from './burn.js';
import { WeeklyReviewService, resolveWeek } from './weekly.js';

class FakeSource implements AgentSource {
  readonly provider: AgentProvider;
  readonly scanOptions: ScanOptions[] = [];
  constructor(
    provider: AgentProvider,
    private readonly sessions: AgentSession[],
    private readonly usage: Record<string, UsageEvent[]> = {},
  ) {
    this.provider = provider;
  }
  scan(options: ScanOptions): SourceScanResult {
    this.scanOptions.push(options);
    return { sessions: this.sessions, errors: [] };
  }
  getEvents(): AgentSessionEvent[] { return []; }
  getUsage(p: string): UsageEvent[] { return this.usage[p] ?? []; }
}

function makeSession(o: Partial<AgentSession>): AgentSession {
  return {
    id: 's', provider: 'claude', sourcePath: '/s.jsonl', cwd: '/', status: 'idle',
    title: '', filesTouched: [], toolCount: 0, messageCount: 0,
    lastActiveAt: '2026-05-14T10:00:00.000Z',
    ...o,
  };
}

describe('resolveWeek', () => {
  test('parses YYYY-Www', () => {
    const w = resolveWeek('2026-W20', fixedClock('2026-05-14T12:00:00.000Z'), 'UTC');
    expect(w.label).toBe('2026-W20');
    expect(w.endMs - w.startMs).toBe(7 * 86_400_000);
  });

  test('falls back to current week of the clock', () => {
    // 2026-05-14 (Thu) is in ISO week 20
    const w = resolveWeek(undefined, fixedClock('2026-05-14T12:00:00.000Z'), 'UTC');
    expect(w.label).toBe('2026-W20');
  });

  test('week 1 of an ISO year starts on the right Monday', () => {
    // ISO 2026-W01 starts Mon 2025-12-29 (or 2026-01-05 if 2026 starts on Mon).
    // Our test year 2026: Jan 1 falls on Thursday => ISO W01 starts Mon Dec 29 2025.
    const w = resolveWeek('2026-W01', fixedClock('2026-05-14T12:00:00.000Z'), 'UTC');
    expect(new Date(w.startMs).toISOString().slice(0, 10)).toBe('2025-12-29');
  });

  test('uses configured-zone ISO dates and exact cross-DST week ranges', () => {
    const new_york = resolveWeek(
      '2026-W10',
      fixedClock('2026-03-05T12:00:00.000Z'),
      'America/New_York',
    );
    expect(new_york.range).toEqual({
      start: '2026-03-02T05:00:00.000Z',
      end: '2026-03-09T04:00:00.000Z',
      startDate: '2026-03-02',
      endDateExclusive: '2026-03-09',
    });
    expect(new_york.endMs - new_york.startMs).toBe(167 * 3_600_000);

    const los_angeles = resolveWeek(
      undefined,
      fixedClock('2026-01-01T07:30:00.000Z'),
      'America/Los_Angeles',
    );
    expect(los_angeles.label).toBe('2026-W01');
    expect(los_angeles.range.startDate).toBe('2025-12-29');
  });

  test('rejects out-of-range and nonexistent ISO weeks', () => {
    expect(() => resolveWeek('2026-W00', fixedClock('2026-05-14T12:00:00.000Z'), 'UTC')).toThrow('invalid ISO week');
    expect(() => resolveWeek('2026-W99', fixedClock('2026-05-14T12:00:00.000Z'), 'UTC')).toThrow('invalid ISO week');
    expect(() => resolveWeek('2021-W53', fixedClock('2026-05-14T12:00:00.000Z'), 'UTC')).toThrow('invalid ISO week');
  });
});

describe('WeeklyReviewService', () => {
  let db: Database;
  let areaService: AreaService;
  let workItemService: WorkItemService;
  const at = '2026-05-14T12:00:00.000Z'; // Thu, ISO 2026-W20

  beforeEach(() => {
    db = freshDb();
    areaService = new AreaService({ db, clock: fixedClock(at) });
    workItemService = new WorkItemService({ db, clock: fixedClock(at) });
  });

  function build(
    sessions: AgentSession[] = [],
    usage: Record<string, UsageEvent[]> = {},
    sourceOverride?: FakeSource,
    time_zone = 'UTC',
  ): WeeklyReviewService {
    const sources = new Map<AgentProvider, { source: AgentSource; root: string }>();
    sources.set('claude', { source: sourceOverride ?? new FakeSource('claude', sessions, usage), root: '/' });
    const aggregator = new AgentSourceAggregator(sources);
    const burnService = new BurnService({
      aggregator,
      areaService,
      clock: fixedClock(at),
      time_zone,
    });
    return new WeeklyReviewService({
      workItemService,
      areaService,
      aggregator,
      burnService,
      clock: fixedClock(at),
      time_zone,
    });
  }

  test('empty input produces a zeroed snapshot for the current week', () => {
    const snap = build().snapshot();
    expect(snap.week).toBe('2026-W20');
    expect(snap.doneCount).toBe(0);
    expect(snap.focusHours).toBe(0);
    expect(snap.featuresAdvanced).toHaveLength(0);
    expect(snap.sessionsByDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(snap.donePerProject).toHaveLength(0);
    expect(snap.wow.tokens).toEqual({ now: 0, prev: 0 });
  });

  test('counts work items completed within the week and buckets by project', () => {
    const a1 = areaService.create({ name: 'aurora' });
    const a2 = areaService.create({ name: 'borealis' });
    const inWeek1 = workItemService.create({ title: 'feat A', kind: 'feature', areaId: a1.id });
    const inWeek2 = workItemService.create({ title: 'bug',    kind: 'bug',     areaId: a1.id });
    const inWeek3 = workItemService.create({ title: 'feat B', kind: 'feature', areaId: a2.id });
    const lastWeek = workItemService.create({ title: 'old',   kind: 'task',    areaId: a1.id });
    workItemService.update(inWeek1.id, { status: 'done' });
    workItemService.update(inWeek2.id, { status: 'done' });
    workItemService.update(inWeek3.id, { status: 'done' });
    // Force lastWeek's completedAt to before the window.
    db.prepare(`update work_items set status = 'done', completed_at = '2026-05-01T00:00:00.000Z' where id = ?`)
      .run(lastWeek.id);

    const snap = build().snapshot({ week: '2026-W20' });
    expect(snap.doneCount).toBe(3);
    expect(snap.featuresAdvanced.map((f) => f.title).sort()).toEqual(['feat A', 'feat B']);
    expect(snap.donePerProject.find((p) => p.projectId === a1.id)?.count).toBe(2);
    expect(snap.donePerProject.find((p) => p.projectId === a2.id)?.count).toBe(1);
  });

  test('sessionsByDay counts last-activity per Mon..Sun bucket', () => {
    // 2026-W20 is Mon 2026-05-11 .. Sun 2026-05-17
    const sessions: AgentSession[] = [
      makeSession({ id: 'mon', sourcePath: '/mon.jsonl', lastActiveAt: '2026-05-11T10:00:00.000Z' }),
      makeSession({ id: 'mon2', sourcePath: '/mon2.jsonl', lastActiveAt: '2026-05-11T22:00:00.000Z' }),
      makeSession({ id: 'wed', sourcePath: '/wed.jsonl', lastActiveAt: '2026-05-13T09:00:00.000Z' }),
      makeSession({ id: 'before', sourcePath: '/before.jsonl', lastActiveAt: '2026-05-01T00:00:00.000Z' }),
    ];
    const snap = build(sessions).snapshot({ week: '2026-W20' });
    expect(snap.sessionsByDay[0]).toBe(2); // Monday
    expect(snap.sessionsByDay[2]).toBe(1); // Wednesday
    expect(snap.sessionsByDay.reduce((a, b) => a + b, 0)).toBe(3);
  });

  test('classifies session days by configured local date at the UTC boundary', () => {
    const sessions = [
      makeSession({
        id: 'before-local-week',
        sourcePath: '/before-local-week',
        lastActiveAt: '2026-05-11T06:30:00.000Z',
      }),
      makeSession({
        id: 'local-monday',
        sourcePath: '/local-monday',
        lastActiveAt: '2026-05-11T07:30:00.000Z',
      }),
    ];
    const snap = build(sessions, {}, undefined, 'America/Los_Angeles')
      .snapshot({ week: '2026-W20' });

    expect(snap.sessionsByDay).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(snap.calendar).toEqual({
      timeZone: 'America/Los_Angeles',
      range: {
        start: '2026-05-11T07:00:00.000Z',
        end: '2026-05-18T07:00:00.000Z',
        startDate: '2026-05-11',
        endDateExclusive: '2026-05-18',
      },
    });
  });

  test('focusHours counts distinct active hours from usage events', () => {
    const sessions = [makeSession({ id: 's', sourcePath: '/s.jsonl', lastActiveAt: '2026-05-12T13:30:00.000Z' })];
    const usage = {
      '/s.jsonl': [
        { ts: '2026-05-12T13:05:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 10, outputTokens: 5, sourcePath: '/s.jsonl' },
        { ts: '2026-05-12T13:55:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 10, outputTokens: 5, sourcePath: '/s.jsonl' },
        { ts: '2026-05-12T15:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 10, outputTokens: 5, sourcePath: '/s.jsonl' },
      ],
    };
    const snap = build(sessions, usage).snapshot({ week: '2026-W20' });
    // Two distinct UTC hours: 13 and 15
    expect(snap.focusHours).toBe(2);
  });

  test('historical focus hours include usage from sessions that stayed active later', () => {
    const sessions = [makeSession({
      id: 'cross-week',
      sourcePath: '/cross-week.jsonl',
      lastActiveAt: '2026-05-19T10:00:00.000Z',
    })];
    const usage = {
      '/cross-week.jsonl': [
        { ts: '2026-05-12T13:05:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 10, outputTokens: 5, sourcePath: '/cross-week.jsonl' },
        { ts: '2026-05-19T10:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 20, outputTokens: 5, sourcePath: '/cross-week.jsonl' },
      ],
    };

    const snap = build(sessions, usage).snapshot({ week: '2026-W20' });

    expect(snap.focusHours).toBe(1);
  });

  test('wow compares this week to previous week', () => {
    const sessions: AgentSession[] = [
      makeSession({ id: 'now', sourcePath: '/now.jsonl', lastActiveAt: '2026-05-12T10:00:00.000Z' }),
      makeSession({ id: 'now2', sourcePath: '/now2.jsonl', lastActiveAt: '2026-05-13T10:00:00.000Z' }),
      makeSession({ id: 'prev', sourcePath: '/prev.jsonl', lastActiveAt: '2026-05-05T10:00:00.000Z' }),
    ];
    const snap = build(sessions).snapshot({ week: '2026-W20' });
    expect(snap.wow.sessions).toEqual({ now: 2, prev: 1 });
  });

  test('snapshotAsync scans from the previous ISO week without a file-count limit', async () => {
    const source = new FakeSource('claude', []);
    const service = build([], {}, source);

    await service.snapshotAsync({ week: '2026-W20' });

    expect(source.scanOptions).toHaveLength(1);
    expect(source.scanOptions[0]).toMatchObject({
      root: '/',
      modifiedSinceMs: Date.parse('2026-05-04T00:00:00.000Z'),
    });
    expect(source.scanOptions[0]?.limit).toBeUndefined();
  });

  test('uses distinct exact usage windows for current and previous week', () => {
    const session = makeSession({
      id: 'range',
      sourcePath: '/range.jsonl',
      lastActiveAt: '2026-05-18T00:00:00.000Z',
    });
    const usage: Record<string, UsageEvent[]> = {
      '/range.jsonl': [
        { ts: '2026-05-03T23:59:59.999Z', model: 'claude-sonnet-4-6', inputTokens: 999, outputTokens: 0, sourcePath: '/range.jsonl' },
        { ts: '2026-05-04T00:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 50, sourcePath: '/range.jsonl' },
        { ts: '2026-05-11T00:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 200, outputTokens: 25, sourcePath: '/range.jsonl' },
        { ts: '2026-05-18T00:00:00.000Z', model: 'claude-sonnet-4-6', inputTokens: 888, outputTokens: 0, sourcePath: '/range.jsonl' },
      ],
    };

    const snap = build([session], usage).snapshot({ week: '2026-W20' });

    expect(snap.wow.tokens).toEqual({ now: 225, prev: 150 });
    expect(snap.wow.cost.now).toBeCloseTo(0.000975, 9);
    expect(snap.wow.cost.prev).toBeCloseTo(0.00105, 9);
  });
});
