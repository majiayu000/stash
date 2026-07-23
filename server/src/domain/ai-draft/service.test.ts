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
  test('rejects invalid calendar dates before draft persistence or acceptance', () => {
    const { drafts, workItems } = setupAiDraftTest();
    const run = drafts.createRun({
      feature: 'manual_split',
      sourceKind: 'manual_split',
      provider: 'local-test',
      promptHash: 'calendar-validation',
      status: 'succeeded',
    });
    expect(() => drafts.createDrafts(run.id, [{
      sourceKind: 'manual_split',
      proposedTitle: 'invalid proposed date',
      proposedScheduledFor: '2026-02-30',
    }])).toThrow();
    expect(drafts.listDrafts({ runId: run.id })).toEqual([]);

    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'manual_split',
      proposedTitle: 'valid proposed date',
      proposedScheduledFor: '2026-06-18',
    }]);
    expect(() => drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id, dueAt: '2026-06-18T00:00:00.000Z' }],
    })).toThrow();
    expect(workItems.list()).toEqual([]);
    expect(drafts.getDraft(draft!.id)?.status).toBe('draft');
  });

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

  test('discarded runs cannot be failed later', () => {
    const { drafts } = setupAiDraftTest();
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      provider: 'local-test',
      promptHash: 'hash-2b',
      status: 'discarded',
    });

    expect(() => drafts.recordRunFailure(run.id, 'late provider error')).toThrow(DecisionDraftConflictError);
    expect(drafts.getRun(run.id)?.status).toBe('discarded');
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

  test('drafts inherit source context from the run', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({
      title: 'Turn an idea into tasks',
      kind: 'idea',
      projectId: 'project-1',
      areaId: 'area-1',
    });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      sourceRecordId: 'idea-record-1',
      sourcePath: '/ideas/raw.md',
      provider: 'local-test',
      promptHash: 'hash-3b',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      proposedTitle: 'Write the first task',
    }]);

    expect(draft?.sourceWorkItemId).toBe(idea.id);
    expect(draft?.sourceRecordId).toBe('idea-record-1');
    expect(draft?.sourcePath).toBe('/ideas/raw.md');

    const [accepted] = drafts.acceptDrafts(run.id, { drafts: [{ draftId: draft!.id }] });
    const created = workItems.get(accepted!.createdWorkItemId!);
    expect(created?.parentId).toBe(idea.id);
    expect(created?.projectId).toBe('project-1');
    expect(created?.areaId).toBe('area-1');
  });

  test('draft source work item must match the run source', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const ideaA = workItems.create({ title: 'Source idea A', kind: 'idea' });
    const ideaB = workItems.create({ title: 'Source idea B', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: ideaA.id,
      provider: 'local-test',
      promptHash: 'hash-3ba',
      status: 'succeeded',
    });

    expect(() => drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: ideaB.id,
      proposedTitle: 'Should not split audit across ideas',
    }])).toThrow(DecisionDraftConflictError);
    expect(drafts.listDrafts({ runId: run.id })).toEqual([]);
  });

  test('provenance-only runs cannot create drafts', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Coach this task', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'task_coach',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-3bb',
      status: 'succeeded',
    });

    expect(() => drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      proposedTitle: 'Should not enter decision inbox',
    }])).toThrow(DecisionDraftConflictError);
  });

  test('failed runs cannot create or accept drafts', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Handle invalid provider output', kind: 'idea' });
    const failedRun = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-3c',
    });

    drafts.recordRunFailure(failedRun.id, 'invalid JSON');

    expect(() => drafts.createDrafts(failedRun.id, [{
      sourceKind: 'idea_decomposition',
      proposedTitle: 'Should not exist',
    }])).toThrow(DecisionDraftConflictError);

    const runWithDraft = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-3d',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(runWithDraft.id, [{
      sourceKind: 'idea_decomposition',
      proposedTitle: 'Review provider failure',
    }]);
    drafts.recordRunFailure(runWithDraft.id, 'late validation failure');

    expect(() => drafts.acceptDrafts(runWithDraft.id, { drafts: [{ draftId: draft!.id }] })).toThrow(DecisionDraftConflictError);
    expect(workItems.list({ parentId: idea.id })).toEqual([]);
    expect(drafts.getRun(runWithDraft.id)?.status).toBe('failed');
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
    const [second] = drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id, title: 'Ignored edit' }],
      sourceIdeaStatus: 'planned',
    });

    expect(second?.createdWorkItemId).toBe(first?.createdWorkItemId);
    expect(workItems.list({ parentId: idea.id })).toHaveLength(1);
    expect(workItems.get(first!.createdWorkItemId!)?.title).toBe('Define the first milestone');
    expect(workItems.get(idea.id)?.status).toBe('inbox');
    expect(() => drafts.recordRunFailure(run.id, 'late provider error')).toThrow(DecisionDraftConflictError);
    expect(drafts.getRun(run.id)?.status).toBe('accepted');
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
      proposedChecklist: [{ id: 'check-1', text: 'make a list', completed: false }],
    }]);

    const [accepted] = drafts.acceptDrafts(run.id, {
      drafts: [{
        draftId: draft!.id,
        title: 'Interview beta testers',
        priority: 'p1',
        labels: ['beta'],
        checklist: [{ id: 'check-1', text: 'make a target list', completed: false }],
      }],
    });
    const created = workItems.get(accepted!.createdWorkItemId!);

    expect(accepted?.status).toBe('edited');
    expect(created?.title).toBe('Interview beta testers');
    expect(created?.priority).toBe('p1');
    expect(created?.labels).toEqual(['beta']);
    expect(created?.checklist).toEqual([{ id: 'check-1', text: 'make a target list', completed: false }]);
    expect(() => drafts.rejectDraft(accepted!.id, 'changed my mind')).toThrow(DecisionDraftConflictError);
    expect(drafts.getDraft(accepted!.id)?.status).toBe('edited');
  });

  test('flagged drafts require reviewed acceptance and preserve explicit description clears', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const run = drafts.createRun({
      feature: 'meeting_triage',
      sourceKind: 'meeting_triage',
      provider: 'local-test',
      promptHash: 'hash-5a',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'meeting_triage',
      proposedTitle: 'Review risky follow-up',
      proposedDescription: 'Generated text that reviewer removed.',
      reviewFlags: ['missing_source_span'],
    }]);

    expect(() => drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id }],
    })).toThrow(DecisionDraftConflictError);
    expect(workItems.list()).toEqual([]);

    const [accepted] = drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id, description: '', reviewed: true }],
    });
    const created = workItems.get(accepted!.createdWorkItemId!);

    expect(accepted?.status).toBe('edited');
    expect(created?.description).toBeUndefined();
  });

  test('deleting an accepted work item keeps the accepted draft audit row', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Trace generated task deletion', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-5b',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      proposedTitle: 'Task that might be deleted later',
    }]);
    const [accepted] = drafts.acceptDrafts(run.id, { drafts: [{ draftId: draft!.id }] });

    workItems.delete(accepted!.createdWorkItemId!);

    const afterDelete = drafts.getDraft(accepted!.id);
    expect(afterDelete?.status).toBe('accepted');
    expect(afterDelete?.createdWorkItemId).toBeUndefined();
    expect(afterDelete?.sourceWorkItemId).toBe(idea.id);

    const [afterSecondAccept] = drafts.acceptDrafts(run.id, { drafts: [{ draftId: accepted!.id }] });
    expect(afterSecondAccept?.status).toBe('accepted');
    expect(afterSecondAccept?.createdWorkItemId).toBeUndefined();
    expect(workItems.list({ parentId: idea.id })).toEqual([]);
  });

  test('sourceIdeaStatus is only valid for idea decomposition sources', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const task = workItems.create({ title: 'Summarize a meeting', kind: 'task' });
    const run = drafts.createRun({
      feature: 'meeting_triage',
      sourceKind: 'meeting_triage',
      sourceWorkItemId: task.id,
      provider: 'local-test',
      promptHash: 'hash-5c',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'meeting_triage',
      proposedTitle: 'Follow up with the team',
    }]);

    expect(() => drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id }],
      sourceIdeaStatus: 'planned',
    })).toThrow(DecisionDraftConflictError);
    expect(workItems.list({ parentId: task.id })).toEqual([]);
    expect(drafts.getDraft(draft!.id)?.createdWorkItemId).toBeUndefined();
  });

  test('sourceIdeaStatus requires an idea source work item', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const task = workItems.create({ title: 'Misclassified source', kind: 'task' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: task.id,
      provider: 'local-test',
      promptHash: 'hash-5d',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      proposedTitle: 'Should not update a task source status',
    }]);

    expect(() => drafts.acceptDrafts(run.id, {
      drafts: [{ draftId: draft!.id }],
      sourceIdeaStatus: 'planned',
    })).toThrow(DecisionDraftConflictError);
    expect(workItems.list({ parentId: task.id })).toEqual([]);
    expect(workItems.get(task.id)?.status).toBe('inbox');
  });

  test('accept rejects idea decomposition drafts after source idea deletion', () => {
    const { workItems, drafts } = setupAiDraftTest();
    const idea = workItems.create({ title: 'Delete this idea before review', kind: 'idea' });
    const run = drafts.createRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      provider: 'local-test',
      promptHash: 'hash-5e',
      status: 'succeeded',
    });
    const [draft] = drafts.createDrafts(run.id, [{
      sourceKind: 'idea_decomposition',
      proposedTitle: 'Should not be orphaned',
    }]);

    workItems.delete(idea.id);

    expect(drafts.getDraft(draft!.id)?.sourceWorkItemId).toBeUndefined();
    expect(() => drafts.acceptDrafts(run.id, { drafts: [{ draftId: draft!.id }] })).toThrow(DecisionDraftConflictError);
    expect(workItems.list()).toEqual([]);
    expect(drafts.getRun(run.id)?.status).toBe('succeeded');
  });

  test('accept rejects stale drafts after source idea becomes terminal', () => {
    for (const status of ['done', 'dropped'] as const) {
      const { workItems, drafts } = setupAiDraftTest();
      const idea = workItems.create({ title: `Terminal ${status} idea`, kind: 'idea' });
      const run = drafts.createRun({
        feature: 'idea_decomposition',
        sourceKind: 'idea_decomposition',
        sourceWorkItemId: idea.id,
        provider: 'local-test',
        promptHash: `hash-terminal-${status}`,
        status: 'succeeded',
      });
      const [draft] = drafts.createDrafts(run.id, [{
        sourceKind: 'idea_decomposition',
        proposedTitle: 'Should not be accepted under a terminal idea',
      }]);

      workItems.update(idea.id, { status });

      expect(() => drafts.acceptDrafts(run.id, {
        drafts: [{ draftId: draft!.id }],
        sourceIdeaStatus: 'planned',
      })).toThrow(DecisionDraftConflictError);
      expect(workItems.get(idea.id)?.status).toBe(status);
      expect(workItems.list({ parentId: idea.id })).toEqual([]);
      expect(drafts.getRun(run.id)?.status).toBe('succeeded');
    }
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
    const rejectedAgain = drafts.rejectDraft(draft!.id, 'still too broad');

    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectReason).toBe('too broad');
    expect(rejectedAgain.rejectReason).toBe('too broad');
    expect(rejectedAgain.rejectedAt).toBe(rejected.rejectedAt);
    expect(rejected.sourceRecordId).toBe('meeting-1');
    expect(rejected.sourceSpans).toEqual([{ text: 'maybe automate everything' }]);
    expect(() => drafts.acceptDrafts(run.id, { drafts: [{ draftId: draft!.id }] })).toThrow(DecisionDraftConflictError);
    expect(workItems.list({ parentId: idea.id })).toEqual([]);
  });
});
