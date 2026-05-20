import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, ScanOptions, SourceParseError, SourceScanResult } from '../source.js';
import type { AgentSessionCache, SessionFileFingerprint } from '../session-cache.js';
import { parseCodexEvents, parseCodexSession, parseCodexUsage } from './parser.js';

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

export class CodexSource implements AgentSource {
  readonly provider = 'codex' as const;

  constructor(private readonly cache?: AgentSessionCache) {}

  scan(options: ScanOptions): SourceScanResult {
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];
    const dir = sessionsDir(options.root);
    if (!existsSync(dir)) {
      return { sessions, errors, cache: scanStats(options.root, this.cache !== undefined, 0, 0, 0) };
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
    const limited = options.limit && options.limit > 0 ? ordered.slice(0, options.limit) : ordered;
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
      cache: scanStats(options.root, this.cache !== undefined, limited.length, filesIndexed, filesReused),
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

function fileFingerprint(sourcePath: string): SessionFileFingerprint {
  const stat = statSync(sourcePath);
  return { sourcePath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size };
}

function scanStats(
  root: string,
  cacheEnabled: boolean,
  filesSeen: number,
  filesIndexed: number,
  filesReused: number,
) {
  return {
    provider: 'codex' as const,
    root,
    cacheEnabled,
    filesSeen,
    filesIndexed,
    filesReused,
    refreshedAt: new Date().toISOString(),
  };
}
