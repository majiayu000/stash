import { describe, expect, test } from 'bun:test';
import type { AgentSessionEvent } from '@stash/shared';
import { extractDecisions } from './decision-extract.js';

function ev(text: string, ts = '2026-05-14T10:00:00.000Z', kind: AgentSessionEvent['kind'] = 'assistant'): AgentSessionEvent {
  return { kind, text, timestamp: ts };
}

describe('extractDecisions', () => {
  test('matches "decided to" phrasing', () => {
    const out = extractDecisions([ev('We decided to use bun:sqlite for the local store.')]);
    expect(out.length).toBe(1);
    expect(out[0]?.title).toBe('use bun:sqlite for the local store');
  });

  test('matches "going with" / "let\'s go with"', () => {
    const out = extractDecisions([
      ev("Let's go with the worktree approach for parallel sessions."),
      ev("Going with chrono-node-light over a custom parser."),
    ]);
    expect(out.length).toBe(2);
  });

  test('deduplicates equivalent titles', () => {
    const out = extractDecisions([
      ev('we chose Bun for the runtime'),
      ev('We chose bun for the runtime.'),
    ]);
    expect(out.length).toBe(1);
  });

  test('ignores non-assistant / non-user events', () => {
    const out = extractDecisions([
      { kind: 'tool_call', text: 'we decided to do X', timestamp: 'x' },
      { kind: 'system',    text: 'we decided to do Y', timestamp: 'x' },
    ]);
    expect(out.length).toBe(0);
  });

  test('truncates long titles at 90 chars', () => {
    const longTail = 'A'.repeat(200);
    const out = extractDecisions([ev(`we decided to ${longTail}.`)]);
    expect(out[0]?.title.endsWith('…')).toBe(true);
    expect((out[0]?.title.length ?? 0)).toBeLessThanOrEqual(90);
  });

  test('multi-line text extracts multiple candidates', () => {
    const out = extractDecisions([ev(`I decided to use Postgres.\nWe're using Redis for caching.\nNo other notes here.`)]);
    expect(out.length).toBe(2);
  });
});
