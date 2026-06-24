import type { Database } from 'bun:sqlite';
import {
  systemClock,
  ulid,
  type AiGenerationRun,
  type AcceptDecisionDraftInput,
  type Clock,
  type CreateAiGenerationRunInput,
  type CreateDecisionDraftInput,
  type DecisionDraft,
  type DecisionDraftStatus,
  type DraftSourceKind,
  type SourceSpan,
  type WorkItemStatus,
} from '@stash/shared';
import { WorkItemService } from '../work-item/service.js';
import {
  AcceptDecisionDraftsSchema,
  CreateAiGenerationRunSchema,
  CreateDecisionDraftSchema,
} from './schemas.js';

interface AiGenerationRunRow {
  id: string;
  feature: AiGenerationRun['feature'];
  source_kind: AiGenerationRun['sourceKind'];
  source_work_item_id: string | null;
  source_record_id: string | null;
  source_path: string | null;
  provider: string;
  model: string | null;
  prompt_hash: string;
  status: AiGenerationRun['status'];
  raw_response_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
}

interface DecisionDraftRow {
  id: string;
  run_id: string;
  source_kind: DraftSourceKind;
  source_work_item_id: string | null;
  source_record_id: string | null;
  source_path: string | null;
  source_spans_json: string;
  proposed_title: string;
  proposed_description: string | null;
  proposed_kind: DecisionDraft['proposedKind'];
  proposed_priority: DecisionDraft['proposedPriority'];
  proposed_labels_json: string;
  proposed_scheduled_for: string | null;
  proposed_due_at: string | null;
  proposed_checklist_json: string;
  sort_order: number | null;
  status: DecisionDraftStatus;
  reject_reason: string | null;
  created_work_item_id: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export class AiGenerationRunNotFoundError extends Error {
  constructor(id: string) {
    super(`ai generation run ${id} not found`);
    this.name = 'AiGenerationRunNotFoundError';
  }
}

export class DecisionDraftNotFoundError extends Error {
  constructor(id: string) {
    super(`decision draft ${id} not found`);
    this.name = 'DecisionDraftNotFoundError';
  }
}

export class DecisionDraftConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionDraftConflictError';
  }
}

export class AiDraftService {
  private readonly clock: Clock;
  private readonly workItems: WorkItemService;

  constructor(private readonly deps: { db: Database; clock?: Clock; workItems?: WorkItemService }) {
    this.clock = deps.clock ?? systemClock;
    this.workItems = deps.workItems ?? new WorkItemService({ db: deps.db, clock: this.clock });
  }

  createRun(input: CreateAiGenerationRunInput): AiGenerationRun {
    const parsed = CreateAiGenerationRunSchema.parse(input);
    const now = this.clock.nowIso();
    const run: AiGenerationRun = {
      id: ulid(this.clock.now()),
      ...parsed,
      status: parsed.status ?? 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.deps.db.prepare(
      `insert into ai_generation_runs(
        id, feature, source_kind, source_work_item_id, source_record_id, source_path,
        provider, model, prompt_hash, status, raw_response_json, error,
        created_at, updated_at, accepted_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)`,
    ).run(
      run.id,
      run.feature,
      run.sourceKind,
      run.sourceWorkItemId ?? null,
      run.sourceRecordId ?? null,
      run.sourcePath ?? null,
      run.provider,
      run.model ?? null,
      run.promptHash,
      run.status,
      run.rawResponseJson ?? null,
      run.error ?? null,
      run.createdAt,
      run.updatedAt,
    );
    return run;
  }

  createDrafts(runId: string, inputs: CreateDecisionDraftInput[]): DecisionDraft[] {
    const run = this.getRun(runId);
    if (!run) throw new AiGenerationRunNotFoundError(runId);
    assertDraftProducingRun(run);
    if (run.status !== 'succeeded') {
      throw new DecisionDraftConflictError(`run ${runId} must be succeeded before creating decision drafts`);
    }
    const now = this.clock.nowIso();
    const drafts: DecisionDraft[] = [];

    this.deps.db.transaction(() => {
      for (const input of inputs) {
        const parsed = CreateDecisionDraftSchema.parse(input);
        if (parsed.sourceKind !== run.sourceKind) {
          throw new DecisionDraftConflictError(`draft source kind ${parsed.sourceKind} does not match run ${run.sourceKind}`);
        }
        if (parsed.sourceWorkItemId !== undefined && parsed.sourceWorkItemId !== run.sourceWorkItemId) {
          throw new DecisionDraftConflictError(`draft source work item does not match run ${run.id}`);
        }
        const draft: DecisionDraft = {
          id: ulid(this.clock.now()),
          runId,
          sourceKind: parsed.sourceKind,
          sourceWorkItemId: parsed.sourceWorkItemId ?? run.sourceWorkItemId,
          sourceRecordId: parsed.sourceRecordId ?? run.sourceRecordId,
          sourcePath: parsed.sourcePath ?? run.sourcePath,
          sourceSpans: parsed.sourceSpans ?? [],
          proposedTitle: parsed.proposedTitle,
          proposedDescription: parsed.proposedDescription,
          proposedKind: parsed.proposedKind ?? 'task',
          proposedPriority: parsed.proposedPriority ?? 'p2',
          proposedLabels: parsed.proposedLabels ?? [],
          proposedScheduledFor: parsed.proposedScheduledFor,
          proposedDueAt: parsed.proposedDueAt,
          proposedChecklist: parsed.proposedChecklist ?? [],
          sortOrder: parsed.sortOrder,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        };
        this.insertDraft(draft);
        drafts.push(draft);
      }
    })();

    return drafts;
  }

  recordRunFailure(id: string, error: string, rawResponseJson?: string): AiGenerationRun {
    const existing = this.getRun(id);
    if (!existing) throw new AiGenerationRunNotFoundError(id);
    if (existing.status === 'accepted' || existing.status === 'discarded') {
      throw new DecisionDraftConflictError(`run ${id} is terminal and cannot be failed`);
    }
    const now = this.clock.nowIso();
    const updated = this.deps.db.prepare(
      `update ai_generation_runs
       set status = 'failed', error = ?, raw_response_json = coalesce(?, raw_response_json), updated_at = ?
       where id = ?`,
    ).run(error, rawResponseJson ?? null, now, id);
    if (updated.changes === 0) throw new AiGenerationRunNotFoundError(id);
    return this.getRequiredRun(id);
  }

  recordRunSuccess(id: string, rawResponseJson: string): AiGenerationRun {
    const existing = this.getRun(id);
    if (!existing) throw new AiGenerationRunNotFoundError(id);
    if (existing.status === 'accepted' || existing.status === 'discarded') {
      throw new DecisionDraftConflictError(`run ${id} is terminal and cannot be succeeded`);
    }
    const now = this.clock.nowIso();
    const updated = this.deps.db.prepare(
      `update ai_generation_runs
       set status = 'succeeded', raw_response_json = ?, error = null, updated_at = ?
       where id = ?`,
    ).run(rawResponseJson, now, id);
    if (updated.changes === 0) throw new AiGenerationRunNotFoundError(id);
    return this.getRequiredRun(id);
  }

  recordRunAccepted(id: string): AiGenerationRun {
    const existing = this.getRun(id);
    if (!existing) throw new AiGenerationRunNotFoundError(id);
    if (existing.status === 'failed' || existing.status === 'discarded') {
      throw new DecisionDraftConflictError(`run ${id} cannot be accepted from ${existing.status}`);
    }
    const now = this.clock.nowIso();
    this.markRunAccepted(id, now);
    return this.getRequiredRun(id);
  }

  listDrafts(filter: { runId?: string; status?: DecisionDraftStatus } = {}): DecisionDraft[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.runId) {
      where.push('run_id = ?');
      params.push(filter.runId);
    }
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    return this.deps.db
      .query<DecisionDraftRow, typeof params>(
        `select * from decision_drafts ${whereSql} order by created_at asc, sort_order asc`,
      )
      .all(...params)
      .map(mapDraft);
  }

  rejectDraft(id: string, reason: string): DecisionDraft {
    const existing = this.getDraft(id);
    if (!existing) throw new DecisionDraftNotFoundError(id);
    if (existing.status === 'rejected') {
      return existing;
    }
    if (existing.status === 'accepted' || existing.status === 'edited' || existing.createdWorkItemId) {
      throw new DecisionDraftConflictError('accepted or edited draft cannot be rejected');
    }
    const now = this.clock.nowIso();
    this.deps.db.prepare(
      `update decision_drafts
       set status = 'rejected', reject_reason = ?, rejected_at = ?, updated_at = ?
       where id = ?`,
    ).run(reason, now, now, id);
    return this.getRequiredDraft(id);
  }

  acceptDrafts(runId: string, input: unknown): DecisionDraft[] {
    const run = this.getRun(runId);
    if (!run) throw new AiGenerationRunNotFoundError(runId);
    assertDraftProducingRun(run);
    if (run.status !== 'succeeded' && run.status !== 'accepted') {
      throw new DecisionDraftConflictError(`run ${runId} must be succeeded before accepting decision drafts`);
    }
    const parsed = AcceptDecisionDraftsSchema.parse(input);
    const now = this.clock.nowIso();
    const accepted: DecisionDraft[] = [];
    let acceptedNewDraft = false;

    this.deps.db.transaction(() => {
      for (const draftInput of parsed.drafts) {
        const draft = this.getRequiredDraft(draftInput.draftId);
        if (draft.runId !== runId) {
          throw new DecisionDraftConflictError(`draft ${draft.id} does not belong to run ${runId}`);
        }
        if (draft.status === 'rejected') {
          throw new DecisionDraftConflictError(`rejected draft ${draft.id} cannot be accepted`);
        }
        if (draft.status === 'accepted' || draft.status === 'edited') {
          accepted.push(draft);
          continue;
        }

        const sourceContext = this.getAcceptSourceContext(draft);
        const created = this.workItems.create({
          projectId: sourceContext.projectId,
          areaId: sourceContext.areaId,
          title: draftInput.title ?? draft.proposedTitle,
          description: draftInput.description ?? draft.proposedDescription,
          parentId: draft.sourceWorkItemId,
          kind: draftInput.kind ?? draft.proposedKind,
          priority: draftInput.priority ?? draft.proposedPriority,
          labels: draftInput.labels ?? draft.proposedLabels,
          scheduledFor: draftInput.scheduledFor ?? draft.proposedScheduledFor,
          dueAt: draftInput.dueAt ?? draft.proposedDueAt,
          checklist: draftInput.checklist ?? draft.proposedChecklist,
          source: 'manual',
          confidence: 'explicit',
          status: 'inbox',
        });

        this.deps.db.prepare(
          `update decision_drafts
           set status = ?, created_work_item_id = ?, accepted_at = ?, updated_at = ?
           where id = ?`,
        ).run(hasUserEdits(draft, draftInput) ? 'edited' : 'accepted', created.id, now, now, draft.id);
        accepted.push(this.getRequiredDraft(draft.id));
        acceptedNewDraft = true;
      }

      if (acceptedNewDraft) {
        this.updateSourceIdeaStatus(run, parsed.sourceIdeaStatus);
        this.markRunAccepted(runId, now);
      }
    })();

    return accepted;
  }

  getRun(id: string): AiGenerationRun | undefined {
    const row = this.deps.db.query<AiGenerationRunRow, [string]>(
      'select * from ai_generation_runs where id = ?',
    ).get(id);
    return row ? mapRun(row) : undefined;
  }

  getDraft(id: string): DecisionDraft | undefined {
    const row = this.deps.db.query<DecisionDraftRow, [string]>(
      'select * from decision_drafts where id = ?',
    ).get(id);
    return row ? mapDraft(row) : undefined;
  }

  private insertDraft(draft: DecisionDraft): void {
    this.deps.db.prepare(
      `insert into decision_drafts(
        id, run_id, source_kind, source_work_item_id, source_record_id, source_path,
        source_spans_json, proposed_title, proposed_description, proposed_kind,
        proposed_priority, proposed_labels_json, proposed_scheduled_for, proposed_due_at,
        proposed_checklist_json, sort_order, status, reject_reason, created_work_item_id,
        accepted_at, rejected_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', null, null, null, null, ?, ?)`,
    ).run(
      draft.id,
      draft.runId,
      draft.sourceKind,
      draft.sourceWorkItemId ?? null,
      draft.sourceRecordId ?? null,
      draft.sourcePath ?? null,
      JSON.stringify(draft.sourceSpans),
      draft.proposedTitle,
      draft.proposedDescription ?? null,
      draft.proposedKind,
      draft.proposedPriority,
      JSON.stringify(draft.proposedLabels),
      draft.proposedScheduledFor ?? null,
      draft.proposedDueAt ?? null,
      JSON.stringify(draft.proposedChecklist),
      draft.sortOrder ?? null,
      draft.createdAt,
      draft.updatedAt,
    );
  }

  private getRequiredRun(id: string): AiGenerationRun {
    const run = this.getRun(id);
    if (!run) throw new AiGenerationRunNotFoundError(id);
    return run;
  }

  private getRequiredDraft(id: string): DecisionDraft {
    const draft = this.getDraft(id);
    if (!draft) throw new DecisionDraftNotFoundError(id);
    return draft;
  }

  private markRunAccepted(runId: string, now: string): void {
    this.deps.db.prepare(
      `update ai_generation_runs
       set status = 'accepted', accepted_at = coalesce(accepted_at, ?), updated_at = ?
       where id = ?`,
    ).run(now, now, runId);
  }

  private updateSourceIdeaStatus(run: AiGenerationRun, status: Extract<WorkItemStatus, 'planned' | 'done'> | undefined): void {
    if (!status) return;
    if (run.sourceKind !== 'idea_decomposition') {
      throw new DecisionDraftConflictError('sourceIdeaStatus is only valid for idea decomposition runs');
    }
    if (!run.sourceWorkItemId) {
      throw new DecisionDraftConflictError('sourceIdeaStatus requires a source idea work item');
    }
    const source = this.workItems.get(run.sourceWorkItemId);
    if (!source) {
      throw new DecisionDraftConflictError(`source idea work item ${run.sourceWorkItemId} was not found`);
    }
    if (source.kind !== 'idea') {
      throw new DecisionDraftConflictError('sourceIdeaStatus requires an idea source work item');
    }
    this.workItems.update(run.sourceWorkItemId, { status });
  }

  private getAcceptSourceContext(draft: DecisionDraft): { projectId?: string; areaId?: string } {
    if (!draft.sourceWorkItemId) {
      if (draft.sourceKind === 'idea_decomposition') {
        throw new DecisionDraftConflictError('source idea work item no longer exists');
      }
      return {};
    }
    const source = this.workItems.get(draft.sourceWorkItemId);
    if (!source) {
      throw new DecisionDraftConflictError(`source work item ${draft.sourceWorkItemId} was not found`);
    }
    if (draft.sourceKind === 'idea_decomposition' && source.kind !== 'idea') {
      throw new DecisionDraftConflictError('idea decomposition drafts require an idea source work item');
    }
    if (draft.sourceKind === 'idea_decomposition' && (source.status === 'done' || source.status === 'dropped')) {
      throw new DecisionDraftConflictError(`source idea work item ${source.id} is terminal`);
    }
    return { projectId: source.projectId, areaId: source.areaId };
  }
}

function hasUserEdits(draft: DecisionDraft, input: AcceptDecisionDraftInput): boolean {
  return (
    (input.title !== undefined && input.title !== draft.proposedTitle) ||
    (input.description !== undefined && input.description !== draft.proposedDescription) ||
    (input.kind !== undefined && input.kind !== draft.proposedKind) ||
    (input.priority !== undefined && input.priority !== draft.proposedPriority) ||
    (input.labels !== undefined && JSON.stringify(input.labels) !== JSON.stringify(draft.proposedLabels)) ||
    (input.scheduledFor !== undefined && input.scheduledFor !== draft.proposedScheduledFor) ||
    (input.dueAt !== undefined && input.dueAt !== draft.proposedDueAt) ||
    (input.checklist !== undefined && JSON.stringify(input.checklist) !== JSON.stringify(draft.proposedChecklist))
  );
}

function isDraftSourceKind(sourceKind: string): sourceKind is DraftSourceKind {
  return (
    sourceKind === 'idea_decomposition' ||
    sourceKind === 'meeting_triage' ||
    sourceKind === 'session_inferred' ||
    sourceKind === 'manual_split'
  );
}

function assertDraftProducingRun(run: AiGenerationRun): void {
  if (!isDraftSourceKind(run.sourceKind)) {
    throw new DecisionDraftConflictError(`run source kind ${run.sourceKind} cannot create decision drafts`);
  }
  if (!isDraftSourceKind(run.feature)) {
    throw new DecisionDraftConflictError(`run feature ${run.feature} cannot create decision drafts`);
  }
  if (run.feature !== run.sourceKind) {
    throw new DecisionDraftConflictError(`run feature ${run.feature} must match draft source kind ${run.sourceKind}`);
  }
}

function parseJsonArray<T>(raw: string): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mapRun(row: AiGenerationRunRow): AiGenerationRun {
  return {
    id: row.id,
    feature: row.feature,
    sourceKind: row.source_kind,
    sourceWorkItemId: row.source_work_item_id ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,
    sourcePath: row.source_path ?? undefined,
    provider: row.provider,
    model: row.model ?? undefined,
    promptHash: row.prompt_hash,
    status: row.status,
    rawResponseJson: row.raw_response_json ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at ?? undefined,
  };
}

function mapDraft(row: DecisionDraftRow): DecisionDraft {
  return {
    id: row.id,
    runId: row.run_id,
    sourceKind: row.source_kind,
    sourceWorkItemId: row.source_work_item_id ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,
    sourcePath: row.source_path ?? undefined,
    sourceSpans: parseJsonArray<SourceSpan>(row.source_spans_json),
    proposedTitle: row.proposed_title,
    proposedDescription: row.proposed_description ?? undefined,
    proposedKind: row.proposed_kind,
    proposedPriority: row.proposed_priority,
    proposedLabels: parseJsonArray<string>(row.proposed_labels_json),
    proposedScheduledFor: row.proposed_scheduled_for ?? undefined,
    proposedDueAt: row.proposed_due_at ?? undefined,
    proposedChecklist: parseJsonArray(row.proposed_checklist_json),
    sortOrder: row.sort_order ?? undefined,
    status: row.status,
    rejectReason: row.reject_reason ?? undefined,
    createdWorkItemId: row.created_work_item_id ?? undefined,
    acceptedAt: row.accepted_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
