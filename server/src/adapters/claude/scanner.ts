import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, ScanOptions, SourceParseError, SourceScanResult } from '../source.js';
import {
  readUsageWithCache,
  type AgentSessionCache,
  type SessionFileFingerprint,
} from '../session-cache.js';
import {
  createAnalyticsSession,
  isFreshAnalyticsEntry,
  type AnalyticsCacheEntry,
} from '../analytics-session.js';
import { parseClaudeAnalytics, parseClaudeEvents, parseClaudeSession, parseClaudeUsage } from './parser.js';

function projectsDir(root: string): string {
  return join(root, 'projects');
}

export class ClaudeSource implements AgentSource {
  readonly provider = 'claude' as const;
  private readonly analyticsCache = new Map<string, AnalyticsCacheEntry>();
  private readonly usageParser: (sourcePath: string) => UsageEvent[];

  constructor(
    private readonly cache?: AgentSessionCache,
    options: { usageParser?: (sourcePath: string) => UsageEvent[] } = {},
  ) {
    this.usageParser = options.usageParser ?? parseClaudeUsage;
  }

  scan(options: ScanOptions): SourceScanResult {
    const errors: SourceParseError[] = [];
    const sessions: AgentSession[] = [];
    const dir = projectsDir(options.root);
    if (!existsSync(dir)) {
      return { sessions, errors, cache: scanStats(options.root, this.cache !== undefined, 0, 0, 0, 0) };
    }

    const files = listJsonlFiles(dir);
    const ordered = files
      .map((f) => fileFingerprint(f))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const candidates = options.modifiedSinceMs === undefined
      ? ordered
      : ordered.filter((entry) => entry.mtimeMs >= options.modifiedSinceMs!);
    const limited = options.limit && options.limit > 0 ? candidates.slice(0, options.limit) : candidates;
    let filesIndexed = 0;
    let filesReused = 0;

    for (const entry of limited) {
      if (this.cache) {
        try {
          const cached = this.cache.getFreshSession('claude', entry);
          if (cached) {
            sessions.push(cached.session);
            filesReused++;
            continue;
          }
        } catch (e) {
          errors.push({
            provider: 'claude',
            sourcePath: entry.sourcePath,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      try {
        const session = parseClaudeSession({ sourcePath: entry.sourcePath });
        sessions.push(session);
        if (this.cache) {
          this.cache.upsertSession('claude', entry, session, new Date().toISOString());
          filesIndexed++;
        }
      } catch (e) {
        errors.push({
          provider: 'claude',
          sourcePath: entry.sourcePath,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      sessions,
      errors,
      fingerprintsBySource: new Map(limited.map((entry) => [entry.sourcePath, entry])),
      cache: scanStats(
        options.root,
        this.cache !== undefined,
        ordered.length,
        limited.length,
        filesIndexed,
        filesReused,
      ),
    };
  }

  scanActivity(options: ScanOptions): SourceScanResult {
    const errors: SourceParseError[] = [];
    const sessions: AgentSession[] = [];
    const usageBySource = new Map<string, UsageEvent[]>();
    const dir = projectsDir(options.root);
    if (!existsSync(dir)) {
      return {
        sessions,
        errors,
        usageBySource,
        cache: scanStats(options.root, true, 0, 0, 0, 0),
      };
    }

    const ordered = listJsonlFiles(dir)
      .map((sourcePath) => fileFingerprint(sourcePath))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const candidates = options.modifiedSinceMs === undefined
      ? ordered
      : ordered.filter((entry) => entry.mtimeMs >= options.modifiedSinceMs!);
    const limited = options.limit && options.limit > 0 ? candidates.slice(0, options.limit) : candidates;
    const activeSinceMs = options.modifiedSinceMs ?? Number.NEGATIVE_INFINITY;
    let filesIndexed = 0;
    let filesReused = 0;

    for (const entry of limited) {
      const memoryCached = this.analyticsCache.get(entry.sourcePath);
      if (isFreshAnalyticsEntry(memoryCached, entry, activeSinceMs)) {
        sessions.push(memoryCached.session);
        usageBySource.set(entry.sourcePath, memoryCached.usage);
        filesReused++;
        continue;
      }

      // Persisted rows were produced by the tolerant public Session/Burn
      // parser and carry no strict analytics-validation proof. Weekly uses
      // only this window-keyed in-process cache so corrupt candidates cannot
      // become successful merely because another route indexed them first.

      try {
        const analytics = parseClaudeAnalytics(entry.sourcePath, activeSinceMs, entry.sizeBytes);
        const cached: AnalyticsCacheEntry = {
          fingerprint: entry,
          activeSinceMs,
          session: createAnalyticsSession('claude', entry.sourcePath, analytics.lastActiveAt),
          usage: analytics.usage,
        };
        this.analyticsCache.set(entry.sourcePath, cached);
        sessions.push(cached.session);
        usageBySource.set(entry.sourcePath, cached.usage);
        filesIndexed++;
      } catch (error) {
        errors.push(sourceError('claude', entry.sourcePath, error));
      }
    }

    return {
      sessions,
      errors,
      usageBySource,
      cache: scanStats(options.root, true, ordered.length, limited.length, filesIndexed, filesReused),
    };
  }

  getEvents(sourcePath: string, limit?: number): AgentSessionEvent[] {
    return parseClaudeEvents(sourcePath, limit);
  }

  getUsage(
    sourcePath: string,
    fingerprint?: SessionFileFingerprint,
  ): UsageEvent[] {
    return readUsageWithCache({
      provider: 'claude',
      sourcePath,
      cache: this.cache,
      parseUsage: this.usageParser,
      fingerprint: fileFingerprint,
      initialFingerprint: fingerprint,
    });
  }
}

function sourceError(
  provider: 'claude',
  sourcePath: string,
  error: unknown,
): SourceParseError {
  return {
    provider,
    sourcePath,
    message: error instanceof Error ? error.message : String(error),
  };
}

function fileFingerprint(sourcePath: string): SessionFileFingerprint {
  const stat = statSync(sourcePath);
  return { sourcePath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size };
}

function scanStats(
  root: string,
  cacheEnabled: boolean,
  filesDiscovered: number,
  filesSeen: number,
  filesIndexed: number,
  filesReused: number,
) {
  return {
    provider: 'claude' as const,
    root,
    cacheEnabled,
    filesDiscovered,
    filesSeen,
    filesIndexed,
    filesReused,
    refreshedAt: new Date().toISOString(),
  };
}

function listJsonlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const child of readdirSync(dir)) {
    const childPath = join(dir, child);
    const stat = statSync(childPath);
    if (stat.isDirectory()) {
      for (const file of readdirSync(childPath)) {
        if (file.endsWith('.jsonl')) out.push(join(childPath, file));
      }
    } else if (stat.isFile() && child.endsWith('.jsonl')) {
      out.push(childPath);
    }
  }
  return out;
}
