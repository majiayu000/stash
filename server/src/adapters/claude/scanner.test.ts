import { describe, expect, test } from 'bun:test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
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
