import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, ScanOptions, SourceParseError, SourceScanResult } from '../source.js';
import type { AgentSessionCache, SessionFileFingerprint } from '../session-cache.js';
import { parseClaudeEvents, parseClaudeSession, parseClaudeUsage } from './parser.js';

function projectsDir(root: string): string {
  return join(root, 'projects');
}

export class ClaudeSource implements AgentSource {
  readonly provider = 'claude' as const;

  constructor(private readonly cache?: AgentSessionCache) {}

  scan(options: ScanOptions): SourceScanResult {
    const errors: SourceParseError[] = [];
    const sessions: AgentSession[] = [];
    const dir = projectsDir(options.root);
    if (!existsSync(dir)) {
      return { sessions, errors, cache: scanStats(options.root, this.cache !== undefined, 0, 0, 0) };
    }

    const files = listJsonlFiles(dir);
    const ordered = files
      .map((f) => fileFingerprint(f))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const limited = options.limit && options.limit > 0 ? ordered.slice(0, options.limit) : ordered;
    let filesIndexed = 0;
    let filesReused = 0;

    for (const entry of limited) {
      if (this.cache) {
        try {
          const cached = this.cache.getFresh('claude', entry);
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
          const usage = parseClaudeUsage(entry.sourcePath);
          this.cache.upsert('claude', entry, session, usage, new Date().toISOString());
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
      cache: scanStats(options.root, this.cache !== undefined, limited.length, filesIndexed, filesReused),
    };
  }

  getEvents(sourcePath: string): AgentSessionEvent[] {
    return parseClaudeEvents(sourcePath);
  }

  getUsage(sourcePath: string): UsageEvent[] {
    const cached = this.cache?.getUsage('claude', sourcePath);
    if (cached) return cached;
    return parseClaudeUsage(sourcePath);
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
    provider: 'claude' as const,
    root,
    cacheEnabled,
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
