import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { AgentSource, ScanOptions, SourceParseError, SourceScanResult } from '../source.js';
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

  scan(options: ScanOptions): SourceScanResult {
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];
    const dir = sessionsDir(options.root);
    if (!existsSync(dir)) return { sessions, errors };

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
      .map((f) => ({ path: f, mtime: statSync(f).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const limited = options.limit && options.limit > 0 ? ordered.slice(0, options.limit) : ordered;

    for (const entry of limited) {
      try {
        sessions.push(parseCodexSession({ sourcePath: entry.path }));
      } catch (e) {
        errors.push({
          provider: 'codex',
          sourcePath: entry.path,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { sessions, errors };
  }

  getEvents(sourcePath: string): AgentSessionEvent[] {
    return parseCodexEvents(sourcePath);
  }

  getUsage(sourcePath: string): UsageEvent[] {
    return parseCodexUsage(sourcePath);
  }
}
