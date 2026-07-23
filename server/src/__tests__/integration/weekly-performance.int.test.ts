import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fixedClock, type WeeklySnapshot } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { createApp } from '../../web/app-factory.js';
import type { AggregateScanCacheStats } from '../../adapters/aggregator.js';
import {
  seedWeeklyPerformanceFixture,
  WEEKLY_PERFORMANCE_FILE_COUNT,
} from '../../testing/weekly-performance-fixture.js';

const NOW = '2026-07-09T12:00:00.000Z';
const COLD_API_BUDGET_MS = 2_000;
const WARM_API_BUDGET_MS = 250;

interface WeeklyBenchmarkResponse {
  data: WeeklySnapshot;
  cache: AggregateScanCacheStats;
}

interface SessionListResponse {
  count: number;
  cache: AggregateScanCacheStats;
}

describe('GET /api/analytics/weekly cold-history performance', () => {
  test('keeps exact totals when 3,000 files are mtime candidates but 2,998 contain old activity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-weekly-performance-'));
    const db = freshDb();
    try {
      const projectDir = join(root, 'claude', 'projects', '-Users-test-weekly');
      const codexRoot = join(root, 'codex');
      mkdirSync(projectDir, { recursive: true });
      mkdirSync(join(codexRoot, 'sessions'), { recursive: true });
      const fixture = seedWeeklyPerformanceFixture({
        projectDir,
        oldTimestamp: '2025-01-01T08:00:00.000Z',
        previousTimestamp: '2026-07-01T08:00:00.000Z',
        currentTimestamp: '2026-07-08T08:00:00.000Z',
        candidateMtime: new Date('2026-07-09T09:00:00.000Z'),
      });
      expect(fixture.files).toHaveLength(WEEKLY_PERFORMANCE_FILE_COUNT);
      expect(fixture.uniqueInodes).toBe(WEEKLY_PERFORMANCE_FILE_COUNT);
      expect(fixture.oldFileBytes).toBeGreaterThanOrEqual(512 * 1024);

      const app = createApp({
        db,
        clock: fixedClock(NOW),
        claudeRoot: join(root, 'claude'),
        codexRoot,
        sessionSpawnMode: 'disabled',
      });

      const coldStarted = performance.now();
      const coldRequest = app.request('/api/analytics/weekly');
      const healthQueuedAt = performance.now();
      const healthRequest = Promise.resolve().then(async () => {
        const response = await app.request('/health');
        return { response, elapsedMs: performance.now() - healthQueuedAt };
      });
      const [coldResponse, healthResult] = await Promise.all([coldRequest, healthRequest]);
      const coldMs = performance.now() - coldStarted;
      const healthMs = healthResult.elapsedMs;
      const cold = await coldResponse.json() as WeeklyBenchmarkResponse;

      expect(coldResponse.status).toBe(200);
      expect(coldMs).toBeLessThanOrEqual(COLD_API_BUDGET_MS);
      expect(healthResult.response.status).toBe(200);
      expect(healthMs).toBeLessThanOrEqual(WARM_API_BUDGET_MS);
      expect(cold.cache).toMatchObject({
        filesDiscovered: WEEKLY_PERFORMANCE_FILE_COUNT,
        filesSeen: WEEKLY_PERFORMANCE_FILE_COUNT,
        filesIndexed: WEEKLY_PERFORMANCE_FILE_COUNT,
        filesReused: 0,
      });
      expect(cold.data.wow.sessions).toEqual({ now: 1, prev: 1 });
      expect(cold.data.wow.tokens).toEqual({ now: 225, prev: 150 });
      expect(cold.data.wow.cost.now).toBeCloseTo(0.000975, 9);
      expect(cold.data.wow.cost.prev).toBeCloseTo(0.00105, 9);

      const warmStarted = performance.now();
      const warmResponse = await app.request('/api/analytics/weekly');
      const warmMs = performance.now() - warmStarted;
      const warm = await warmResponse.json() as WeeklyBenchmarkResponse;

      expect(warmResponse.status).toBe(200);
      expect(warmMs).toBeLessThanOrEqual(WARM_API_BUDGET_MS);
      expect(warm.cache).toMatchObject({
        filesDiscovered: WEEKLY_PERFORMANCE_FILE_COUNT,
        filesSeen: WEEKLY_PERFORMANCE_FILE_COUNT,
        filesIndexed: 0,
        filesReused: WEEKLY_PERFORMANCE_FILE_COUNT,
      });
      expect(warm.data.wow).toEqual(cold.data.wow);

      const sessionScanStarted = performance.now();
      const sessionRequest = app.request('/api/agent-sessions?provider=claude');
      const sessionHealthQueuedAt = performance.now();
      const sessionHealthRequest = Promise.resolve().then(async () => {
        const response = await app.request('/health');
        return { response, elapsedMs: performance.now() - sessionHealthQueuedAt };
      });
      const [sessionResponse, sessionHealthResult] = await Promise.all([
        sessionRequest,
        sessionHealthRequest,
      ]);
      const sessionScanMs = performance.now() - sessionScanStarted;
      const sessionHealthMs = sessionHealthResult.elapsedMs;
      const sessionList = await sessionResponse.json() as SessionListResponse;

      expect(sessionResponse.status).toBe(200);
      expect(sessionHealthResult.response.status).toBe(200);
      expect(sessionHealthMs).toBeLessThanOrEqual(WARM_API_BUDGET_MS);
      expect(sessionList.count).toBe(100);
      expect(sessionList.cache).toMatchObject({
        filesDiscovered: WEEKLY_PERFORMANCE_FILE_COUNT,
        filesSeen: 100,
      });

      console.info(JSON.stringify({
        benchmark: 'weekly-api-3000-independent-inodes',
        coldMs: Number(coldMs.toFixed(3)),
        warmMs: Number(warmMs.toFixed(3)),
        healthMs: Number(healthMs.toFixed(3)),
        sessionScanMs: Number(sessionScanMs.toFixed(3)),
        sessionHealthMs: Number(sessionHealthMs.toFixed(3)),
        filesDiscovered: cold.cache.filesDiscovered,
        filesSeen: cold.cache.filesSeen,
      }));

    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns an explicit error instead of partial analytics when a candidate cannot be parsed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-weekly-source-error-'));
    const db = freshDb();
    try {
      const projectDir = join(root, 'claude', 'projects', '-Users-test-broken');
      const codexRoot = join(root, 'codex');
      mkdirSync(projectDir, { recursive: true });
      mkdirSync(join(codexRoot, 'sessions'), { recursive: true });
      const broken = join(projectDir, 'broken.jsonl');
      writeFileSync(broken, 'not-json\n');
      const recentMtime = new Date('2026-07-08T09:00:00.000Z');
      utimesSync(broken, recentMtime, recentMtime);
      const app = createApp({
        db,
        clock: fixedClock(NOW),
        claudeRoot: join(root, 'claude'),
        codexRoot,
        sessionSpawnMode: 'disabled',
      });

      const response = await app.request('/api/analytics/weekly');
      const body = await response.json() as { error: { code: string; message: string } };

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL');
      expect(body.error.message).toContain('weekly analytics source scan failed (1)');
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects nonexistent ISO week labels at the HTTP boundary', async () => {
    const db = freshDb();
    try {
      const app = createApp({ db, clock: fixedClock(NOW), sessionSpawnMode: 'disabled' });
      const response = await app.request('/api/analytics/weekly?week=2021-W53');
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION');
    } finally {
      db.close();
    }
  });

  test('keeps public Burn cumulative semantics while Weekly uses timestamped Codex deltas', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-weekly-codex-contract-'));
    const db = freshDb();
    try {
      const claudeRoot = join(root, 'claude');
      const codexRoot = join(root, 'codex');
      const sessionsDir = join(codexRoot, 'sessions', '2026', '07', '08');
      mkdirSync(join(claudeRoot, 'projects'), { recursive: true });
      mkdirSync(sessionsDir, { recursive: true });
      writeCodexCrossWeekFixture(join(sessionsDir, 'rollout-cross-week.jsonl'));
      const app = createApp({
        db,
        clock: fixedClock(NOW),
        claudeRoot,
        codexRoot,
        sessionSpawnMode: 'disabled',
      });

      const burnResponse = await app.request('/api/analytics/burn?days=30');
      const burn = await burnResponse.json() as { data: { totals: { tokens: number; sessions: number } } };
      expect(burnResponse.status).toBe(200);
      expect(burn.data.totals).toMatchObject({ tokens: 2_650, sessions: 1 });

      const weeklyResponse = await app.request('/api/analytics/weekly');
      const weekly = await weeklyResponse.json() as WeeklyBenchmarkResponse;
      expect(weeklyResponse.status).toBe(200);
      expect(weekly.data.wow.tokens).toEqual({ now: 950, prev: 600 });
      expect(weekly.cache).toMatchObject({ filesIndexed: 1, filesReused: 0 });
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeCodexCrossWeekFixture(sourcePath: string): void {
  const token = (timestamp: string, input: number, output: number) => ({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: input, output_tokens: output } },
    },
  });
  const lines = [
    { timestamp: '2026-06-28T22:00:00.000Z', type: 'session_meta', payload: { id: 'cross-week', cwd: '/tmp/cross-week' } },
    { timestamp: '2026-06-28T22:30:00.000Z', type: 'turn_context', payload: { model: 'gpt-5' } },
    token('2026-06-28T23:00:00.000Z', 1_000, 100),
    token('2026-07-01T08:00:00.000Z', 1_500, 200),
    token('2026-07-08T08:00:00.000Z', 2_300, 350),
  ];
  writeFileSync(sourcePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
}
