import { describe, expect, test } from 'bun:test';
import { fixedClock } from '@stash/shared';
import { freshDb } from '../../db/test-helpers.js';
import { WorkItemService } from '../work-item/service.js';
import {
  AiDraftService,
  DecisionDraftConflictError,
} from './service.js';

const at = '2026-06-17T10:00:00.000Z';

function setupAiDraftTest() {
  const db = freshDb();
  const clock = fixedClock(at);
  const workItems = new WorkItemService({ db, clock });
  const drafts = new AiDraftService({ db, clock, workItems });
  return { db, workItems, drafts };
}

describe('AiDraftService', () => {
  test('persists successful runs and draft source evidence', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Launch a local AI todo loop', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      model: 'mock-v1',
      promptHash: 'hash-1',
      status: 'succeeded',
      rawResponseJson: '{"tasks":[]}',
    });

    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      sourcePath: '/notes/idea.md',
      sourceSpans: [{ label: 'idea', start: 0, end: 12, text: 'AI todo loop' }],
      proposedTitle: 'Interview five local-first todo users',
      proposedDescription: 'Validate the target workflow.',
      proposedPriority: 'p1',
      proposedLabels: ['research'],
      proposedChecklist: [{ id: 'check-1', text: 'write screener', completed: false }],
      sortOrder: 1,
    }]);

    expect(run.status).toBe('succeeded');
    expect(draft?.status).toBe('draft');
    expect(draft?.sourceWorkItemId).toBe(idea.id);
    expect(draft?.sourcePath).toBe('/notes/idea.md');
    expect(draft?.sourceSpans).toEqual([{ label: 'idea', start: 0, end: 12, text: 'AI todo loop' }]);
    expect(draft?.proposedLabels).toEqual(['research']);
    expect(drafts.listDrafts({ runId: run.id }).map((d) => d.id)).toEqual([draft!.id]);
  });

  test('persists failed run details without creating drafts', () => {
    const { drafts } = setupAiDraftTest();
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      provider: 'local-test',
      promptHash: 'hash-2',
    });

    const failed = drafts.recordRunFailure(run.id, 'invalid JSON from provider', '{"oops":');

    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('invalid JSON from provider');
    expect(failed.rawResponseJson).toBe('{"oops":');
    expect(drafts.listDrafts({ runId: run.id })).toEqual([]);
  });

  test('does not create work items before explicit accept', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Make meeting notes actionable', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-3',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      proposedTitle: 'Extract decisions from meeting notes',
    }]);

    expect(workItems.list({ parentId: idea.id })).toEqual([]);

    const [accepted] = drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id }],
      sourceIdeaStatus: 'planned',
    });
    const created = workItems.get(accepted!.createdWorkItemId!);

    expect(accepted?.status).toBe('accepted');
    expect(created?.parentId).toBe(idea.id);
    expect(created?.title).toBe('Extract decisions from meeting notes');
    expect(workItems.get(idea.id)?.status).toBe('planned');
    expect(drafts.getRun(run.id)?.status).toBe('accepted');
  });

  test('accept is idempotent and returns the existing created item', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Split a large project', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-4',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      proposedTitle: 'Define the first milestone',
    }]);

    const [first] = drafts.acceptDrafts(run.id, { drafts: [{ draftId: draft!.id }] });
    const [second] = drafts.acceptDrafts(run.id, { drafts: [{ draftId: draft!.id, title: 'Ignored edit' }] });

    expect(second?.createdWorkItemId).toBe(first?.createdWorkItemId);
    expect(workItems.list({ parentId: idea.id })).toHaveLength(1);
    expect(workItems.get(first!.createdWorkItemId!)?.title).toBe('Define the first milestone');
  });

  test('edited accept records edited status and applies user fields', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Plan the beta', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-5',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      proposedTitle: 'Find testers',
      proposedPriority: 'p2',
    }]);

    const [accepted] = drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id, title: 'Interview beta testers', priority: 'p1', labels: ['beta'] }],
    });
    const created = workItems.get(accepted!.createdWorkItemId!);

    expect(accepted?.status).toBe('edited');
    expect(created?.title).toBe('Interview beta testers');
    expect(created?.priority).toBe('p1');
    expect(created?.labels).toEqual(['beta']);
  });

  test('reject preserves source evidence and cannot be accepted later', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Triage old sessions', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-6',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      sourceRecordId: 'meeting-1',
      sourceSpans: [{ text: 'maybe automate everything' }],
      proposedTitle: 'Automate the whole backlog',
    }]);

    const rejected = drafts.rejectDraft(draft!.id, 'too broad');

    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectReason).toBe('too broad');
    expect(rejected.sourceRecordId).toBe('meeting-1');
    expect(rejected.sourceSpans).toEqual([{ text: 'maybe automate everything' }]);
    expect(() => drafts.acceptDrafts(run.id, { drafts: [{ draftId: draft!.id }] })).toThrow(DecisionDraftConflictError);
    expect(workItems.list({ parentId: idea.id })).toEqual([]);
  });
});
