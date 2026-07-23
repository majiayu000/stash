import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
});
