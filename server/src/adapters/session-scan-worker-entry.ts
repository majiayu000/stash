import { Database } from 'bun:sqlite';
import { heapSize } from 'bun:jsc';
import type { AgentProvider } from '@stash/shared';
import { AgentSourceAggregator } from './aggregator.js';
import { ClaudeSource } from './claude/scanner.js';
import { CodexSource } from './codex/scanner.js';
import { AgentSessionCache } from './session-cache.js';
import type { AgentSource } from './source.js';
import {
  aggregateBurnFromScan,
  type BurnAggregate,
  type BurnAggregationRequest,
} from '../domain/analytics/burn.js';
import type {
  SessionWorkerRequest,
  SessionWorkerResponse,
  SessionScanWorkerConfig,
} from './session-scan-worker.js';
import { buildSessionEventPage } from './session-event-page.js';
import { extractDecisions } from '../domain/capture/decision-extract.js';

let activeSignature = '';
let activeAggregator: AgentSourceAggregator | undefined;
let cacheDb: Database | undefined;

self.onmessage = (event: MessageEvent<SessionWorkerRequest>) => {
  const request = event.data;
  try {
    const aggregator = aggregatorFor(request.config);
    if (request.kind === 'scan') {
      const result = request.mode === 'activity'
        ? aggregator.scanActivity(request.options)
        : aggregator.scan(request.options);
      const response: SessionWorkerResponse = { id: request.id, kind: 'scan', result };
      postMessage(response);
    } else if (request.kind === 'burn') {
      const result = runBurnAggregation(aggregator, request.request);
      // The heavy scan and per-session usage arrays have left their helper
      // scope. Collect them before publishing completion, then expose the
      // Worker's own post-GC heap instead of inferring leaks from process RSS.
      Bun.gc(true);
      result.cache.workerHeapBytes = heapSize();
      const response: SessionWorkerResponse = { id: request.id, kind: 'burn', result };
      postMessage(response);
    } else if (request.kind === 'event-page') {
      const events = aggregator.getEvents(
        request.request.provider,
        request.request.sourcePath,
        0,
      );
      const result = buildSessionEventPage(events, request.request);
      const response: SessionWorkerResponse = {
        id: request.id,
        kind: 'event-page',
        result,
      };
      postMessage(response);
    } else {
      const events = aggregator.getEvents(
        request.request.provider,
        request.request.sourcePath,
        0,
      );
      const response: SessionWorkerResponse = {
        id: request.id,
        kind: 'decision-candidates',
        result: extractDecisions(events),
      };
      postMessage(response);
    }
  } catch (error) {
    const response: SessionWorkerResponse = {
      id: request.id,
      kind: 'error',
      error: `session scan worker failed: ${error instanceof Error ? error.message : String(error)}`,
    };
    postMessage(response);
  }
};

function runBurnAggregation(
  aggregator: AgentSourceAggregator,
  request: BurnAggregationRequest,
): BurnAggregate {
  const scan = aggregator.scan({});
  return aggregateBurnFromScan(aggregator, scan, request);
}

function aggregatorFor(config: SessionScanWorkerConfig): AgentSourceAggregator {
  const signature = JSON.stringify(config);
  if (activeAggregator && activeSignature === signature) return activeAggregator;

  cacheDb?.close();
  cacheDb = undefined;

  let cache: AgentSessionCache | undefined;
  if (config.cacheDbPath && config.cacheDbPath !== ':memory:') {
    cacheDb = new Database(config.cacheDbPath);
    cache = new AgentSessionCache(cacheDb);
  }

  const sources = new Map<AgentProvider, { source: AgentSource; root: string }>();
  if (config.roots.claude) {
    sources.set('claude', {
      source: new ClaudeSource(cache),
      root: config.roots.claude,
    });
  }
  if (config.roots.codex) {
    sources.set('codex', {
      source: new CodexSource(cache),
      root: config.roots.codex,
    });
  }

  activeSignature = signature;
  activeAggregator = new AgentSourceAggregator(sources);
  return activeAggregator;
}
