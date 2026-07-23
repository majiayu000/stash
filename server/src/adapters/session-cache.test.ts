import { describe, expect, test } from 'bun:test';
import type { AgentSession, UsageEvent } from '@stash/shared';
import { freshDb } from '../db/test-helpers.js';
import { AgentSessionCache, type SessionFileFingerprint } from './session-cache.js';

const file: SessionFileFingerprint = {
  sourcePath: '/tmp/session.jsonl',
  mtimeMs: 123,
  sizeBytes: 456,
};

const session: AgentSession = {
  id: 'session-1',
  provider: 'claude',
  sourcePath: file.sourcePath,
  cwd: '/tmp',
  status: 'idle',
  title: 'Session',
  filesTouched: [],
  toolCount: 0,
  messageCount: 0,
  lastActiveAt: '2026-05-14T12:00:00.000Z',
};

const usage: UsageEvent[] = [{
  ts: '2026-05-14T12:00:00.000Z',
  model: 'claude-sonnet-4-6',
  inputTokens: 10,
  outputTokens: 5,
  sourcePath: file.sourcePath,
}];

describe('AgentSessionCache', () => {
  test('session-only lookup does not read or parse usage_json', () => {
    const db = freshDb();
    const cache = new AgentSessionCache(db);
    cache.upsertSession('claude', file, session, '2026-05-14T12:01:00.000Z');
    cache.storeUsage('claude', file.sourcePath, usage);
    db.prepare(
      'update agent_session_cache set usage_json = ? where provider = ? and source_path = ?',
    ).run('{broken', 'claude', file.sourcePath);

    expect(cache.getFreshSession('claude', file)).toEqual({
      session,
      indexedAt: '2026-05-14T12:01:00.000Z',
    });
    expect(() => cache.getUsage('claude', file.sourcePath)).toThrow(
      `invalid agent usage cache for claude:${file.sourcePath}`,
    );
  });

  test('invalid session rows fail visibly and are invalidated', () => {
    const db = freshDb();
    const cache = new AgentSessionCache(db);
    cache.upsertSession('claude', file, session, '2026-05-14T12:01:00.000Z');
    cache.storeUsage('claude', file.sourcePath, usage);
    db.prepare(
      'update agent_session_cache set session_json = ? where provider = ? and source_path = ?',
    ).run('{}', 'claude', file.sourcePath);

    expect(() => cache.getFreshSession('claude', file))
      .toThrow(`invalid agent session cache for claude:${file.sourcePath}`);
    expect(cache.getUsage('claude', file.sourcePath)).toBeUndefined();
  });

  test('session upsert invalidates stale usage until lazy indexing stores a replacement', () => {
    const db = freshDb();
    const cache = new AgentSessionCache(db);
    cache.upsertSession('claude', file, session, '2026-05-14T12:01:00.000Z');

    expect(cache.getUsage('claude', file.sourcePath)).toBeUndefined();
    expect(cache.storeUsage('claude', file.sourcePath, usage)).toBe(true);
    expect(cache.getUsage('claude', file.sourcePath)).toEqual(usage);

    cache.upsertSession(
      'claude',
      { ...file, mtimeMs: file.mtimeMs + 1 },
      { ...session, title: 'changed' },
      '2026-05-14T12:02:00.000Z',
    );
    expect(cache.getUsage('claude', file.sourcePath)).toBeUndefined();
  });
});
