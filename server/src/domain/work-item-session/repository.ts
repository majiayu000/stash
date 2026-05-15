import type { Database } from 'bun:sqlite';
import type { AgentProvider } from '@stash/shared';

export interface LinkedSession {
  workItemId: string;
  provider: AgentProvider;
  sessionId: string;
  linkedAt: string;
}

interface LinkRow {
  work_item_id: string;
  provider: string;
  session_id: string;
  linked_at: string;
}

function rowToLink(row: LinkRow): LinkedSession {
  return {
    workItemId: row.work_item_id,
    provider: row.provider as AgentProvider,
    sessionId: row.session_id,
    linkedAt: row.linked_at,
  };
}

export class WorkItemSessionRepository {
  constructor(private readonly db: Database) {}

  link(link: LinkedSession): LinkedSession {
    this.db
      .prepare(
        `insert into work_item_sessions(work_item_id, provider, session_id, linked_at)
         values (?, ?, ?, ?)
         on conflict(work_item_id, provider, session_id) do update
           set linked_at = excluded.linked_at`,
      )
      .run(link.workItemId, link.provider, link.sessionId, link.linkedAt);
    return link;
  }

  unlink(workItemId: string, provider: AgentProvider, sessionId: string): boolean {
    return (
      this.db
        .prepare(
          `delete from work_item_sessions
            where work_item_id = ? and provider = ? and session_id = ?`,
        )
        .run(workItemId, provider, sessionId).changes > 0
    );
  }

  forWorkItem(workItemId: string): LinkedSession[] {
    return this.db
      .query<LinkRow, [string]>(
        'select * from work_item_sessions where work_item_id = ? order by linked_at desc',
      )
      .all(workItemId)
      .map(rowToLink);
  }

  workItemsForSession(provider: AgentProvider, sessionId: string): string[] {
    return this.db
      .query<{ work_item_id: string }, [string, string]>(
        'select work_item_id from work_item_sessions where provider = ? and session_id = ?',
      )
      .all(provider, sessionId)
      .map((r) => r.work_item_id);
  }
}
