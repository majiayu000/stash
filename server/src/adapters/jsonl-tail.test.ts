import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isClearlyIncompleteJsonlTail, readJsonlLinesReverse } from './jsonl-tail.js';

describe('isClearlyIncompleteJsonlTail', () => {
  test('accepts only syntactically valid object and array prefixes', () => {
    for (const prefix of [
      '{',
      '{"key"',
      '{"key":',
      '{"key":"unfinished',
      '{"key":"\\u12',
      '{"key":1,',
      '[',
      '[1,',
      '[{"nested":true}',
    ]) {
      expect(isClearlyIncompleteJsonlTail(prefix)).toBe(true);
    }
  });

  test('rejects stable corruption and complete JSON', () => {
    for (const invalid of [
      '{not-json',
      '[not-json',
      '{"key":truX',
      '{"key":"\\q',
      '{"key":1,,',
      '{"key":01',
      '{"key":1}',
      '[1]',
      'not-json',
    ]) {
      expect(isClearlyIncompleteJsonlTail(invalid)).toBe(false);
    }
  });
});

describe('readJsonlLinesReverse', () => {
  test('keeps a 512 KiB final record linear with a 1 KiB first chunk', () => {
    const root = mkdtempSync(join(tmpdir(), 'stash-jsonl-tail-large-'));
    try {
      const sourcePath = join(root, 'large-tail.jsonl');
      const record = JSON.stringify({
        timestamp: '2026-07-08T08:00:00.000Z',
        content: 'x'.repeat(512 * 1024),
      });
      writeFileSync(sourcePath, `${record}\n`);

      const started = performance.now();
      const lines = [...readJsonlLinesReverse(sourcePath, 1024)];
      const elapsedMs = performance.now() - started;

      expect(lines).toEqual([{ text: record, terminated: true }]);
      expect(elapsedMs).toBeLessThanOrEqual(100);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
