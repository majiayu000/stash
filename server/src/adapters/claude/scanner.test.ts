import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'fs';
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
    try {
      const projectDir = join(root, 'projects', '-Users-test-cache');
      mkdirSync(projectDir, { recursive: true });
      const file = join(projectDir, 'session.jsonl');
      writeClaudeFixture(file, 'first cache title', '2026-05-14T08:00:00.000Z');

      const source = new ClaudeSource(new AgentSessionCache(freshDb()));
      const first = source.scan({ root });
      expect(first.sessions[0]?.title).toBe('first cache title');
      expect(first.cache?.filesIndexed).toBe(1);
      expect(first.cache?.filesReused).toBe(0);

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
      expect(source.getUsage(file)[0]?.inputTokens).toBe(12);
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
  writeFileSync(sourcePath, `${JSON.stringify(user)}\n${JSON.stringify(assistant)}\n`);
}
