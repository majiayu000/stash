import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openDatabaseMigrated } from '../db/connection.js';
import { AgentSessionCache } from './session-cache.js';
import { ClaudeSource } from './claude/scanner.js';
import { SessionScanWorker } from './session-scan-worker.js';

describe('SessionScanWorker', () => {
  test('returns an empty scan from the worker when configured roots are absent', async () => {
    const scanner = new SessionScanWorker({
      roots: {
        claude: '/tmp/__stash_missing_worker_claude_root__',
        codex: '/tmp/__stash_missing_worker_codex_root__',
      },
    });

    const result = await scanner.scan('full', { provider: 'all' });

    expect(result.sessions).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.cache).toMatchObject({
      filesDiscovered: 0,
      filesSeen: 0,
      filesIndexed: 0,
      filesReused: 0,
    });
  });

  test('rejects visibly when the worker cannot open its configured cache database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-worker-cache-error-'));
    try {
      const blocker = join(root, 'not-a-directory');
      writeFileSync(blocker, 'blocked');
      const scanner = new SessionScanWorker({
        roots: {},
        cacheDbPath: join(blocker, 'stash.db'),
      });

      await expect(scanner.scan('full', {})).rejects.toThrow('session scan worker failed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects visibly when posting a worker request fails', async () => {
    const originalWorker = globalThis.Worker;
    class ThrowingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      unref(): void {}
      terminate(): void {}
      postMessage(): void {
        throw new Error('post failed');
      }
    }

    try {
      globalThis.Worker = ThrowingWorker as unknown as typeof Worker;
      const scanner = new SessionScanWorker({ roots: {} });
      await expect(scanner.scan('full', {})).rejects.toThrow(
        'session scan worker request failed: post failed',
      );
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  test('rejects pending work when the worker reports an unreadable response', async () => {
    const originalWorker = globalThis.Worker;
    class MessageErrorWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      unref(): void {}
      terminate(): void {}
      postMessage(): void {
        this.onmessageerror?.(new MessageEvent('messageerror'));
      }
    }

    try {
      globalThis.Worker = MessageErrorWorker as unknown as typeof Worker;
      const scanner = new SessionScanWorker({ roots: {} });
      await expect(scanner.scan('activity', {})).rejects.toThrow(
        'session scan worker returned an unreadable response',
      );
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  test('rejects a structurally invalid worker payload', async () => {
    const originalWorker = globalThis.Worker;
    class InvalidPayloadWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      unref(): void {}
      terminate(): void {}
      postMessage(): void {
        this.onmessage?.(new MessageEvent('message', {
          data: { id: 1, kind: 'burn', result: { totals: {} } },
        }));
      }
    }

    try {
      globalThis.Worker = InvalidPayloadWorker as unknown as typeof Worker;
      const scanner = new SessionScanWorker({ roots: {} });
      await expect(scanner.aggregateBurn({ startMs: 0, days: 1, rates: [] })).rejects.toThrow(
        'session scan worker returned an unreadable response',
      );
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  test('aggregates usage inside the worker with custom rates and no raw events response', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-worker-burn-'));
    try {
      const projectDir = join(root, 'projects', 'project');
      mkdirSync(projectDir, { recursive: true });
      const sourcePath = join(projectDir, 'session.jsonl');
      writeClaudeFixture(sourcePath, '2026-05-14T08:00:00.000Z', 100, 50);
      const oldMtime = new Date('2026-01-01T00:00:00.000Z');
      utimesSync(sourcePath, oldMtime, oldMtime);
      const scanner = new SessionScanWorker({ roots: { claude: root } });

      const result = await scanner.aggregateBurn({
        startMs: Date.parse('2026-05-10T00:00:00.000Z'),
        days: 7,
        rates: [{ model: 'custom-model', inputPerM: 10, outputPerM: 20 }],
      });

      expect(result.totals).toEqual({ tokens: 150, cost: 0.002, sessions: 1 });
      expect(result.dailySpend.find((bucket) => bucket.date === '2026-05-14')?.tokens).toBe(150);
      expect(result.modelMix).toEqual([{ model: 'custom-model', tokens: 150, cost: 0.002 }]);
      expect(result.cache).toMatchObject({ filesDiscovered: 1, filesSeen: 1 });
      expect(JSON.stringify(result)).not.toContain('usageBySource');
      expect(JSON.stringify(result)).not.toContain(sourcePath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects Burn when cached usage is corrupt instead of returning partial data', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-worker-burn-cache-error-'));
    const dbPath = join(root, 'stash.db');
    const db = openDatabaseMigrated({ path: dbPath });
    try {
      const projectDir = join(root, 'claude', 'projects', 'project');
      mkdirSync(projectDir, { recursive: true });
      const sourcePath = join(projectDir, 'session.jsonl');
      writeClaudeFixture(sourcePath, '2026-05-14T08:00:00.000Z', 100, 50);
      const source = new ClaudeSource(new AgentSessionCache(db));
      expect(source.scan({ root: join(root, 'claude') }).cache?.filesIndexed).toBe(1);
      db.prepare(
        'update agent_session_cache set usage_json = ? where provider = ? and source_path = ?',
      ).run('{broken', 'claude', sourcePath);

      const scanner = new SessionScanWorker({
        roots: { claude: join(root, 'claude') },
        cacheDbPath: dbPath,
      });
      await expect(scanner.aggregateBurn({
        startMs: Date.parse('2026-05-10T00:00:00.000Z'),
        days: 7,
        rates: [],
      })).rejects.toThrow(`invalid agent usage cache for claude:${sourcePath}`);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects every pending request and permits recovery after a worker crash', async () => {
    const originalWorker = globalThis.Worker;
    let active: CrashWorker | undefined;
    class CrashWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      constructor() {
        active = this;
      }
      unref(): void {}
      terminate(): void {}
      postMessage(): void {}
      crash(): void {
        this.onerror?.({
          message: 'boom',
          preventDefault: () => {},
        } as ErrorEvent);
      }
    }

    try {
      globalThis.Worker = CrashWorker as unknown as typeof Worker;
      const scanner = new SessionScanWorker({ roots: {} });
      const scan = scanner.scan('full', {});
      const burn = scanner.aggregateBurn({ startMs: 0, days: 1, rates: [] });
      active?.crash();

      await expect(scan).rejects.toThrow('session scan worker crashed: boom');
      await expect(burn).rejects.toThrow('session scan worker crashed: boom');
      const retry = scanner.scan('full', {});
      expect(active).toBeDefined();
      active?.crash();
      await expect(retry).rejects.toThrow('session scan worker crashed: boom');
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  test('ignores late failure events from a terminated Worker generation', async () => {
    const originalWorker = globalThis.Worker;
    const instances: GenerationWorker[] = [];
    class GenerationWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      readonly requests: Array<{ id: number }> = [];

      constructor() {
        instances.push(this);
      }
      unref(): void {}
      terminate(): void {}
      postMessage(request: { id: number }): void {
        this.requests.push(request);
      }
      crash(message: string): void {
        this.onerror?.({ message, preventDefault: () => {} } as ErrorEvent);
      }
      respondToLatest(): void {
        const id = this.requests.at(-1)?.id;
        this.onmessage?.(new MessageEvent('message', {
          data: { id, kind: 'scan', result: emptyScanResult() },
        }));
      }
    }

    try {
      globalThis.Worker = GenerationWorker as unknown as typeof Worker;
      const scanner = new SessionScanWorker({ roots: {} });
      const first = scanner.scan('full', {});
      const workerA = instances[0]!;
      workerA.crash('generation A failed');
      await expect(first).rejects.toThrow('generation A failed');

      const second = scanner.scan('full', {});
      const workerB = instances[1]!;
      workerA.onmessage?.(new MessageEvent('message', { data: { invalid: true } }));
      workerA.onmessageerror?.(new MessageEvent('messageerror'));
      workerA.crash('late generation A failure');
      workerB.respondToLatest();

      await expect(second).resolves.toEqual(emptyScanResult());
    } finally {
      globalThis.Worker = originalWorker;
    }
  });
});

function writeClaudeFixture(
  sourcePath: string,
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const user = {
    type: 'user',
    timestamp,
    sessionId: 'session-worker-burn',
    cwd: '/tmp/project',
    message: { role: 'user', content: 'Inspect Burn worker' },
  };
  const assistant = {
    type: 'assistant',
    timestamp,
    message: {
      role: 'assistant',
      model: 'custom-model',
      content: [{ type: 'text', text: 'done' }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
  };
  writeFileSync(sourcePath, `${JSON.stringify(user)}\n${JSON.stringify(assistant)}\n`);
}

function emptyScanResult() {
  return {
    sessions: [],
    errors: [],
    cache: {
      refreshState: 'fresh' as const,
      generatedAt: '2026-05-14T00:00:00.000Z',
      filesDiscovered: 0,
      filesSeen: 0,
      filesIndexed: 0,
      filesReused: 0,
      sources: [],
    },
  };
}
