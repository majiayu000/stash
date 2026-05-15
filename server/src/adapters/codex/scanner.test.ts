import { describe, expect, test } from 'bun:test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
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
  });
});
