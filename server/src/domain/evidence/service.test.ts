import { beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { fixedClock, type AgentSession } from '@stash/shared';
import { openDatabase } from '../../db/connection.js';
import { migrate } from '../../db/migrate.js';
import { WorkItemService } from '../work-item/service.js';
import {
  EvidenceService,
  NoPendingCandidateError,
  detectsCompletion,
} from './service.js';

interface Setup {
  db: Database;
  items: WorkItemService;
  evidence: EvidenceService;
}

function setup(): Setup {
  const db = openDatabase({ path: ':memory:', inMemory: true });
  migrate(db);
  const clock = fixedClock('2026-05-14T10:00:00.000Z');
  return {
    db,
    items: new WorkItemService({ db, clock }),
    evidence: new EvidenceService({ db, clock }),
  };
}

function makeSession(overrides: Partial<AgentSession>): AgentSession {
  return {
    id: 'sess-1',
    provider: 'claude',
    sourcePath: '/fake.jsonl',
    cwd: '/fake',
    status: 'idle',
    title: 'fake',
    filesTouched: [],
    toolCount: 0,
    messageCount: 0,
    lastActiveAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}

describe('detectsCompletion (pure)', () => {
  test('matches common done phrasing', () => {
    expect(detectsCompletion('All tests passing now.')).toBe(true);
    expect(detectsCompletion('Fixed the bug.')).toBe(true);
    expect(detectsCompletion('completed the refactor')).toBe(true);
  });
  test('does not match unrelated text', () => {
    expect(detectsCompletion('Started investigating')).toBe(false);
    expect(detectsCompletion('Need more info')).toBe(false);
  });
});

describe('EvidenceService.create + list', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('rejects evidence for missing work item', () => {
    expect(() =>
      s.evidence.create({ workItemId: 'nope', kind: 'manual_note', text: 'x' }),
    ).toThrow();
  });

  test('round-trips manual evidence', () => {
    const item = s.items.create({ title: 'thing' });
    const ev = s.evidence.create({
      workItemId: item.id,
      kind: 'manual_note',
      text: 'I checked it works locally.',
    });
    expect(ev.kind).toBe('manual_note');
    expect(ev.text).toMatch(/checked it works/);

    const found = s.evidence.list({ workItemId: item.id });
    expect(found).toHaveLength(1);
  });
});

describe('progressFor', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns basis=none when no checklist + no evidence', () => {
    const item = s.items.create({ title: 'no breakdown' });
    const p = s.evidence.progressFor(item);
    expect(p.basis).toBe('none');
    expect(p.ratio).toBe(0);
  });

  test('uses checklist completion as primary basis', () => {
    let item = s.items.create({
      title: 'with steps',
      checklist: [
        { id: 'c1', text: 'step a', completed: true },
        { id: 'c2', text: 'step b', completed: true },
        { id: 'c3', text: 'step c', completed: false },
        { id: 'c4', text: 'step d', completed: false },
      ],
    });
    item = s.items.get(item.id)!;
    const p = s.evidence.progressFor(item);
    expect(p.basis).toBe('checklist');
    // 2/4 done × 0.85 = 0.425, no evidence so no bonus
    expect(p.ratio).toBeCloseTo(0.425, 3);
    expect(p.estimated).toBe(false);
  });

  test('inferred basis is marked estimated', () => {
    const item = s.items.create({ title: 'no checklist' });
    s.evidence.create({ workItemId: item.id, kind: 'manual_note', text: 'looks fine' });
    const p = s.evidence.progressFor(item);
    expect(p.basis).toBe('inferred');
    expect(p.estimated).toBe(true);
  });
});

describe('proposeFromSessions + acceptCompletion', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('proposes pending evidence when assistant says done', () => {
    const item = s.items.create({ title: 'work' });
    const session = makeSession({ id: 'sess-1', lastMessage: 'All done, shipped to prod.' });
    const proposed = s.evidence.proposeFromSessions(
      item.id,
      [{ provider: 'claude', sessionId: 'sess-1' }],
      () => session,
    );
    expect(proposed).toHaveLength(1);
    expect(proposed[0]!.pendingAcceptance).toBe(true);
  });

  test('does not propose for unrelated last message', () => {
    const item = s.items.create({ title: 'work' });
    const session = makeSession({ id: 'sess-1', lastMessage: 'I started looking.' });
    const proposed = s.evidence.proposeFromSessions(
      item.id,
      [{ provider: 'claude', sessionId: 'sess-1' }],
      () => session,
    );
    expect(proposed).toEqual([]);
  });

  test('is idempotent — duplicate proposals return existing pending', () => {
    const item = s.items.create({ title: 'work' });
    const session = makeSession({ id: 'sess-1', lastMessage: 'Fixed.' });
    s.evidence.proposeFromSessions(
      item.id,
      [{ provider: 'claude', sessionId: 'sess-1' }],
      () => session,
    );
    s.evidence.proposeFromSessions(
      item.id,
      [{ provider: 'claude', sessionId: 'sess-1' }],
      () => session,
    );
    const pending = s.evidence.list({ workItemId: item.id, pendingOnly: true });
    expect(pending).toHaveLength(1);
  });

  test('acceptCompletion flips work item to done and clears pending', () => {
    const item = s.items.create({ title: 'work' });
    const session = makeSession({ id: 'sess-1', lastMessage: 'Done.' });
    s.evidence.proposeFromSessions(
      item.id,
      [{ provider: 'claude', sessionId: 'sess-1' }],
      () => session,
    );
    const accepted = s.evidence.acceptCompletion(item.id);
    expect(accepted.status).toBe('done');
    expect(s.evidence.list({ workItemId: item.id, pendingOnly: true })).toEqual([]);
  });

  test('acceptCompletion throws when no pending candidate', () => {
    const item = s.items.create({ title: 'no candidate' });
    expect(() => s.evidence.acceptCompletion(item.id)).toThrow(NoPendingCandidateError);
  });

  test('rejectCompletion clears pending without changing status', () => {
    const item = s.items.create({ title: 'work' });
    const session = makeSession({ id: 'sess-1', lastMessage: 'Done.' });
    s.evidence.proposeFromSessions(
      item.id,
      [{ provider: 'claude', sessionId: 'sess-1' }],
      () => session,
    );
    s.evidence.rejectCompletion(item.id);
    const reloaded = s.items.get(item.id)!;
    expect(reloaded.status).not.toBe('done');
    expect(s.evidence.list({ workItemId: item.id, pendingOnly: true })).toEqual([]);
  });
});
