import type { AgentProvider } from '@stash/shared';
import type { AggregateOptions, AggregateResult } from './aggregator.js';

export type SessionScanMode = 'full' | 'activity';

export interface SessionScanExecutor {
  scan(mode: SessionScanMode, options: AggregateOptions): Promise<AggregateResult>;
}

export interface SessionScanWorkerConfig {
  roots: Partial<Record<AgentProvider, string>>;
  cacheDbPath?: string;
}

export interface SessionScanRequest {
  id: number;
  mode: SessionScanMode;
  options: AggregateOptions;
  config: SessionScanWorkerConfig;
}

export type SessionScanResponse =
  | { id: number; result: AggregateResult }
  | { id: number; error: string };

interface PendingScan {
  resolve: (result: AggregateResult) => void;
  reject: (error: Error) => void;
}

/**
 * Runs filesystem discovery and JSONL parsing in a dedicated Bun worker.
 * SQLite-backed session cache access stays available through a second
 * connection to the same local database.
 */
export class SessionScanWorker implements SessionScanExecutor {
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, PendingScan>();

  constructor(private readonly config: SessionScanWorkerConfig) {}

  scan(mode: SessionScanMode, options: AggregateOptions): Promise<AggregateResult> {
    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        const request: SessionScanRequest = { id, mode, options, config: this.config };
        worker.postMessage(request);
      } catch (error) {
        this.pending.delete(id);
        reject(toError('session scan worker request failed', error));
      }
    });
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL('./session-scan-worker-entry.ts', import.meta.url).href);
    (worker as Worker & { unref(): void }).unref();
    worker.onmessage = (event: MessageEvent<SessionScanResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if ('error' in response) {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response.result);
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      this.failWorker(new Error(`session scan worker crashed: ${event.message}`));
    };
    worker.onmessageerror = () => {
      this.failWorker(new Error('session scan worker returned an unreadable response'));
    };
    this.worker = worker;
    return worker;
  }

  private failWorker(error: Error): void {
    const failed = this.worker;
    this.worker = undefined;
    failed?.terminate();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function toError(prefix: string, error: unknown): Error {
  return new Error(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
}
