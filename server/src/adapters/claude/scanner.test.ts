import { describe, expect, test } from 'bun:test';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { freshDb } from '../../db/test-helpers.js';
import { AgentSessionCache } from '../session-cache.js';
import { ClaudeSource } from './scanner.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(here, 'fixtures');

describe('ClaudeSource.scan', () => {
  test('parses a real-shaped jsonl into AgentSession fields', () => {
    const source = new ClaudeSource();
    const result = source.scan({ root: FIXTURE_ROOT });
    const sessions = result.sessions.filter((s) => s.id === 'sess-fixture-1');
    expect(sessions).toHaveLength(1);
    const s = sessions[0]!;
    expect(s.provider).toBe('claude');
    expect(s.cwd).toBe('/Users/test/demo-repo');
    expect(s.title).toBe('Auth middleware secure cookies refactor');
    expect(s.initialPrompt).toMatch(/Refactor the auth middleware/);
    expect(s.toolCount).toBe(2);
    expect(s.messageCount).toBeGreaterThanOrEqual(3);
    expect(s.filesTouched).toContain('/Users/test/demo-repo/src/auth/middleware.ts');
    expect(s.startedAt).toBe('2026-05-14T08:00:00.000Z');
    expect(s.lastActiveAt).toBe('2026-05-14T08:00:30.000Z');
    expect(s.lastTool).toBe('Edit');
  });

  test('records parse errors for broken jsonl without aborting the scan', () => {
    const source = new ClaudeSource();
    const result = source.scan({ root: FIXTURE_ROOT });
    // Even though one fixture file is malformed, the good one still parses.
    expect(result.sessions.some((s) => s.id === 'sess-fixture-1')).toBe(true);
    // A broken file should not throw; it either yields a degraded session or an error entry.
    // Our minimal parser tolerates JSON.parse failures, so the broken file produces a degraded session
    // with id derived from filename. That's acceptable: parser errors don't abort the scan.
    const ids = result.sessions.map((s) => s.id);
    expect(ids).toContain('broken');
  });

  test('returns empty result when no projects dir', () => {
    const source = new ClaudeSource();
    const result = source.scan({ root: '/tmp/__nonexistent_claude_root__' });
    expect(result.sessions).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('indexes changed files and reuses unchanged cache rows', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-claude-cache-'));
    const db = freshDb();
    try {
      const projectDir = join(root, 'projects', '-Users-test-cache');
      mkdirSync(projectDir, { recursive: true });
      const file = join(projectDir, 'session.jsonl');
      writeClaudeFixture(file, 'first cache title', '2026-05-14T08:00:00.000Z');

      const source = new ClaudeSource(new AgentSessionCache(db));
      const first = source.scan({ root });
      expect(first.sessions[0]?.title).toBe('first cache title');
      expect(first.cache?.filesIndexed).toBe(1);
      expect(first.cache?.filesReused).toBe(0);
      expect(cachedUsageJson(db, file)).toBe('null');
      expect(source.getUsage(file)[0]?.inputTokens).toBe(12);
      expect(cachedUsageJson(db, file)).not.toBe('null');

      const second = source.scan({ root });
      expect(second.sessions[0]?.title).toBe('first cache title');
      expect(second.cache?.filesIndexed).toBe(0);
      expect(second.cache?.filesReused).toBe(1);

      writeClaudeFixture(file, 'second cache title', '2026-05-14T08:05:00.000Z');
      const future = new Date(Date.now() + 30_000);
      utimesSync(file, future, future);

      const third = source.scan({ root });
      expect(third.sessions[0]?.title).toBe('second cache title');
      expect(third.cache?.filesIndexed).toBe(1);
      expect(third.cache?.filesReused).toBe(0);
      expect(cachedUsageJson(db, file)).toBe('null');
      expect(source.getUsage(file)[0]?.inputTokens).toBe(12);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('filters old append-only histories before cache lookup and parsing', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-claude-window-'));
    try {
      const projectDir = join(root, 'projects', '-Users-test-window');
      mkdirSync(projectDir, { recursive: true });
      const oldFile = join(projectDir, 'old.jsonl');
      const recentFile = join(projectDir, 'recent.jsonl');
      writeClaudeFixture(oldFile, 'old history', '2026-05-01T08:00:00.000Z');
      writeClaudeFixture(recentFile, 'recent history', '2026-07-08T08:00:00.000Z');
      const oldMtime = new Date('2026-05-01T09:00:00.000Z');
      const recentMtime = new Date('2026-07-08T09:00:00.000Z');
      utimesSync(oldFile, oldMtime, oldMtime);
      utimesSync(recentFile, recentMtime, recentMtime);

      const source = new ClaudeSource(new AgentSessionCache(freshDb()));
      const result = source.scan({
        root,
        modifiedSinceMs: Date.parse('2026-06-29T00:00:00.000Z'),
      });

      expect(result.sessions.map((session) => session.title)).toEqual(['recent history']);
      expect(result.cache).toMatchObject({
        filesDiscovered: 2,
        filesSeen: 1,
        filesIndexed: 1,
        filesReused: 0,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan rejects malformed complete records but tolerates a clear trailing partial append', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-claude-strict-'));
    const db = freshDb();
    try {
      const projectDir = join(root, 'projects', '-Users-test-strict');
      mkdirSync(projectDir, { recursive: true });
      const malformed = join(projectDir, 'malformed.jsonl');
      const missingTimestamp = join(projectDir, 'missing-timestamp.jsonl');
      const partial = join(projectDir, 'partial.jsonl');
      const completeNoNewline = join(projectDir, 'complete-no-newline.jsonl');
      writeClaudeFixture(malformed, 'malformed', '2026-07-08T08:00:00.000Z');
      appendFileSync(malformed, 'not-json\n');
      const [userLine, assistantLine] = claudeFixtureText(
        'missing timestamp',
        '2026-07-08T08:00:00.000Z',
      ).trim().split('\n');
      const assistant = JSON.parse(assistantLine!) as Record<string, unknown>;
      delete assistant.timestamp;
      writeFileSync(missingTimestamp, `${userLine}\n${JSON.stringify(assistant)}\n`);
      writeClaudeFixture(partial, 'partial', '2026-07-08T08:00:00.000Z');
      appendFileSync(partial, '{"type":"assistant"');
      writeFileSync(
        completeNoNewline,
        claudeFixtureText('complete', '2026-07-08T08:00:00.000Z').trimEnd(),
      );

      const source = new ClaudeSource(new AgentSessionCache(db));
      const publicScan = source.scan({ root });
      expect(publicScan.cache).toMatchObject({ filesIndexed: 4, filesReused: 0 });
      const result = source.scanActivity({
        root,
        modifiedSinceMs: Date.parse('2026-06-29T00:00:00.000Z'),
      });

      expect(result.sessions.map((session) => session.sourcePath).sort()).toEqual(
        [completeNoNewline, partial].sort(),
      );
      expect(result.usageBySource?.get(partial)).toHaveLength(1);
      expect(result.usageBySource?.get(completeNoNewline)).toHaveLength(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.find((error) => error.sourcePath === malformed)?.message)
        .toContain('malformed complete JSONL');
      expect(result.errors.find((error) => error.sourcePath === missingTimestamp)?.message)
        .toContain('usage record has no timestamp');
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan enforces the monotonic append-timestamp source invariant', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-claude-order-'));
    try {
      const projectDir = join(root, 'projects', '-Users-test-order');
      mkdirSync(projectDir, { recursive: true });
      const file = join(projectDir, 'out-of-order.jsonl');
      writeFileSync(
        file,
        claudeFixtureText('out of order', '2026-07-09T08:00:00.000Z')
          + claudeFixtureText('older append', '2026-07-08T08:00:00.000Z'),
      );

      const result = new ClaudeSource().scanActivity({
        root,
        modifiedSinceMs: Date.parse('2026-06-29T00:00:00.000Z'),
      });

      expect(result.sessions).toEqual([]);
      expect(result.errors[0]?.message).toContain('timestamps are not append-ordered');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ClaudeSource.getEvents', () => {
  test('returns user/assistant/tool events with timestamps', () => {
    const source = new ClaudeSource();
    const sessions = source.scan({ root: FIXTURE_ROOT }).sessions
      .filter((s) => s.id === 'sess-fixture-1');
    const events = source.getEvents(sessions[0]!.sourcePath);
    expect(events.length).toBeGreaterThanOrEqual(3);
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has('user')).toBe(true);
    expect(kinds.has('assistant')).toBe(true);
    expect(kinds.has('tool_call')).toBe(true);
  });
});

function writeClaudeFixture(sourcePath: string, title: string, ts: string): void {
  writeFileSync(sourcePath, claudeFixtureText(title, ts));
}

function claudeFixtureText(title: string, ts: string): string {
  const user = {
    type: 'user',
    timestamp: ts,
    sessionId: 'sess-cache',
    cwd: '/Users/test/cache-repo',
    message: { role: 'user', content: 'Inspect cache behavior' },
  };
  const assistant = {
    type: 'assistant',
    timestamp: ts,
    aiTitle: title,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 12, output_tokens: 3 },
    },
  };
  return `${JSON.stringify(user)}\n${JSON.stringify(assistant)}\n`;
}

function cachedUsageJson(
  db: ReturnType<typeof freshDb>,
  sourcePath: string,
): string | undefined {
  return db
    .query<{ usage_json: string }, [string]>(
      'select usage_json from agent_session_cache where source_path = ?',
    )
    .get(sourcePath)?.usage_json;
}
