import { existsSync, lstatSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, ScanOptions, SourceParseError, SourceScanResult } from '../source.js';
import type { AgentSessionCache, SessionFileFingerprint } from '../session-cache.js';
import {
  createAnalyticsSession,
  isFreshAnalyticsEntry,
  type AnalyticsCacheEntry,
} from '../analytics-session.js';
import { parseCodexAnalytics, parseCodexEvents, parseCodexSession, parseCodexUsage } from './parser.js';

function sessionsDir(root: string): string {
  return join(root, 'sessions');
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (stat.isFile() && /^rollout-.*\.jsonl$/.test(entry)) {
      out.push(full);
    }
  }
}

function walkActivity(
  dir: string,
  out: SessionFileFingerprint[],
  errors: SourceParseError[],
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    errors.push(sourceError('codex', dir, error));
    return;
  }

  for (const entry of entries) {
    const sourcePath = join(dir, entry);
    let stat;
    try {
      stat = statSync(sourcePath);
    } catch (error) {
      errors.push(sourceError('codex', sourcePath, error));
      continue;
    }

    if (stat.isDirectory()) {
      walkActivity(sourcePath, out, errors);
    } else if (stat.isFile() && /^rollout-.*\.jsonl$/.test(entry)) {
      out.push({ sourcePath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
    }
  }
}

export class CodexSource implements AgentSource {
  readonly provider = 'codex' as const;
  private readonly analyticsCache = new Map<string, AnalyticsCacheEntry>();

  constructor(private readonly cache?: AgentSessionCache) {}

  scan(options: ScanOptions): SourceScanResult {
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];
    const dir = sessionsDir(options.root);
    if (!existsSync(dir)) {
      return { sessions, errors, cache: scanStats(options.root, this.cache !== undefined, 0, 0, 0, 0) };
    }

    const files: string[] = [];
    try {
      walk(dir, files);
    } catch (e) {
      errors.push({
        provider: 'codex',
        sourcePath: dir,
        message: e instanceof Error ? e.message : String(e),
      });
      return { sessions, errors };
    }

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
          const cached = this.cache.getFresh('codex', entry);
          if (cached) {
            sessions.push(cached.session);
            filesReused++;
            continue;
          }
        } catch (e) {
          errors.push({
            provider: 'codex',
            sourcePath: entry.sourcePath,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      try {
        const session = parseCodexSession({ sourcePath: entry.sourcePath });
        sessions.push(session);
        if (this.cache) {
          const usage = parseCodexUsage(entry.sourcePath);
          this.cache.upsert('codex', entry, session, usage, new Date().toISOString());
          filesIndexed++;
        }
      } catch (e) {
        errors.push({
          provider: 'codex',
          sourcePath: entry.sourcePath,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      sessions,
      errors,
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
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];
    const usageBySource = new Map<string, UsageEvent[]>();
    const dir = sessionsDir(options.root);
    let directoryExists = true;
    let directoryEntryExists = false;
    try {
      lstatSync(dir);
      directoryEntryExists = true;
      const stat = statSync(dir);
      if (!stat.isDirectory()) {
        errors.push(sourceError('codex', dir, new Error('Codex sessions path is not a directory')));
      }
    } catch (error) {
      if (!directoryEntryExists && isMissingPathError(error)) {
        directoryExists = false;
      } else {
        errors.push(sourceError('codex', dir, error));
      }
    }
    if (errors.length > 0 || !directoryExists) {
      return {
        sessions,
        errors,
        usageBySource,
        cache: scanStats(options.root, true, 0, 0, 0, 0),
      };
    }

    const files: SessionFileFingerprint[] = [];
    walkActivity(dir, files, errors);
    const ordered = files.sort((a, b) => b.mtimeMs - a.mtimeMs);
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

      // The persisted Session/Burn cache intentionally retains Codex's public
      // final-cumulative usage semantics. Weekly deltas use this separate,
      // window-keyed in-process cache and never reinterpret persisted rows.

      try {
        const analytics = parseCodexAnalytics(entry.sourcePath, activeSinceMs, entry.sizeBytes);
        const cached: AnalyticsCacheEntry = {
          fingerprint: entry,
          activeSinceMs,
          session: createAnalyticsSession('codex', entry.sourcePath, analytics.lastActiveAt),
          usage: analytics.usage,
        };
        this.analyticsCache.set(entry.sourcePath, cached);
        sessions.push(cached.session);
        usageBySource.set(entry.sourcePath, cached.usage);
        filesIndexed++;
      } catch (error) {
        errors.push(sourceError('codex', entry.sourcePath, error));
      }
    }

    return {
      sessions,
      errors,
      usageBySource,
      cache: scanStats(options.root, true, ordered.length, limited.length, filesIndexed, filesReused),
    };
  }

  getEvents(sourcePath: string): AgentSessionEvent[] {
    return parseCodexEvents(sourcePath);
  }

  getUsage(sourcePath: string): UsageEvent[] {
    const cached = this.cache?.getUsage('codex', sourcePath);
    if (cached) return cached;
    return parseCodexUsage(sourcePath);
  }
}

function sourceError(
  provider: 'codex',
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

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
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
    provider: 'codex' as const,
    root,
    cacheEnabled,
    filesDiscovered,
    filesSeen,
    filesIndexed,
    filesReused,
    refreshedAt: new Date().toISOString(),
  };
}
