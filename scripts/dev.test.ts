import { describe, expect, test } from 'bun:test';
import {
  DEMO_CLAUDE_ROOT,
  DEMO_DB_PATH,
  resolve_shared_env,
  SERVICES,
} from './dev';

describe('dev launcher environment', () => {
  test('injects nothing outside demo mode so the server keeps its own default DB', () => {
    expect(resolve_shared_env(false, { STASH_DB_PATH: '/somewhere/real.db' })).toEqual({});
  });

  test('points demo runs at the throwaway database and seeded Claude root', () => {
    expect(resolve_shared_env(true, {})).toEqual({
      STASH_DB_PATH: DEMO_DB_PATH,
      CLAUDE_ROOT: DEMO_CLAUDE_ROOT,
    });
  });

  test('lets an explicit override win over the demo defaults', () => {
    expect(resolve_shared_env(true, {
      STASH_DB_PATH: '/tmp/mine.db',
      CLAUDE_ROOT: '/tmp/my-claude',
    })).toEqual({
      STASH_DB_PATH: '/tmp/mine.db',
      CLAUDE_ROOT: '/tmp/my-claude',
    });
  });

  test('starts both halves, so neither can be forgotten in a second shell', () => {
    // The whole point of the launcher: one command owns both processes and the
    // single environment they share.
    expect(SERVICES.map((s) => s.name)).toEqual(['server', 'client']);
    expect(SERVICES.map((s) => s.args.join(' '))).toEqual([
      'run server:dev',
      'run client:dev',
    ]);
  });
});
