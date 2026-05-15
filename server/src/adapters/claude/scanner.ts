import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { AgentSession, AgentSessionEvent } from '@stash/shared';
import type { AgentSource, ScanOptions, SourceParseError, SourceScanResult } from '../source.js';
import { parseClaudeEvents, parseClaudeSession } from './parser.js';

function projectsDir(root: string): string {
  return join(root, 'projects');
}

export class ClaudeSource implements AgentSource {
  readonly provider = 'claude' as const;

  scan(options: ScanOptions): SourceScanResult {
    const errors: SourceParseError[] = [];
    const sessions: AgentSession[] = [];
    const dir = projectsDir(options.root);
    if (!existsSync(dir)) {
      return { sessions, errors };
    }

    const files = listJsonlFiles(dir);
    const ordered = files
      .map((f) => ({ path: f, mtime: statSync(f).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const limited = options.limit && options.limit > 0 ? ordered.slice(0, options.limit) : ordered;

    for (const entry of limited) {
      try {
        sessions.push(parseClaudeSession({ sourcePath: entry.path }));
      } catch (e) {
        errors.push({
          provider: 'claude',
          sourcePath: entry.path,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { sessions, errors };
  }

  getEvents(sourcePath: string): AgentSessionEvent[] {
    return parseClaudeEvents(sourcePath);
  }
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
