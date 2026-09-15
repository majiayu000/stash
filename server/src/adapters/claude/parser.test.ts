import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseClaudeAnalytics } from './parser.js';

const BLOCK_BYTES = 1024 * 1024;
const CURRENT = '2026-07-08T08:00:00.000Z';
const PREVIOUS = '2026-07-01T08:00:00.000Z';

function assistant(timestamp = CURRENT, input = 20): string {
  return JSON.stringify({
    type: 'assistant', timestamp,
    message: { role: 'assistant', model: 'claude-sonnet-4-6', usage: { input_tokens: input, output_tokens: 5 } },
  });
}

function withHistory(text: string, check: (sourcePath: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'stash-claude-stream-'));
  try {
    const sourcePath = join(root, 'session.jsonl');
    writeFileSync(sourcePath, text);
    check(sourcePath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('Claude strict analytics block reading', () => {
  test('preserves a model containing UTF-8 split across blocks and validates out-of-order events', () => {
    const prefix = `{"type":"assistant","timestamp":"${CURRENT}","padding":"`;
    const modelPrefix = '","message":{"role":"assistant","model":"';
    const padding = 'x'.repeat(BLOCK_BYTES - 1 - Buffer.byteLength(prefix + modelPrefix));
    const record = prefix + padding + modelPrefix + '🤖模型","usage":{"input_tokens":20,"output_tokens":5}}}';
    withHistory(record + '\n' + assistant(PREVIOUS, 10), (sourcePath) => {
      const result = parseClaudeAnalytics(sourcePath, Date.parse(CURRENT));
      expect(result.lastActiveAt).toBe(CURRENT);
      expect(result.usage.map((event) => [event.model, event.ts, event.inputTokens])).toEqual([
        ['🤖模型', CURRENT, 20],
        ['claude-sonnet-4-6', PREVIOUS, 10],
      ]);
    });
  });

  test('handles CRLF split across blocks and records longer than two blocks', () => {
    const prefix = `{"type":"user","timestamp":"${CURRENT}","content":"`;
    const record = prefix + 'x'.repeat(BLOCK_BYTES - 1 - prefix.length - 2) + '"}';
    const longRecord = prefix + 'y'.repeat(BLOCK_BYTES * 2 + 10) + '"}';
    withHistory(record + '\r\n' + longRecord + '\r\n' + assistant() + '\r\n', (sourcePath) => {
      const result = parseClaudeAnalytics(sourcePath, 0);
      expect(result.lastActiveAt).toBe(CURRENT);
      expect(result.usage).toHaveLength(1);
      expect(result.usage[0]!.inputTokens).toBe(20);
    });
  });

  test.each([
    ['complete final record', assistant(), false],
    ['valid partial final record', '{"type":"assistant","message":', false],
    ['newline-terminated partial record', '{"type":"assistant","message":\n', true],
    ['malformed final record', '{"type":bad', true],
    ['malformed complete record', '{"type":bad}\n', true],
    ['two values on one line', '{}{}\n', true],
    ['BOM-prefixed record', '\ufeff' + assistant(), true],
  ])('%s after a full block', (_label, suffix, shouldThrow) => {
    const prefix = assistant() + '\n' + ' '.repeat(BLOCK_BYTES - assistant().length - 1);
    withHistory(prefix + suffix, (sourcePath) => {
      if (shouldThrow) {
        expect(() => parseClaudeAnalytics(sourcePath, 0)).toThrow('malformed complete JSONL');
      } else {
        expect(parseClaudeAnalytics(sourcePath, 0).lastActiveAt).toBe(CURRENT);
      }
    });
  });

  test('does not skip invalid usage after a multi-block message', () => {
    const large = JSON.stringify({ type: 'user', timestamp: CURRENT, content: 'x'.repeat(BLOCK_BYTES * 2) });
    withHistory(large + '\n' + assistant(PREVIOUS, -1), (sourcePath) => {
      expect(() => parseClaudeAnalytics(sourcePath, Date.parse(CURRENT)))
        .toThrow('input_tokens must be a finite non-negative number');
    });
  });
});
