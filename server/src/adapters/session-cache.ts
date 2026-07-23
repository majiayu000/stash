import type { Database } from 'bun:sqlite';
import type { AgentProvider, AgentSession, UsageEvent } from '@stash/shared';

export interface SessionFileFingerprint {
  sourcePath: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface CachedSession {
  session: AgentSession;
  indexedAt: string;
}

interface SessionCacheRow {
  session_json: string;
  indexed_at: string;
}

export class AgentSessionCache {
  constructor(private readonly db: Database) {}

  getFreshSession(provider: AgentProvider, file: SessionFileFingerprint): CachedSession | undefined {
    const row = this.db
      .query<SessionCacheRow, [string, string, number, number]>(
        `select session_json, indexed_at
           from agent_session_cache
          where provider = ?
            and source_path = ?
            and abs(mtime_ms - ?) < 0.001
            and size_bytes = ?`,
      )
      .get(provider, file.sourcePath, file.mtimeMs, file.sizeBytes);
    if (!row) return undefined;

    try {
      return {
        session: parseCachedSession(JSON.parse(row.session_json)),
        indexedAt: row.indexed_at,
      };
    } catch (e) {
      this.invalidate(provider, file.sourcePath);
      throw new Error(
        `invalid agent session cache for ${provider}:${file.sourcePath}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  getUsage(provider: AgentProvider, sourcePath: string): UsageEvent[] | undefined {
    const row = this.db
      .query<{ usage_json: string }, [string, string]>(
        `select usage_json
           from agent_session_cache
          where provider = ? and source_path = ?`,
      )
      .get(provider, sourcePath);
    if (!row) return undefined;

    try {
      const parsed = JSON.parse(row.usage_json) as unknown;
      return parsed === null ? undefined : parseCachedUsage(parsed);
    } catch (e) {
      this.invalidate(provider, sourcePath);
      throw new Error(
        `invalid agent usage cache for ${provider}:${sourcePath}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  upsertSession(
    provider: AgentProvider,
    file: SessionFileFingerprint,
    session: AgentSession,
    indexedAt: string,
  ): void {
    this.db
      .prepare(
        `insert into agent_session_cache(
           provider, source_path, mtime_ms, size_bytes, session_json, usage_json, indexed_at
         ) values (?, ?, ?, ?, ?, ?, ?)
         on conflict(provider, source_path) do update set
           mtime_ms = excluded.mtime_ms,
           size_bytes = excluded.size_bytes,
           session_json = excluded.session_json,
           usage_json = excluded.usage_json,
           indexed_at = excluded.indexed_at`,
      )
      .run(
        provider,
        file.sourcePath,
        file.mtimeMs,
        file.sizeBytes,
        JSON.stringify(session),
        'null',
        indexedAt,
      );
  }

  storeUsage(provider: AgentProvider, sourcePath: string, usage: UsageEvent[]): boolean {
    const result = this.db
      .prepare(
        `update agent_session_cache
            set usage_json = ?
          where provider = ? and source_path = ?`,
      )
      .run(JSON.stringify(usage), provider, sourcePath);
    return result.changes > 0;
  }

  invalidate(provider: AgentProvider, sourcePath: string): void {
    this.db
      .prepare('delete from agent_session_cache where provider = ? and source_path = ?')
      .run(provider, sourcePath);
  }
}

function parseCachedSession(value: unknown): AgentSession {
  if (!value || typeof value !== 'object') throw new Error('session is not an object');
  const session = value as Partial<AgentSession>;
  if (typeof session.id !== 'string') throw new Error('session.id is missing');
  if (session.provider !== 'claude' && session.provider !== 'codex') {
    throw new Error('session.provider is invalid');
  }
  if (typeof session.sourcePath !== 'string') throw new Error('session.sourcePath is missing');
  if (typeof session.cwd !== 'string') throw new Error('session.cwd is missing');
  if (typeof session.title !== 'string') throw new Error('session.title is missing');
  if (!Array.isArray(session.filesTouched)) throw new Error('session.filesTouched is missing');
  if (typeof session.toolCount !== 'number') throw new Error('session.toolCount is missing');
  if (typeof session.messageCount !== 'number') throw new Error('session.messageCount is missing');
  if (typeof session.lastActiveAt !== 'string') throw new Error('session.lastActiveAt is missing');
  if (Number.isNaN(Date.parse(session.lastActiveAt))) {
    throw new Error('session.lastActiveAt is invalid');
  }
  return session as AgentSession;
}

function parseCachedUsage(value: unknown): UsageEvent[] {
  if (!Array.isArray(value)) throw new Error('usage is not an array');
  return value.map((event) => {
    if (!event || typeof event !== 'object') throw new Error('usage event is not an object');
    const usage = event as Partial<UsageEvent>;
    if (typeof usage.ts !== 'string') throw new Error('usage.ts is missing');
    if (Number.isNaN(Date.parse(usage.ts))) throw new Error('usage.ts is invalid');
    if (typeof usage.model !== 'string') throw new Error('usage.model is missing');
    if (typeof usage.inputTokens !== 'number') throw new Error('usage.inputTokens is missing');
    if (typeof usage.outputTokens !== 'number') throw new Error('usage.outputTokens is missing');
    if (usage.cacheReadTokens !== undefined && typeof usage.cacheReadTokens !== 'number') {
      throw new Error('usage.cacheReadTokens is invalid');
    }
    if (usage.cacheWriteTokens !== undefined && typeof usage.cacheWriteTokens !== 'number') {
      throw new Error('usage.cacheWriteTokens is invalid');
    }
    if (typeof usage.sourcePath !== 'string') throw new Error('usage.sourcePath is missing');
    return usage as UsageEvent;
  });
}
