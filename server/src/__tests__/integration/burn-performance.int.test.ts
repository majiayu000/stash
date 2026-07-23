import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AgentSession, UsageEvent } from '@stash/shared';
import { ClaudeSource } from '../../adapters/claude/scanner.js';
import { openDatabaseMigrated } from '../../db/connection.js';
import { fixedClock } from '@stash/shared';
import { createApp } from '../../web/app-factory.js';

const CACHE_ROWS = 16_384;
const RECENT_CANDIDATES = 6_000;
const USAGE_EVENTS = 50_000;
const BURN_BUDGET_MS = 1_000;
const HEALTH_BUDGET_MS = 250;
const RSS_BUDGET_BYTES = 250 * 1024 * 1024;
const NOW = '2026-05-14T12:00:00.000Z';

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
  };
}

describe('GET /api/analytics/burn bounded worker performance', () => {
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
      const elapsedSeries: number[] = [];
      let healthMs = 0;
      let last: BurnResponse | undefined;

      for (let iteration = 0; iteration < 3; iteration++) {
        Bun.gc(true);
        const started = performance.now();
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
        healthMs = Math.max(healthMs, health.elapsedMs);
        elapsedSeries.push(elapsedMs);
        last = await burnResponse.json() as BurnResponse;
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
        filesDiscovered: CACHE_ROWS,
        filesSeen: CACHE_ROWS,
        filesReused: CACHE_ROWS,
      });
      console.info(JSON.stringify({
        benchmark: 'burn-worker-16384-6000-50000',
        elapsedMs: elapsedSeries.map(roundMs),
        healthMs: roundMs(healthMs),
        rssBaseline,
        rssSeries,
        rssFinalDelta: rssSeries.at(-1)! - rssBaseline,
        checksum: last?.data.totals,
      }));
      expect(mainThreadUsageReads).toBe(0);
      expect(JSON.stringify(last)).not.toContain('usageBySource');
      expect(Math.max(...elapsedSeries)).toBeLessThanOrEqual(BURN_BUDGET_MS);
      expect(healthMs).toBeLessThanOrEqual(HEALTH_BUDGET_MS);
      expect(isStrictlyIncreasing(rssSeries)).toBe(false);
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

function isStrictlyIncreasing(values: number[]): boolean {
  return values.length > 1 && values.every((value, index) => index === 0 || value > values[index - 1]!);
}

function roundMs(value: number): number {
  return Number(value.toFixed(3));
}
