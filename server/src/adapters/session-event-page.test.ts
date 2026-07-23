import { describe, expect, test } from 'bun:test';
import type { AgentSessionEvent } from '@stash/shared';
import {
  buildSessionEventPage,
  decodeSessionEventCursor,
  encodeSessionEventCursor,
  MAX_SESSION_EVENT_RESPONSE_BYTES,
} from './session-event-page.js';

function event(index: number, overrides: Partial<AgentSessionEvent> = {}): AgentSessionEvent {
  return {
    kind: 'assistant',
    text: `event-${index}`,
    timestamp: new Date(index * 1000).toISOString(),
    ...overrides,
  };
}

describe('session event pages', () => {
  test('advances append-ordered pages with an opaque stable cursor', () => {
    const events = Array.from({ length: 5 }, (_, index) => event(index));

    const first = buildSessionEventPage(events, { limit: 2 });
    const second = buildSessionEventPage(events, {
      cursor: first.page.nextCursor ?? undefined,
      limit: 2,
    });
    const third = buildSessionEventPage(events, {
      cursor: second.page.nextCursor ?? undefined,
      limit: 2,
    });

    expect(first.data.map((row) => row.text)).toEqual(['event-0', 'event-1']);
    expect(second.data.map((row) => row.text)).toEqual(['event-2', 'event-3']);
    expect(third.data.map((row) => row.text)).toEqual(['event-4']);
    expect(third.page).toMatchObject({ hasMore: false, nextCursor: null, totalEvents: 5 });
  });

  test('rejects malformed and out-of-range cursors', () => {
    expect(() => decodeSessionEventCursor('not-a-cursor')).toThrow('cursor is invalid');
    expect(() => buildSessionEventPage([event(0)], {
      cursor: encodeSessionEventCursor(2),
      limit: 10,
    })).toThrow('outside the transcript');
    expect(() => buildSessionEventPage([event(0)], { limit: 0 }))
      .toThrow('limit must be between 1 and 200');
  });

  test('bounds oversized events and the serialized response', () => {
    const events = Array.from({ length: 40 }, (_, index) => event(index, {
      kind: 'tool_call',
      tool: 'write_file',
      text: 'x'.repeat(80_000),
      meta: { path: `/tmp/${index}.txt`, content: 'y'.repeat(80_000) },
    }));

    const page = buildSessionEventPage(events, { limit: 40 });

    expect(page.data.length).toBeLessThan(40);
    expect(page.data.every((row) => row.truncated)).toBe(true);
    expect(Buffer.byteLength(page.data[0]!.text)).toBeLessThanOrEqual(24 * 1024);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(
      MAX_SESSION_EVENT_RESPONSE_BYTES,
    );
    expect(page.page.responseBytes).toBe(Buffer.byteLength(JSON.stringify(page)));
  });

  test('computes complete summaries independently of the current page', () => {
    const events = [
      event(0, { kind: 'tool_call', tool: 'read', meta: { path: '/tmp/a' } }),
      event(1, { kind: 'tool_output', callId: 'one' }),
      event(2, { kind: 'tool_call', tool: 'read', meta: { path: '/tmp/a' } }),
      event(3, { kind: 'tool_call', tool: 'write', meta: { file_path: '/tmp/b' } }),
    ];

    const page = buildSessionEventPage(events, { limit: 1 });

    expect(page.data).toHaveLength(1);
    expect(page.summary).toEqual({
      totalToolCalls: 3,
      totalFiles: 2,
      toolCalls: [
        { name: 'read', count: 2 },
        { name: 'write', count: 1 },
      ],
      filesTouched: [
        { path: '/tmp/a', count: 2 },
        { path: '/tmp/b', count: 1 },
      ],
    });
  });
});
