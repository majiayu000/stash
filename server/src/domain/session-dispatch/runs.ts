import type { Database } from 'bun:sqlite';
import type { AgentProvider, Clock, DispatchRun, DispatchRunStatus } from '@stash/shared';
import { systemClock, ulid } from '@stash/shared';

interface DispatchRunRow {
  id: string;
  work_item_id: string;
  provider: AgentProvider;
  cwd: string;
  prompt_file: string;
  prompt_hash: string;
  spawn_command: string;
  pid: number | null;
  status: DispatchRunStatus;
  error: string | null;
  matched_session_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface CreateDispatchRunInput {
  workItemId: string;
  provider: AgentProvider;
  cwd: string;
  promptFile: string;
  promptHash: string;
  spawnCommand: string;
}

export class DispatchRunNotFoundError extends Error {
  constructor(id: string) {
    super(`dispatch run ${id} not found`);
    this.name = 'DispatchRunNotFoundError';
  }
}

export class DispatchRunService {
  private readonly clock: Clock;

  constructor(private readonly deps: { db: Database; clock?: Clock }) {
    this.clock = deps.clock ?? systemClock;
  }

  create(input: CreateDispatchRunInput): DispatchRun {
    const now = this.clock.nowIso();
    const run: DispatchRun = {
      id: ulid(this.clock.now()),
      ...input,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.deps.db.prepare(
      `insert into dispatch_runs(
        id, work_item_id, provider, cwd, prompt_file, prompt_hash, spawn_command,
        pid, status, error, matched_session_id, created_at, updated_at, closed_at
      ) values (?, ?, ?, ?, ?, ?, ?, null, ?, null, null, ?, ?, null)`,
    ).run(
      run.id,
      run.workItemId,
      run.provider,
      run.cwd,
      run.promptFile,
      run.promptHash,
      run.spawnCommand,
      run.status,
      run.createdAt,
      run.updatedAt,
    );
    return run;
  }

  recordSpawnResult(id: string, result: { pid?: number; error?: string }): DispatchRun {
    const status: DispatchRunStatus = result.pid !== undefined ? 'spawned' : 'failed';
    const updatedAt = this.clock.nowIso();
    const updated = this.deps.db.prepare(
      `update dispatch_runs
       set pid = ?, status = ?, error = ?, updated_at = ?
       where id = ?`,
    ).run(result.pid ?? null, status, result.error ?? null, updatedAt, id);
    if (updated.changes === 0) throw new DispatchRunNotFoundError(id);
    return this.getRequired(id);
  }

  markMatched(id: string, sessionId: string): DispatchRun {
    const updatedAt = this.clock.nowIso();
    const updated = this.deps.db.prepare(
      `update dispatch_runs
       set status = 'matched', matched_session_id = ?, error = null, updated_at = ?
       where id = ?`,
    ).run(sessionId, updatedAt, id);
    if (updated.changes === 0) throw new DispatchRunNotFoundError(id);
    return this.getRequired(id);
  }

  close(id: string): DispatchRun {
    const now = this.clock.nowIso();
    const updated = this.deps.db.prepare(
      `update dispatch_runs
       set status = 'closed', closed_at = ?, updated_at = ?
       where id = ?`,
    ).run(now, now, id);
    if (updated.changes === 0) throw new DispatchRunNotFoundError(id);
    return this.getRequired(id);
  }

  list(filter: { workItemId?: string } = {}): DispatchRun[] {
    const rows = filter.workItemId
      ? this.deps.db.query<DispatchRunRow, [string]>(
        'select * from dispatch_runs where work_item_id = ? order by created_at desc',
      ).all(filter.workItemId)
      : this.deps.db.query<DispatchRunRow, []>(
        'select * from dispatch_runs order by created_at desc limit 100',
      ).all();
    return rows.map(mapRun);
  }

  get(id: string): DispatchRun | undefined {
    const row = this.deps.db.query<DispatchRunRow, [string]>(
      'select * from dispatch_runs where id = ?',
    ).get(id);
    return row ? mapRun(row) : undefined;
  }

  private getRequired(id: string): DispatchRun {
    const run = this.get(id);
    if (!run) throw new DispatchRunNotFoundError(id);
    return run;
  }
}

function mapRun(row: DispatchRunRow): DispatchRun {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    provider: row.provider,
    cwd: row.cwd,
    promptFile: row.prompt_file,
    promptHash: row.prompt_hash,
    spawnCommand: row.spawn_command,
    pid: row.pid ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    matchedSessionId: row.matched_session_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at ?? undefined,
  };
}
