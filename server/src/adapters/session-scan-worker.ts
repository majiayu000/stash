import type { AgentProvider } from '@stash/shared';
import type { BurnAggregate, BurnAggregationRequest } from '../domain/analytics/burn.js';
import type { AggregateOptions, AggregateResult } from './aggregator.js';

export type SessionScanMode = 'full' | 'activity';

export interface SessionScanExecutor {
  scan(mode: SessionScanMode, options: AggregateOptions): Promise<AggregateResult>;
  aggregateBurn(request: BurnAggregationRequest): Promise<BurnAggregate>;
}

export interface SessionScanWorkerConfig {
  roots: Partial<Record<AgentProvider, string>>;
  cacheDbPath?: string;
}

export interface SessionScanRequest {
  id: number;
  kind: 'scan';
  mode: SessionScanMode;
  options: AggregateOptions;
  config: SessionScanWorkerConfig;
}

export interface BurnAggregationWorkerRequest {
  id: number;
  kind: 'burn';
  request: BurnAggregationRequest;
  config: SessionScanWorkerConfig;
}

export type SessionWorkerRequest = SessionScanRequest | BurnAggregationWorkerRequest;

export type SessionWorkerResponse =
  | { id: number; kind: 'scan'; result: AggregateResult }
  | { id: number; kind: 'burn'; result: BurnAggregate }
  | { id: number; kind: 'error'; error: string };

interface PendingRequest {
  kind: 'scan' | 'burn';
  accept: (response: SessionWorkerResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Runs filesystem discovery, cache access, JSONL parsing, and Burn aggregation
 * in one dedicated Bun worker. Only compact scan or aggregate results cross
 * the Worker boundary.
 */
export class SessionScanWorker implements SessionScanExecutor {
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly config: SessionScanWorkerConfig) {}

  scan(mode: SessionScanMode, options: AggregateOptions): Promise<AggregateResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const request: SessionScanRequest = {
        id,
        kind: 'scan',
        mode,
        options,
        config: this.config,
      };
      this.post(request, {
        kind: 'scan',
        accept: (response) => {
          if (response.kind === 'scan') resolve(response.result);
        },
        reject,
      });
    });
  }

  aggregateBurn(request: BurnAggregationRequest): Promise<BurnAggregate> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const workerRequest: BurnAggregationWorkerRequest = {
        id,
        kind: 'burn',
        request,
        config: this.config,
      };
      this.post(workerRequest, {
        kind: 'burn',
        accept: (response) => {
          if (response.kind === 'burn') resolve(response.result);
        },
        reject,
      });
    });
  }

  private post(request: SessionWorkerRequest, pending: PendingRequest): void {
    const worker = this.getWorker();
    this.pending.set(request.id, pending);
    try {
      worker.postMessage(request);
    } catch (error) {
      this.pending.delete(request.id);
      pending.reject(toError('session scan worker request failed', error));
    }
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(
      new URL('./session-scan-worker-entry.ts', import.meta.url).href,
      { smol: true, ref: false },
    );
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = decodeWorkerResponse(event.data);
      if (!response) {
        this.failWorker(worker, new Error('session scan worker returned an unreadable response'));
        return;
      }
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.kind === 'error') {
        pending.reject(new Error(response.error));
      } else if (response.kind !== pending.kind) {
        pending.reject(new Error(
          `session scan worker returned ${response.kind} for ${pending.kind} request`,
        ));
      } else {
        pending.accept(response);
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      this.failWorker(worker, new Error(`session scan worker crashed: ${event.message}`));
    };
    worker.onmessageerror = () => {
      this.failWorker(worker, new Error('session scan worker returned an unreadable response'));
    };
    this.worker = worker;
    return worker;
  }

  private failWorker(expectedWorker: Worker, error: Error): void {
    if (this.worker !== expectedWorker) return;
    const failed = expectedWorker;
    this.worker = undefined;
    failed?.terminate();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function decodeWorkerResponse(value: unknown): SessionWorkerResponse | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const response = value as Partial<SessionWorkerResponse>;
  if (typeof response.id !== 'number' || typeof response.kind !== 'string') return undefined;
  if (response.kind === 'error') {
    return typeof response.error === 'string'
      ? { id: response.id, kind: 'error', error: response.error }
      : undefined;
  }
  if (response.kind === 'scan') {
    if (!('result' in response) || !isAggregateResult(response.result)) return undefined;
    return response as { id: number; kind: 'scan'; result: AggregateResult };
  }
  if (response.kind === 'burn') {
    if (!('result' in response) || !isBurnAggregate(response.result)) return undefined;
    return response as { id: number; kind: 'burn'; result: BurnAggregate };
  }
  return undefined;
}

function isAggregateResult(value: unknown): value is AggregateResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<AggregateResult>;
  return Array.isArray(result.sessions)
    && Array.isArray(result.errors)
    && !!result.cache
    && typeof result.cache === 'object';
}

function isBurnAggregate(value: unknown): value is BurnAggregate {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<BurnAggregate>;
  return isBurnCalendar(result.calendar)
    && !!result.totals
    && typeof result.totals === 'object'
    && Array.isArray(result.dailySpend)
    && Array.isArray(result.hourlyHeatmap)
    && Array.isArray(result.modelMix)
    && Array.isArray(result.perProjectLeaderboard)
    && Array.isArray(result.dailyProjectSpend)
    && result.dailyProjectSpend.every(isDailyProjectSpend)
    && !!result.cache
    && typeof result.cache === 'object';
}

function isDailyProjectSpend(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.date === 'string'
    && typeof row.projectId === 'string'
    && typeof row.cost === 'number'
    && Number.isFinite(row.cost);
}

function isBurnCalendar(value: unknown): value is BurnAggregate['calendar'] {
  if (!value || typeof value !== 'object') return false;
  const calendar = value as Partial<BurnAggregate['calendar']>;
  if (typeof calendar.timeZone !== 'string' || !isCalendarRange(calendar.bucketRange)) return false;
  if (!calendar.evaluationRange || typeof calendar.evaluationRange !== 'object') return false;
  return typeof calendar.evaluationRange.start === 'string'
    && (calendar.evaluationRange.end === null || typeof calendar.evaluationRange.end === 'string');
}

function isCalendarRange(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const range = value as Record<string, unknown>;
  return typeof range.start === 'string'
    && typeof range.end === 'string'
    && typeof range.startDate === 'string'
    && typeof range.endDateExclusive === 'string';
}

function toError(prefix: string, error: unknown): Error {
  return new Error(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
}
