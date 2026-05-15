import type { Database } from 'bun:sqlite';
import type {
  AgentProvider,
  EvidenceKind,
  ProgressEvidence,
} from '@stash/shared';

interface EvidenceRow {
  id: string;
  work_item_id: string;
  session_id: string | null;
  provider: string | null;
  kind: string;
  text: string;
  source_path: string | null;
  pending_acceptance: number;
  timestamp: string;
}

function rowToEvidence(row: EvidenceRow): ProgressEvidence {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    sessionId: row.session_id ?? undefined,
    provider: (row.provider ?? undefined) as AgentProvider | undefined,
    kind: row.kind as EvidenceKind,
    text: row.text,
    sourcePath: row.source_path ?? undefined,
    pendingAcceptance: row.pending_acceptance === 1 ? true : undefined,
    timestamp: row.timestamp,
  };
}

export interface EvidenceFilter {
  workItemId?: string;
  pendingOnly?: boolean;
}

export class EvidenceRepository {
  constructor(private readonly db: Database) {}

  insert(e: ProgressEvidence): ProgressEvidence {
    this.db
      .prepare(
        `insert into progress_evidence(
           id, work_item_id, session_id, provider, kind, text, source_path,
           pending_acceptance, timestamp)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.id,
        e.workItemId,
        e.sessionId ?? null,
        e.provider ?? null,
        e.kind,
        e.text,
        e.sourcePath ?? null,
        e.pendingAcceptance ? 1 : 0,
        e.timestamp,
      );
    return e;
  }

  list(filter: EvidenceFilter = {}): ProgressEvidence[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.workItemId) {
      where.push('work_item_id = ?');
      params.push(filter.workItemId);
    }
    if (filter.pendingOnly) {
      where.push('pending_acceptance = 1');
    }
    const sql = `select * from progress_evidence
                 ${where.length ? 'where ' + where.join(' and ') : ''}
                 order by timestamp desc`;
    return this.db
      .query<EvidenceRow, typeof params>(sql)
      .all(...params)
      .map(rowToEvidence);
  }

  getById(id: string): ProgressEvidence | null {
    const row = this.db
      .query<EvidenceRow, [string]>('select * from progress_evidence where id = ?')
      .get(id);
    return row ? rowToEvidence(row) : null;
  }

  clearPendingForItem(workItemId: string): number {
    return this.db
      .prepare(
        'update progress_evidence set pending_acceptance = 0 where work_item_id = ? and pending_acceptance = 1',
      )
      .run(workItemId).changes;
  }

  /**
   * True iff at least one non-pending evidence row references the given (provider, sessionId).
   * Used by inference to avoid re-proposing the same candidate.
   */
  hasAcceptedFor(
    workItemId: string,
    provider: AgentProvider,
    sessionId: string,
  ): boolean {
    const row = this.db
      .query<{ c: number }, [string, string, string]>(
        `select count(*) as c from progress_evidence
          where work_item_id = ? and provider = ? and session_id = ? and pending_acceptance = 0`,
      )
      .get(workItemId, provider, sessionId);
    return (row?.c ?? 0) > 0;
  }
}
