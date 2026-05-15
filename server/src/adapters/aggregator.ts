import type { AgentProvider, AgentSession, AgentSessionEvent } from '@stash/shared';
import type { AgentSource, SourceParseError } from './source.js';

export interface AggregateOptions {
  limitPerSource?: number;
  provider?: AgentProvider | 'all';
}

export interface AggregateResult {
  sessions: AgentSession[];
  errors: SourceParseError[];
}

export class AgentSourceAggregator {
  constructor(private readonly sources: Map<AgentProvider, { source: AgentSource; root: string }>) {}

  scan(options: AggregateOptions = {}): AggregateResult {
    const wanted = options.provider && options.provider !== 'all' ? [options.provider] : ['claude', 'codex'] as AgentProvider[];
    const sessions: AgentSession[] = [];
    const errors: SourceParseError[] = [];

    for (const provider of wanted) {
      const entry = this.sources.get(provider);
      if (!entry) continue;
      try {
        const r = entry.source.scan({ root: entry.root, limit: options.limitPerSource });
        sessions.push(...r.sessions);
        errors.push(...r.errors);
      } catch (e) {
        errors.push({
          provider,
          sourcePath: entry.root,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    sessions.sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1));
    return { sessions, errors };
  }

  getEvents(provider: AgentProvider, sourcePath: string): AgentSessionEvent[] {
    const entry = this.sources.get(provider);
    if (!entry) return [];
    return entry.source.getEvents(sourcePath);
  }

  has(provider: AgentProvider): boolean {
    return this.sources.has(provider);
  }
}
