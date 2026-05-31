import { createHash } from 'crypto';
import type { Database } from 'bun:sqlite';
import type {
  AgentProvider,
  Clock,
  DecisionCandidateRecord,
  DecisionCandidateStatus,
} from '@stash/shared';
import { systemClock } from '@stash/shared';

interface DecisionCandidateRow {
  id: string;
  project_id: string | null;
  provider: AgentProvider;
  session_id: string;
  source_path: string;
  raw: string;
  title: string;
  timestamp: string;
  status: DecisionCandidateStatus;
  decision_id: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  ignored_at: string | null;
}

export interface ExtractedDecisionCandidate {
  raw: string;
  title: string;
  timestamp: string;
}

export interface CandidateContext {
  projectId?: string;
  provider: AgentProvider;
  sessionId: string;
  sourcePath: string;
}

export class DecisionCandidateNotFoundError extends Error {
  constructor(id: string) {
    super(`decision candidate ${id} not found`);
    this.name = 'DecisionCandidateNotFoundError';
  }
}

export class DecisionCandidateService {
  private readonly clock: Clock;

  constructor(private readonly deps: { db: Database; clock?: Clock }) {
    this.clock = deps.clock ?? systemClock;
  }

  upsertMany(context: CandidateContext, candidates: ExtractedDecisionCandidate[]): DecisionCandidateRecord[] {
    const now = this.clock.nowIso();
    const records: DecisionCandidateRecord[] = [];

    for (const candidate of candidates) {
      const id = candidateId(context, candidate);
      const existing = this.get(id);
      if (existing) {
        records.push(existing);
        continue;
      }
      this.deps.db.prepare(
        `insert into decision_candidates(
          id, project_id, provider, session_id, source_path, raw, title, timestamp,
          status, decision_id, created_at, updated_at, accepted_at, ignored_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', null, ?, ?, null, null)`,
      ).run(
        id,
        context.projectId ?? null,
        context.provider,
        context.sessionId,
        context.sourcePath,
        candidate.raw,
        candidate.title,
        candidate.timestamp,
        now,
        now,
      );
      records.push(this.getRequired(id));
    }
    return records;
  }

  accept(id: string, decisionId: string): DecisionCandidateRecord {
    const now = this.clock.nowIso();
    const updated = this.deps.db.prepare(
      `update decision_candidates
       set status = 'accepted', decision_id = ?, accepted_at = ?, updated_at = ?
       where id = ?`,
    ).run(decisionId, now, now, id);
    if (updated.changes === 0) throw new DecisionCandidateNotFoundError(id);
    return this.getRequired(id);
  }

  ignore(id: string): DecisionCandidateRecord {
    const now = this.clock.nowIso();
    const updated = this.deps.db.prepare(
      `update decision_candidates
       set status = 'ignored', ignored_at = ?, updated_at = ?
       where id = ?`,
    ).run(now, now, id);
    if (updated.changes === 0) throw new DecisionCandidateNotFoundError(id);
    return this.getRequired(id);
  }

  get(id: string): DecisionCandidateRecord | undefined {
    const row = this.deps.db.query<DecisionCandidateRow, [string]>(
      'select * from decision_candidates where id = ?',
    ).get(id);
    return row ? mapCandidate(row) : undefined;
  }

  private getRequired(id: string): DecisionCandidateRecord {
    const candidate = this.get(id);
    if (!candidate) throw new DecisionCandidateNotFoundError(id);
    return candidate;
  }
}

function candidateId(context: CandidateContext, candidate: ExtractedDecisionCandidate): string {
  const hash = createHash('sha256')
    .update([
      context.provider,
      context.sessionId,
      context.sourcePath,
      candidate.timestamp,
      candidate.raw,
    ].join('\0'))
    .digest('hex')
    .slice(0, 24);
  return `dc_${hash}`;
}

function mapCandidate(row: DecisionCandidateRow): DecisionCandidateRecord {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    provider: row.provider,
    sessionId: row.session_id,
    sourcePath: row.source_path,
    raw: row.raw,
    title: row.title,
    timestamp: row.timestamp,
    status: row.status,
    decisionId: row.decision_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at ?? undefined,
    ignoredAt: row.ignored_at ?? undefined,
  };
}
