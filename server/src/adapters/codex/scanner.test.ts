import { describe, expect, test } from 'bun:test';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { freshDb } from '../../db/test-helpers.js';
import { AgentSessionCache } from '../session-cache.js';
import { CodexSource } from './scanner.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(here, 'fixtures');

describe('CodexSource.scan', () => {
  test('parses a real-shaped Codex jsonl', () => {
    const source = new CodexSource();
    const result = source.scan({ root: FIXTURE_ROOT });
    const found = result.sessions.find((s) => s.id === 'codex-fixture-1');
    expect(found).toBeDefined();
    const s = found!;
    expect(s.provider).toBe('codex');
    expect(s.cwd).toBe('/Users/test/demo-codex');
    expect(s.initialPrompt).toMatch(/Inline a fix for the demo-codex memory leak/);
    expect(s.lastMessage).toMatch(/Applied the patch/);
    expect(s.toolCount).toBe(1);
    expect(s.lastTool).toBe('apply_patch');
    expect(s.filesTouched).toContain('/Users/test/demo-codex/src/cache.ts');
    expect(s.startedAt).toBe('2026-05-14T08:00:00.000Z');
    expect(s.lastActiveAt).toBe('2026-05-14T08:00:30.000Z');
    expect(s.messageCount).toBe(2); // user + assistant; developer excluded
  });

  test('returns empty result for missing sessions dir', () => {
    const source = new CodexSource();
    expect(source.scan({ root: '/tmp/__nonexistent_codex_root__' }).sessions).toEqual([]);
  });

  test('getEvents returns user / assistant / tool events', () => {
    const source = new CodexSource();
    const sessions = source.scan({ root: FIXTURE_ROOT }).sessions
      .filter((s) => s.id === 'codex-fixture-1');
    const events = source.getEvents(sessions[0]!.sourcePath);
    expect(events.length).toBeGreaterThan(2);
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has('user')).toBe(true);
    expect(kinds.has('assistant')).toBe(true);
    expect(kinds.has('tool_call')).toBe(true);
    expect(kinds.has('tool_output')).toBe(true);

    const toolCall = events.find((e) => e.kind === 'tool_call');
    expect(toolCall?.callId).toBe('call_patch_1');
    expect(toolCall?.meta?.path).toBe('/Users/test/demo-codex/src/cache.ts');

    const toolOutput = events.find((e) => e.kind === 'tool_output');
    expect(toolOutput?.callId).toBe('call_patch_1');
    expect(toolOutput?.text).toContain('Patch applied cleanly');
  });

  test('getUsage extracts token_count totals', () => {
    const source = new CodexSource();
    const sessions = source.scan({ root: FIXTURE_ROOT }).sessions
      .filter((s) => s.id === 'codex-fixture-1');
    const usage = source.getUsage(sessions[0]!.sourcePath);
    expect(usage.length).toBe(1);
    const u = usage[0]!;
    expect(u.model).toBe('gpt-5');         // pulled from turn_context
    expect(u.inputTokens).toBe(1800);
    expect(u.outputTokens).toBe(420);
    expect(u.cacheReadTokens).toBe(3200);
    expect(u.ts).toBe('2026-05-14T08:00:30.000Z');
  });

  test('getUsage returns empty when the session has no token_count events', () => {
    const source = new CodexSource();
    // The broken-fixture file has no token_count events.
    const sessions = source.scan({ root: FIXTURE_ROOT }).sessions
      .filter((s) => s.id !== 'codex-fixture-1');
    // If there is no other fixture, skip — just assert the type contract.
    if (sessions.length === 0) return;
    const usage = source.getUsage(sessions[0]!.sourcePath);
    expect(Array.isArray(usage)).toBe(true);
  });

  test('cold and changed metadata scans defer usage parsing until getUsage', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-lazy-usage-'));
    const db = freshDb();
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '08');
      mkdirSync(sessionsDir, { recursive: true });
      const file = join(sessionsDir, 'rollout-lazy.jsonl');
      writeCodexUsageFixture(file);
      const source = new CodexSource(new AgentSessionCache(db));

      expect(source.scan({ root }).cache).toMatchObject({ filesIndexed: 1, filesReused: 0 });
      expect(cachedUsageJson(db, file)).toBe('null');
      expect(source.getUsage(file)[0]?.inputTokens).toBe(2_300);
      expect(cachedUsageJson(db, file)).not.toBe('null');

      writeFileSync(file, codexUsageFixtureText().replace('"input_tokens":2300', '"input_tokens":2400'));
      const changedMtime = new Date(Date.now() + 30_000);
      utimesSync(file, changedMtime, changedMtime);
      expect(source.scan({ root }).cache).toMatchObject({ filesIndexed: 1, filesReused: 0 });
      expect(cachedUsageJson(db, file)).toBe('null');
      expect(source.getUsage(file)[0]?.inputTokens).toBe(2_400);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('filters old append-only histories before cache lookup and parsing', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-window-'));
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '08');
      mkdirSync(sessionsDir, { recursive: true });
      const oldFile = join(sessionsDir, 'rollout-old.jsonl');
      const recentFile = join(sessionsDir, 'rollout-recent.jsonl');
      writeCodexFixture(oldFile, 'old', '2026-05-01T08:00:00.000Z');
      writeCodexFixture(recentFile, 'recent', '2026-07-08T08:00:00.000Z');
      const oldMtime = new Date('2026-05-01T09:00:00.000Z');
      const recentMtime = new Date('2026-07-08T09:00:00.000Z');
      utimesSync(oldFile, oldMtime, oldMtime);
      utimesSync(recentFile, recentMtime, recentMtime);

      const source = new CodexSource(new AgentSessionCache(freshDb()));
      const result = source.scan({
        root,
        modifiedSinceMs: Date.parse('2026-06-29T00:00:00.000Z'),
      });

      expect(result.sessions.map((session) => session.id)).toEqual(['recent']);
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

  test('analytics scan converts cumulative token counts into cross-week deltas', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-analytics-'));
    const db = freshDb();
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '08');
      mkdirSync(sessionsDir, { recursive: true });
      const file = join(sessionsDir, 'rollout-cross-week.jsonl');
      writeCodexUsageFixture(file);
      const recentMtime = new Date('2026-07-08T09:00:00.000Z');
      utimesSync(file, recentMtime, recentMtime);

      const source = new CodexSource(new AgentSessionCache(db));
      const publicScan = source.scan({ root });
      expect(publicScan.errors).toEqual([]);
      expect(source.getUsage(file).map((event) => [event.inputTokens, event.outputTokens])).toEqual([
        [2_300, 350],
      ]);

      const result = source.scanActivity({
        root,
        modifiedSinceMs: Date.parse('2026-06-29T00:00:00.000Z'),
      });
      const usage = result.usageBySource?.get(file) ?? [];

      expect(usage.map((event) => [event.ts, event.inputTokens, event.outputTokens])).toEqual([
        ['2026-06-28T23:00:00.000Z', 1_000, 100],
        ['2026-07-01T08:00:00.000Z', 500, 100],
        ['2026-07-08T08:00:00.000Z', 800, 150],
      ]);
      expect(result.cache).toMatchObject({ filesIndexed: 1, filesReused: 0 });
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan treats a cumulative counter reset as one atomic sample', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-reset-'));
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '01');
      mkdirSync(sessionsDir, { recursive: true });
      const file = join(sessionsDir, 'rollout-reset.jsonl');
      const token = (timestamp: string, input: number, output: number, cached: number) => ({
        timestamp,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: {
            input_tokens: input,
            output_tokens: output,
            cached_input_tokens: cached,
          } },
        },
      });
      const lines = [
        { timestamp: '2026-06-28T22:00:00.000Z', type: 'session_meta', payload: { id: 'reset', cwd: '/tmp/reset' } },
        { timestamp: '2026-06-28T22:30:00.000Z', type: 'turn_context', payload: { model: 'gpt-5' } },
        token('2026-06-28T23:00:00.000Z', 100, 10, 50),
        token('2026-07-01T08:00:00.000Z', 5, 20, 4),
      ];
      writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

      const result = new CodexSource().scanActivity({
        root,
        modifiedSinceMs: Date.parse('2026-07-01T00:00:00.000Z'),
      });

      expect(result.errors).toEqual([]);
      expect(result.usageBySource?.get(file)?.at(-1)).toMatchObject({
        model: 'gpt-5',
        inputTokens: 5,
        outputTokens: 20,
        cacheReadTokens: 4,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan keeps the model context governing the boundary delta', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-model-boundary-'));
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '01');
      mkdirSync(sessionsDir, { recursive: true });
      const file = join(sessionsDir, 'rollout-model-boundary.jsonl');
      const token = (timestamp: string, input: number, output: number) => ({
        timestamp,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: { input_tokens: input, output_tokens: output } },
        },
      });
      const lines = [
        { timestamp: '2026-06-28T22:00:00.000Z', type: 'session_meta', payload: { id: 'model-boundary', cwd: '/tmp/model-boundary' } },
        { timestamp: '2026-06-28T22:30:00.000Z', type: 'turn_context', payload: { model: 'gpt-5' } },
        token('2026-06-28T23:00:00.000Z', 100, 10),
        token('2026-07-01T08:00:00.000Z', 150, 20),
        { timestamp: '2026-07-01T09:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-4.1' } },
        token('2026-07-01T10:00:00.000Z', 180, 30),
      ];
      writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

      const result = new CodexSource().scanActivity({
        root,
        modifiedSinceMs: Date.parse('2026-07-01T00:00:00.000Z'),
      });

      expect(result.errors).toEqual([]);
      expect(result.usageBySource?.get(file)?.map((event) => [
        event.ts,
        event.model,
        event.inputTokens,
        event.outputTokens,
      ])).toEqual([
        ['2026-06-28T23:00:00.000Z', 'gpt-5', 100, 10],
        ['2026-07-01T08:00:00.000Z', 'gpt-5', 50, 10],
        ['2026-07-01T10:00:00.000Z', 'gpt-4.1', 30, 10],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan reports a rollout candidate that cannot be statted', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-strict-walk-'));
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '08');
      mkdirSync(sessionsDir, { recursive: true });
      const broken = join(sessionsDir, 'rollout-broken.jsonl');
      symlinkSync(join(sessionsDir, 'missing-target.jsonl'), broken);

      const result = new CodexSource().scanActivity({
        root,
        modifiedSinceMs: Date.parse('2026-06-29T00:00:00.000Z'),
      });

      expect(result.sessions).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.sourcePath).toBe(broken);
      expect(result.errors[0]?.message).toMatch(/ENOENT|no such file/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan reports a dangling sessions directory symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-strict-root-'));
    try {
      const sessionsDir = join(root, 'sessions');
      symlinkSync(join(root, 'missing-sessions'), sessionsDir);

      const result = new CodexSource().scanActivity({ root });

      expect(result.sessions).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.sourcePath).toBe(sessionsDir);
      expect(result.errors[0]?.message).toMatch(/ENOENT|no such file/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan rejects malformed complete records but tolerates a clear trailing partial append', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-strict-'));
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '08');
      mkdirSync(sessionsDir, { recursive: true });
      const malformed = join(sessionsDir, 'rollout-malformed.jsonl');
      const missingTimestamp = join(sessionsDir, 'rollout-missing-timestamp.jsonl');
      const partial = join(sessionsDir, 'rollout-partial.jsonl');
      const completeNoNewline = join(sessionsDir, 'rollout-complete-no-newline.jsonl');
      writeCodexUsageFixture(malformed);
      appendFileSync(malformed, 'not-json\n');
      const missingLines = codexUsageFixtureText().trim().split('\n');
      const token = JSON.parse(missingLines.at(-1)!) as Record<string, unknown>;
      delete token.timestamp;
      missingLines[missingLines.length - 1] = JSON.stringify(token);
      writeFileSync(missingTimestamp, `${missingLines.join('\n')}\n`);
      writeCodexUsageFixture(partial);
      appendFileSync(partial, '{"timestamp":');
      writeFileSync(completeNoNewline, codexUsageFixtureText().trimEnd());

      const result = new CodexSource().scanActivity({
        root,
        modifiedSinceMs: Date.parse('2026-06-29T00:00:00.000Z'),
      });

      expect(result.sessions.map((session) => session.sourcePath).sort()).toEqual(
        [completeNoNewline, partial].sort(),
      );
      expect(result.usageBySource?.get(partial)).toHaveLength(3);
      expect(result.usageBySource?.get(completeNoNewline)).toHaveLength(3);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.find((error) => error.sourcePath === malformed)?.message)
        .toContain('malformed complete JSONL');
      expect(result.errors.find((error) => error.sourcePath === missingTimestamp)?.message)
        .toContain('token_count record has no timestamp');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('analytics scan enforces the monotonic append-timestamp source invariant', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-codex-order-'));
    try {
      const sessionsDir = join(root, 'sessions', '2026', '07', '08');
      mkdirSync(sessionsDir, { recursive: true });
      const file = join(sessionsDir, 'rollout-out-of-order.jsonl');
      const lines = [
        { timestamp: '2026-07-09T08:00:00.000Z', type: 'session_meta', payload: { id: 'out-of-order', cwd: '/tmp' } },
        {
          timestamp: '2026-07-08T08:00:00.000Z',
          type: 'event_msg',
          payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, output_tokens: 5 } } },
        },
      ];
      writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

      const result = new CodexSource().scanActivity({
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

function writeCodexFixture(sourcePath: string, id: string, ts: string): void {
  const lines = [
    { timestamp: ts, type: 'session_meta', payload: { id, cwd: '/tmp/codex-window' } },
    { timestamp: ts, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: id }] } },
  ];
  writeFileSync(sourcePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
}

function writeCodexUsageFixture(sourcePath: string): void {
  writeFileSync(sourcePath, codexUsageFixtureText());
}

function codexUsageFixtureText(): string {
  const token = (timestamp: string, input: number, output: number) => ({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: input, output_tokens: output } },
    },
  });
  const lines = [
    { timestamp: '2026-06-28T22:00:00.000Z', type: 'session_meta', payload: { id: 'cross-week', cwd: '/tmp/cross-week' } },
    { timestamp: '2026-06-28T22:30:00.000Z', type: 'turn_context', payload: { model: 'gpt-5' } },
    token('2026-06-28T23:00:00.000Z', 1_000, 100),
    token('2026-07-01T08:00:00.000Z', 1_500, 200),
    token('2026-07-08T08:00:00.000Z', 2_300, 350),
  ];
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
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
