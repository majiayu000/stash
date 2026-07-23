import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentSession, UsageEvent } from '@stash/shared';
import { ClaudeSource } from '../../adapters/claude/scanner.js';
import { openDatabaseMigrated } from '../../db/connection.js';
import { fixedClock } from '@stash/shared';
import { createApp } from '../../web/app-factory.js';

const CACHE_ROWS = 16_384;
const COLD_METADATA_ROWS = 2;
const RECENT_CANDIDATES = 6_000;
const USAGE_EVENTS = 50_000;
const BURN_BUDGET_MS = 1_000;
const HEALTH_BUDGET_MS = 250;
const RSS_BUDGET_BYTES = 250 * 1024 * 1024;
const NOW = '2026-05-14T12:00:00.000Z';
const CHILD_FLAG = 'STASH_BURN_PERFORMANCE_CHILD';
const IS_CHILD = process.env[CHILD_FLAG] === '1';

interface BenchmarkEvidence {
  benchmark: string;
  elapsedMs: number[];
  healthMs: number;
  eventLoopTailLagMs: number;
  workerHeapSeries: number[];
  rssBaseline: number;
  rssSeries: number[];
  rssFinalDelta: number;
  checksum: { tokens: number; cost: number; sessions: number } | undefined;
}

interface BurnResponse {
  data: {
    totals: { tokens: number; cost: number; sessions: number };
    dailySpend: Array<{ date: string; tokens: number; cost: number }>;
    modelMix: Array<{ model: string; tokens: number; cost: number; share: number }>;
    perProjectLeaderboard: Array<{
      projectId: string;
      tokens: number;
      cost: number;
      sessions: number;
      share: number;
    }>;
  };
  cache: {
    filesDiscovered: number;
    filesSeen: number;
    filesReused: number;
    workerHeapBytes: number;
  };
}

describe('GET /api/analytics/burn bounded worker performance', () => {
  if (!IS_CHILD) {
    test('passes the 16k/6k/50k benchmark in a clean Bun process', async () => {
      const child = Bun.spawn(
        [process.execPath, 'test', fileURLToPath(import.meta.url)],
        {
          cwd: process.cwd(),
          env: { ...process.env, [CHILD_FLAG]: '1' },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const evidence = parseBenchmarkEvidence(`${stdout}\n${stderr}`);

      if (exitCode !== 0) console.error(`${stdout}\n${stderr}`);
      expect(exitCode).toBe(0);
      expect(evidence).toBeDefined();
      console.info(JSON.stringify(evidence));
    }, 70_000);

    test('captures a 300ms event-loop stall beginning at 300ms', async () => {
      const stall = new Promise<void>((resolve) => {
        setTimeout(() => {
          const stallStarted = performance.now();
          while (performance.now() - stallStarted < 300) {
            // Intentionally block to prove the event-loop monitor observes tail stalls.
          }
          resolve();
        }, 300);
      });
      const monitor = monitorEventLoopTail();

      await stall;
      const lagMs = await monitor.finish();

      expect(lagMs).toBeGreaterThan(HEALTH_BUDGET_MS);
    }, 2_000);
    return;
  }

  test('keeps a 16k/6k/50k warm Burn exact, responsive, and memory bounded', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-burn-performance-'));
    const claudeRoot = join(root, 'claude');
    const projectDir = join(claudeRoot, 'projects', 'bulk');
    const dbPath = join(root, 'stash.db');
    mkdirSync(projectDir, { recursive: true });
    const db = openDatabaseMigrated({ path: dbPath });
    const originalGetUsage = ClaudeSource.prototype.getUsage;
    let mainThreadUsageReads = 0;
    ClaudeSource.prototype.getUsage = function getUsageOnMainThread(sourcePath: string) {
      mainThreadUsageReads++;
      return originalGetUsage.call(this, sourcePath);
    };

    try {
      seedCacheFixture(db, projectDir);
      const coldMetadata = seedColdMetadataFixtures(projectDir);
      expect(cacheRowCount(db)).toBe(CACHE_ROWS);
      const app = createApp({
        db,
        clock: fixedClock(NOW),
        claudeRoot,
        sessionSpawnMode: 'disabled',
      });

      for (let warmupIndex = 0; warmupIndex < 4; warmupIndex++) {
        const warmup = await app.request('/api/analytics/burn?days=30');
        expect(warmup.status).toBe(200);
      }
      Bun.gc(true);
      const rssBaseline = process.memoryUsage().rss;
      const rssSeries: number[] = [];
      const workerHeapSeries: number[] = [];
      const elapsedSeries: number[] = [];
      let healthMs = 0;
      let eventLoopTailLagMs = 0;
      let last: BurnResponse | undefined;

      for (let iteration = 0; iteration < 3; iteration++) {
        Bun.gc(true);
        const measurement = await runMeasuredBurn(app);
        healthMs = Math.max(healthMs, measurement.healthMs);
        elapsedSeries.push(measurement.elapsedMs);
        eventLoopTailLagMs = Math.max(eventLoopTailLagMs, measurement.eventLoopTailLagMs);
        last = measurement.response;
        workerHeapSeries.push(measurement.response.cache.workerHeapBytes);
        Bun.gc(true);
        rssSeries.push(process.memoryUsage().rss);
      }

      expect(last?.data.totals.tokens).toBe(USAGE_EVENTS * 15);
      expect(last?.data.totals.cost).toBeCloseTo(5.25, 10);
      expect(last?.data.totals.sessions).toBe(RECENT_CANDIDATES);
      expect(last?.data.dailySpend.find((bucket) => bucket.date === '2026-05-14')?.tokens)
        .toBe(USAGE_EVENTS * 15);
      expect(last?.data.modelMix).toHaveLength(1);
      expect(last?.data.modelMix[0]).toMatchObject({
        model: 'claude-sonnet-4-6',
        tokens: USAGE_EVENTS * 15,
        share: 1,
      });
      expect(last?.data.modelMix[0]?.cost).toBeCloseTo(5.25, 10);
      expect(last?.data.perProjectLeaderboard).toHaveLength(4);
      expect(last?.cache).toMatchObject({
        filesDiscovered: CACHE_ROWS + COLD_METADATA_ROWS,
        filesSeen: CACHE_ROWS + COLD_METADATA_ROWS,
        filesReused: CACHE_ROWS + COLD_METADATA_ROWS,
      });
      expect(cacheRowCount(db)).toBe(CACHE_ROWS + COLD_METADATA_ROWS);
      expect(cachedUsageJson(db, coldMetadata.outsideWindow)).toBe('null');
      expect(cachedUsageJson(db, coldMetadata.recentEmpty)).toBe('[]');
      console.info(JSON.stringify({
        benchmark: 'burn-worker-16384-6000-50000',
        elapsedMs: elapsedSeries.map(roundMs),
        healthMs: roundMs(healthMs),
        eventLoopTailLagMs: roundMs(eventLoopTailLagMs),
        workerHeapSeries,
        rssBaseline,
        rssSeries,
        rssFinalDelta: rssSeries.at(-1)! - rssBaseline,
        checksum: last?.data.totals,
      }));
      expect(mainThreadUsageReads).toBe(0);
      expect(JSON.stringify(last)).not.toContain('usageBySource');
      expect(Math.max(...elapsedSeries)).toBeLessThanOrEqual(BURN_BUDGET_MS);
      expect(healthMs).toBeLessThanOrEqual(HEALTH_BUDGET_MS);
      expect(eventLoopTailLagMs).toBeLessThanOrEqual(HEALTH_BUDGET_MS);
      expect(isStrictlyIncreasing(workerHeapSeries)).toBe(false);
      expect(rssSeries.at(-1)! - rssBaseline).toBeLessThanOrEqual(RSS_BUDGET_BYTES);

    } finally {
      ClaudeSource.prototype.getUsage = originalGetUsage;
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

function seedCacheFixture(db: ReturnType<typeof openDatabaseMigrated>, projectDir: string): void {
  const insert = db.prepare(
    `insert into agent_session_cache(
       provider, source_path, mtime_ms, size_bytes, session_json, usage_json, indexed_at
     ) values (?, ?, ?, ?, ?, ?, ?)`,
  );
  const seed = db.transaction(() => {
    let emitted = 0;
    for (let index = 0; index < CACHE_ROWS; index++) {
      const sourcePath = join(projectDir, `session-${index.toString().padStart(5, '0')}.jsonl`);
      writeFileSync(sourcePath, '{}\n');
      const stat = statSync(sourcePath);
      const recent = index < RECENT_CANDIDATES;
      const eventCount = recent
        ? Math.floor(USAGE_EVENTS / RECENT_CANDIDATES)
          + (index < USAGE_EVENTS % RECENT_CANDIDATES ? 1 : 0)
        : 0;
      const usage: UsageEvent[] = [];
      for (let eventIndex = 0; eventIndex < eventCount; eventIndex++) {
        usage.push({
          ts: '2026-05-14T08:00:00.000Z',
          model: 'claude-sonnet-4-6',
          inputTokens: 10,
          outputTokens: 5,
          sourcePath,
        });
      }
      emitted += eventCount;
      const session: AgentSession = {
        id: `session-${index}`,
        provider: 'claude',
        sourcePath,
        cwd: projectDir,
        status: 'idle',
        title: `session ${index}`,
        filesTouched: [],
        toolCount: 0,
        messageCount: 0,
        lastActiveAt: recent ? '2026-05-14T08:00:00.000Z' : '2026-01-01T00:00:00.000Z',
        projectId: recent ? `project-${index % 4}` : undefined,
      };
      insert.run(
        'claude',
        sourcePath,
        stat.mtimeMs,
        stat.size,
        JSON.stringify(session),
        recent ? JSON.stringify(usage) : '{outside-window-usage-must-not-be-read',
        NOW,
      );
    }
    expect(emitted).toBe(USAGE_EVENTS);
  });
  seed();
}

function seedColdMetadataFixtures(projectDir: string): {
  outsideWindow: string;
  recentEmpty: string;
} {
  const outsideWindow = join(projectDir, 'cold-outside-window.jsonl');
  const recentEmpty = join(projectDir, 'cold-recent-empty.jsonl');
  writeMetadataOnlyClaudeFixture(outsideWindow, 'cold-outside', '2026-01-01T08:00:00.000Z');
  writeMetadataOnlyClaudeFixture(recentEmpty, 'cold-recent', '2026-05-14T08:00:00.000Z');
  return { outsideWindow, recentEmpty };
}

function writeMetadataOnlyClaudeFixture(sourcePath: string, sessionId: string, timestamp: string): void {
  writeFileSync(sourcePath, `${JSON.stringify({
    type: 'user',
    timestamp,
    sessionId,
    cwd: '/tmp/cold-metadata',
    message: { role: 'user', content: 'metadata only' },
  })}\n`);
}

function cacheRowCount(db: ReturnType<typeof openDatabaseMigrated>): number {
  return db.query<{ count: number }, []>(
    'select count(*) as count from agent_session_cache',
  ).get()?.count ?? 0;
}

function cachedUsageJson(
  db: ReturnType<typeof openDatabaseMigrated>,
  sourcePath: string,
): string | undefined {
  return db
    .query<{ usage_json: string }, [string]>(
      'select usage_json from agent_session_cache where source_path = ?',
    )
    .get(sourcePath)?.usage_json;
}

function isStrictlyIncreasing(values: number[]): boolean {
  return values.length > 1 && values.every((value, index) => index === 0 || value > values[index - 1]!);
}

function roundMs(value: number): number {
  return Number(value.toFixed(3));
}

async function runMeasuredBurn(app: ReturnType<typeof createApp>): Promise<{
  elapsedMs: number;
  healthMs: number;
  eventLoopTailLagMs: number;
  response: BurnResponse;
}> {
  const started = performance.now();
  const tailMonitor = monitorEventLoopTail();
  let result: {
    elapsedMs: number;
    healthMs: number;
    response: BurnResponse;
  } | undefined;
  let eventLoopTailLagMs = 0;
  try {
    const burnRequest = app.request('/api/analytics/burn?days=30');
    const healthStarted = performance.now();
    const healthRequest = Promise.resolve(app.request('/health')).then(
      (response: Response) => ({
        response,
        elapsedMs: performance.now() - healthStarted,
      }),
    );
    const [burnResponse, health] = await Promise.all([burnRequest, healthRequest]);
    const elapsedMs = performance.now() - started;
    expect(burnResponse.status).toBe(200);
    expect(health.response.status).toBe(200);
    const response = await burnResponse.json() as BurnResponse;
    result = {
      elapsedMs,
      healthMs: health.elapsedMs,
      response,
    };
  } finally {
    eventLoopTailLagMs = await tailMonitor.finish();
  }
  if (!result) throw new Error('Burn measurement did not complete');
  return { ...result, eventLoopTailLagMs };
}

function monitorEventLoopTail(intervalMs = 50): { finish: () => Promise<number> } {
  let expectedAt = performance.now() + intervalMs;
  let maximumLagMs = 0;
  let finishRequested = false;
  let finish: ((lagMs: number) => void) | undefined;
  const finished = new Promise<number>((resolve) => {
    finish = resolve;
  });

  const tick = () => {
    const tickedAt = performance.now();
    maximumLagMs = Math.max(maximumLagMs, tickedAt - expectedAt);
    if (finishRequested) {
      finish?.(maximumLagMs);
      return;
    }
    expectedAt = tickedAt + intervalMs;
    setTimeout(tick, intervalMs);
  };
  setTimeout(tick, intervalMs);

  return {
    finish: () => {
      finishRequested = true;
      return finished;
    },
  };
}

function parseBenchmarkEvidence(output: string): BenchmarkEvidence | undefined {
  for (const line of output.split('\n')) {
    if (!line.startsWith('{"benchmark":"burn-worker-16384-6000-50000"')) continue;
    return JSON.parse(line) as BenchmarkEvidence;
  }
  return undefined;
}
