import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { DecisionCandidateService } from './decision-candidates.js';

describe('DecisionCandidateService', () => {
  test('upserts candidates and preserves source context', () => {
    const service = new DecisionCandidateService({
      db: freshDb(),
      clock: fixedClock('2026-05-18T10:00:00.000Z'),
    });

    const [candidate] = service.upsertMany(
      { projectId: 'area-1', provider: 'codex', sessionId: 'sess-1', sourcePath: '/tmp/sess.jsonl' },
      [{ raw: 'decided to use WAL', title: 'Use WAL', timestamp: '2026-05-18T09:00:00.000Z' }],
    );

    expect(candidate?.status).toBe('candidate');
    expect(candidate?.projectId).toBe('area-1');
    expect(candidate?.provider).toBe('codex');
    expect(candidate?.sessionId).toBe('sess-1');
    expect(candidate?.sourcePath).toBe('/tmp/sess.jsonl');
    expect(candidate?.raw).toBe('decided to use WAL');

    const [again] = service.upsertMany(
      { projectId: 'area-1', provider: 'codex', sessionId: 'sess-1', sourcePath: '/tmp/sess.jsonl' },
      [{ raw: 'decided to use WAL', title: 'Use WAL', timestamp: '2026-05-18T09:00:00.000Z' }],
    );
    expect(again?.id).toBe(candidate?.id);
  });

  test('ignored and accepted states are persisted without losing raw context', () => {
    const service = new DecisionCandidateService({
      db: freshDb(),
      clock: fixedClock('2026-05-18T10:00:00.000Z'),
    });
    const [candidate] = service.upsertMany(
      { provider: 'claude', sessionId: 'sess-2', sourcePath: '/tmp/claude.jsonl' },
      [{ raw: 'going with sqlite', title: 'Use SQLite', timestamp: '2026-05-18T09:00:00.000Z' }],
    );
    expect(candidate).toBeDefined();

    const ignored = service.ignore(candidate!.id);
    expect(ignored.status).toBe('ignored');
    expect(ignored.ignoredAt).toBe('2026-05-18T10:00:00.000Z');
    expect(ignored.raw).toBe('going with sqlite');

    const accepted = service.accept(candidate!.id, 'decision-1');
    expect(accepted.status).toBe('accepted');
    expect(accepted.decisionId).toBe('decision-1');
    expect(accepted.raw).toBe('going with sqlite');
  });
});
