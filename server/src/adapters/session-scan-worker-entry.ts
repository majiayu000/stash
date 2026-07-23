import { Database } from 'bun:sqlite';
import type { AgentProvider } from '@stash/shared';
import { AgentSourceAggregator } from './aggregator.js';
import { ClaudeSource } from './claude/scanner.js';
import { CodexSource } from './codex/scanner.js';
import { AgentSessionCache } from './session-cache.js';
import type { AgentSource } from './source.js';
import { aggregateBurnFromScan } from '../domain/analytics/burn.js';
import type {
  SessionWorkerRequest,
  SessionWorkerResponse,
  SessionScanWorkerConfig,
} from './session-scan-worker.js';

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
    } else {
      const scan = aggregator.scan({});
      const result = aggregateBurnFromScan(aggregator, scan, request.request);
      const response: SessionWorkerResponse = { id: request.id, kind: 'burn', result };
      postMessage(response);
      // Large histories create substantial short-lived JSON objects. Run a
      // Worker-local collection after the compact response has been cloned so
      // repeated warm requests do not retain an ever-growing heap arena.
      queueMicrotask(() => Bun.gc(true));
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
