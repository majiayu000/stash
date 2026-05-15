import type { Database } from 'bun:sqlite';
import {
  systemClock,
  ulid,
  type AgentSession,
  type Clock,
  type CreateEvidenceInput,
  type ProgressEvidence,
  type WorkItem,
} from '@stash/shared';
import { WorkItemRepository } from '../work-item/repository.js';
import { WorkItemNotFoundError, WorkItemService } from '../work-item/service.js';
import { EvidenceRepository, type EvidenceFilter } from './repository.js';

const COMPLETION_HINTS = [
  /\bdone\b/i,
  /\bcompleted\b/i,
  /\bfinished\b/i,
  /\bshipped\b/i,
  /\bresolved\b/i,
  /\bfixed\b/i,
  /\bverif(?:y|ied|ication)\b/i,
  /\bpassing\b/i,
  /\bgreen\b/i,
];

export function detectsCompletion(text: string): boolean {
  return COMPLETION_HINTS.some((re) => re.test(text));
}

export class EvidenceNotFoundError extends Error {
  constructor(id: string) {
    super(`evidence ${id} not found`);
    this.name = 'EvidenceNotFoundError';
  }
}

export class NoPendingCandidateError extends Error {
  constructor(itemId: string) {
    super(`no pending completion candidate for ${itemId}`);
    this.name = 'NoPendingCandidateError';
  }
}

export interface EvidenceServiceDeps {
  db: Database;
  clock?: Clock;
}

export interface ProgressInfo {
  workItemId: string;
  /** 0-1, only meaningful when basis !== 'none'. */
  ratio: number;
  basis: 'none' | 'checklist' | 'inferred';
  estimated: boolean;
  checklistTotal: number;
  checklistDone: number;
  evidenceCount: number;
  pendingCandidate?: ProgressEvidence;
}

export class EvidenceService {
  private readonly evidenceRepo: EvidenceRepository;
  private readonly itemRepo: WorkItemRepository;
  private readonly items: WorkItemService;
  private readonly clock: Clock;

  constructor(deps: EvidenceServiceDeps) {
    this.evidenceRepo = new EvidenceRepository(deps.db);
    this.itemRepo = new WorkItemRepository(deps.db);
    this.items = new WorkItemService(deps);
    this.clock = deps.clock ?? systemClock;
  }

  create(input: CreateEvidenceInput): ProgressEvidence {
    if (!this.itemRepo.getById(input.workItemId)) {
      throw new WorkItemNotFoundError(input.workItemId);
    }
    const ev: ProgressEvidence = {
      id: ulid(this.clock.now()),
      workItemId: input.workItemId,
      sessionId: input.sessionId,
      provider: input.provider,
      kind: input.kind,
      text: input.text,
      sourcePath: input.sourcePath,
      pendingAcceptance: input.pendingAcceptance ?? false,
      timestamp: this.clock.nowIso(),
    };
    return this.evidenceRepo.insert(ev);
  }

  list(filter: EvidenceFilter = {}): ProgressEvidence[] {
    return this.evidenceRepo.list(filter);
  }

  /**
   * Compute feature progress per PRD §12:
   *   60% explicit child task completion +
   *   25% linked plan task completion (deferred, treated as 0 in MVP) +
   *   15% recent verified evidence.
   * For Slice 4 we use:
   *   - explicit: checklist completion ratio
   *   - inferred: presence of non-pending evidence
   * If the item has no checklist and no evidence, basis='none' (PRD: "show 'No task breakdown'").
   */
  progressFor(item: WorkItem): ProgressInfo {
    const evidence = this.evidenceRepo.list({ workItemId: item.id });
    const pending = evidence.find((e) => e.pendingAcceptance);
    const verified = evidence.filter((e) => !e.pendingAcceptance);

    const checklistTotal = item.checklist.length;
    const checklistDone = item.checklist.filter((c) => c.completed).length;

    if (checklistTotal === 0 && verified.length === 0) {
      return {
        workItemId: item.id,
        ratio: 0,
        basis: 'none',
        estimated: false,
        checklistTotal: 0,
        checklistDone: 0,
        evidenceCount: evidence.length,
        pendingCandidate: pending,
      };
    }

    if (checklistTotal > 0) {
      const explicit = (checklistDone / checklistTotal) * 0.85;
      const recentBonus = verified.length > 0 ? 0.15 : 0;
      return {
        workItemId: item.id,
        ratio: Math.min(1, explicit + recentBonus),
        basis: 'checklist',
        estimated: false,
        checklistTotal,
        checklistDone,
        evidenceCount: evidence.length,
        pendingCandidate: pending,
      };
    }

    // No checklist but we have verified evidence — inferred, label as estimated.
    return {
      workItemId: item.id,
      ratio: 0.5,
      basis: 'inferred',
      estimated: true,
      checklistTotal: 0,
      checklistDone: 0,
      evidenceCount: evidence.length,
      pendingCandidate: pending,
    };
  }

  /**
   * Walk linked sessions for a work item and propose a completion candidate
   * if the last assistant message looks like completion AND no equivalent
   * verified evidence already exists. Idempotent.
   */
  proposeFromSessions(
    workItemId: string,
    linkedSessions: Iterable<{ provider: 'claude' | 'codex'; sessionId: string }>,
    sessionLookup: (
      provider: 'claude' | 'codex',
      sessionId: string,
    ) => AgentSession | undefined,
  ): ProgressEvidence[] {
    const item = this.itemRepo.getById(workItemId);
    if (!item) return [];
    if (item.status === 'done' || item.status === 'dropped') return [];

    const proposed: ProgressEvidence[] = [];
    for (const link of linkedSessions) {
      if (this.evidenceRepo.hasAcceptedFor(workItemId, link.provider, link.sessionId)) continue;
      // Skip if already pending for this exact session.
      const existing = this.evidenceRepo
        .list({ workItemId })
        .find(
          (e) =>
            e.pendingAcceptance &&
            e.provider === link.provider &&
            e.sessionId === link.sessionId,
        );
      if (existing) {
        proposed.push(existing);
        continue;
      }
      const session = sessionLookup(link.provider, link.sessionId);
      if (!session?.lastMessage) continue;
      if (!detectsCompletion(session.lastMessage)) continue;
      const ev = this.create({
        workItemId,
        sessionId: link.sessionId,
        provider: link.provider,
        kind: 'assistant_summary',
        text: session.lastMessage.slice(0, 500),
        sourcePath: session.sourcePath,
        pendingAcceptance: true,
      });
      proposed.push(ev);
    }
    return proposed;
  }

  /**
   * Accept the pending completion candidate for a work item: flip the work
   * item to 'done' and clear pending flags.
   */
  acceptCompletion(workItemId: string): WorkItem {
    const item = this.itemRepo.getById(workItemId);
    if (!item) throw new WorkItemNotFoundError(workItemId);
    const pending = this.evidenceRepo
      .list({ workItemId, pendingOnly: true })
      .at(0);
    if (!pending) throw new NoPendingCandidateError(workItemId);
    this.evidenceRepo.clearPendingForItem(workItemId);
    return this.items.update(workItemId, { status: 'done' });
  }

  rejectCompletion(workItemId: string): number {
    const item = this.itemRepo.getById(workItemId);
    if (!item) throw new WorkItemNotFoundError(workItemId);
    return this.evidenceRepo.clearPendingForItem(workItemId);
  }
}
