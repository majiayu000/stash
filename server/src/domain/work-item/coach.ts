import type { Database } from 'bun:sqlite';
import {
  systemClock,
  ulid,
  type AiGenerationRun,
  type AiWriteDestination,
  type ChecklistItem,
  type Clock,
  type CoachApplySummaryResponse,
  type CoachAskResponse,
  type CoachMessagePurpose,
  type CoachMessageRole,
  type CoachSummaryResponse,
  type JournalEntry,
  type WorkItem,
  type WorkItemAiWrite,
  type WorkItemCoachMessage,
} from '@stash/shared';
import type { AiDraftService } from '../ai-draft/service.js';
import type { AiProviderService } from '../ai-provider/service.js';
import type { JournalService } from './journal.js';
import { WorkItemNotFoundError, type WorkItemService } from './service.js';

interface CoachMessageRow {
  id: string;
  work_item_id: string;
  run_id: string | null;
  role: CoachMessageRole;
  purpose: CoachMessagePurpose;
  summary_destination: AiWriteDestination | null;
  body: string;
  provider: string | null;
  model: string | null;
  created_at: string;
}

interface AiWriteRow {
  id: string;
  work_item_id: string;
  run_id: string;
  source_message_id: string | null;
  destination: AiWriteDestination;
  body: string;
  created_journal_entry_id: string | null;
  created_at: string;
}

export class WorkItemCoachConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkItemCoachConflictError';
  }
}

export interface WorkItemCoachServiceDeps {
  db: Database;
  workItems: WorkItemService;
  journal: JournalService;
  ai: AiProviderService;
  drafts: AiDraftService;
  clock?: Clock;
}

export class WorkItemCoachService {
  private readonly clock: Clock;

  constructor(private readonly deps: WorkItemCoachServiceDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  listMessages(workItemId: string): WorkItemCoachMessage[] {
    this.getRequiredWorkItem(workItemId);
    return this.deps.db
      .query<CoachMessageRow, [string]>(
        `select * from work_item_coach_messages
         where work_item_id = ?
         order by created_at asc, id asc`,
      )
      .all(workItemId)
      .map(mapMessage);
  }

  async ask(workItemId: string, body: string): Promise<CoachAskResponse> {
    const text = body.trim();
    if (!text) throw new WorkItemCoachConflictError('coach message body cannot be empty');
    this.getRequiredWorkItem(workItemId);

    const userMessage = this.insertMessage({
      workItemId,
      role: 'user',
      purpose: 'chat',
      body: text,
    });
    const recentJournal = this.deps.journal.list(workItemId).slice(0, 5).map((entry) => entry.body);
    const result = await this.deps.ai.coachTask({ workItemId, question: text, recentJournal });
    const assistantMessage = this.insertMessage({
      workItemId,
      runId: result.run.id,
      role: 'assistant',
      purpose: 'chat',
      body: result.reply,
      provider: result.run.provider,
      model: result.run.model,
    });

    return {
      userMessage,
      assistantMessage,
      run: result.run,
      suggestedActions: result.suggestedActions,
    };
  }

  async summarize(
    workItemId: string,
    input: { destination: AiWriteDestination; messageIds?: string[] },
  ): Promise<CoachSummaryResponse> {
    this.getRequiredWorkItem(workItemId);
    const messages = input.messageIds?.length
      ? input.messageIds.map((id) => this.getRequiredMessage(id))
      : this.listMessages(workItemId);
    for (const message of messages) {
      if (message.workItemId !== workItemId) throw new WorkItemCoachConflictError('summary message belongs to another work item');
    }
    if (messages.length === 0) throw new WorkItemCoachConflictError('summary requires at least one coach message');

    const result = await this.deps.ai.summarizeTask({
      workItemId,
      destination: input.destination,
      messages: messages.map((message) => `${message.role}: ${message.body}`),
    });
    const summary = this.insertMessage({
      workItemId,
      runId: result.run.id,
      role: 'assistant',
      purpose: 'summary',
      destination: result.destination,
      body: result.summary,
      provider: result.run.provider,
      model: result.run.model,
    });

    return { message: summary, run: result.run, destination: result.destination };
  }

  applySummary(
    workItemId: string,
    input: { runId: string; sourceMessageId: string; destination: AiWriteDestination },
  ): CoachApplySummaryResponse {
    const source = this.getRequiredMessage(input.sourceMessageId);
    if (source.workItemId !== workItemId) throw new WorkItemCoachConflictError('summary message belongs to another work item');
    if (source.runId !== input.runId) throw new WorkItemCoachConflictError('summary message does not match the run');
    if (source.role !== 'assistant' || source.purpose !== 'summary') {
      throw new WorkItemCoachConflictError('only assistant summary messages can be applied');
    }
    if (!source.destination) {
      throw new WorkItemCoachConflictError('summary destination is missing; regenerate the summary before applying it');
    }
    if (source.destination !== input.destination) {
      throw new WorkItemCoachConflictError(`summary destination is ${source.destination}, not ${input.destination}`);
    }

    const run = this.getRequiredRun(input.runId);
    if (run.feature !== 'coach_summary' || run.sourceKind !== 'coach_summary') {
      throw new WorkItemCoachConflictError('run is not a coach summary run');
    }
    if (run.sourceWorkItemId !== workItemId) throw new WorkItemCoachConflictError('run belongs to another work item');
    if (run.status !== 'succeeded' && run.status !== 'accepted') {
      throw new WorkItemCoachConflictError(`run ${run.id} is not ready to apply`);
    }

    const existing = this.getWriteBySourceMessage(source.id);
    if (existing) return this.responseForExistingWrite(existing);

    let item: WorkItem | undefined;
    let journalEntry: JournalEntry | undefined;
    const write = this.deps.db.transaction(() => {
      if (input.destination === 'description') {
        const current = this.getRequiredWorkItem(workItemId);
        const description = current.description
          ? `${current.description}\n\n${source.body}`
          : source.body;
        item = this.deps.workItems.update(workItemId, { description });
      } else if (input.destination === 'journal') {
        journalEntry = this.deps.journal.append(workItemId, { body: source.body });
      } else {
        const current = this.getRequiredWorkItem(workItemId);
        if (current.kind !== 'system') {
          throw new WorkItemCoachConflictError('checklist summaries can only be applied to system templates');
        }
        const checklist = checklistFromSummary(source.body, this.clock);
        if (checklist.length === 0) {
          throw new WorkItemCoachConflictError('checklist summary did not include any steps');
        }
        item = this.deps.workItems.update(workItemId, { checklist });
      }

      const row: WorkItemAiWrite = {
        id: ulid(this.clock.now()),
        workItemId,
        runId: input.runId,
        sourceMessageId: source.id,
        destination: input.destination,
        body: source.body,
        createdJournalEntryId: journalEntry?.id,
        createdAt: this.clock.nowIso(),
      };
      this.insertWrite(row);
      this.deps.drafts.recordRunAccepted(input.runId);
      return row;
    })();

    return { write, item, journalEntry };
  }

  listWrites(workItemId: string): WorkItemAiWrite[] {
    this.getRequiredWorkItem(workItemId);
    return this.deps.db
      .query<AiWriteRow, [string]>(
        `select * from work_item_ai_writes
         where work_item_id = ?
         order by created_at desc, id desc`,
      )
      .all(workItemId)
      .map(mapWrite);
  }

  private insertMessage(input: {
    workItemId: string;
    runId?: string;
    role: CoachMessageRole;
    purpose: CoachMessagePurpose;
    destination?: AiWriteDestination;
    body: string;
    provider?: string;
    model?: string;
  }): WorkItemCoachMessage {
    const message: WorkItemCoachMessage = {
      id: ulid(this.clock.now()),
      workItemId: input.workItemId,
      runId: input.runId,
      role: input.role,
      purpose: input.purpose,
      destination: input.destination,
      body: input.body,
      provider: input.provider,
      model: input.model,
      createdAt: this.clock.nowIso(),
    };
    this.deps.db.prepare(
      `insert into work_item_coach_messages(
        id, work_item_id, run_id, role, purpose, summary_destination, body, provider, model, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      message.id,
      message.workItemId,
      message.runId ?? null,
      message.role,
      message.purpose,
      message.destination ?? null,
      message.body,
      message.provider ?? null,
      message.model ?? null,
      message.createdAt,
    );
    return message;
  }

  private insertWrite(write: WorkItemAiWrite): void {
    this.deps.db.prepare(
      `insert into work_item_ai_writes(
        id, work_item_id, run_id, source_message_id, destination, body, created_journal_entry_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      write.id,
      write.workItemId,
      write.runId,
      write.sourceMessageId ?? null,
      write.destination,
      write.body,
      write.createdJournalEntryId ?? null,
      write.createdAt,
    );
  }

  private getRequiredWorkItem(id: string): WorkItem {
    const item = this.deps.workItems.get(id);
    if (!item) throw new WorkItemNotFoundError(id);
    return item;
  }

  private getRequiredMessage(id: string): WorkItemCoachMessage {
    const row = this.deps.db.query<CoachMessageRow, [string]>(
      'select * from work_item_coach_messages where id = ?',
    ).get(id);
    if (!row) throw new WorkItemCoachConflictError(`coach message ${id} was not found`);
    return mapMessage(row);
  }

  private getWriteBySourceMessage(sourceMessageId: string): WorkItemAiWrite | undefined {
    const row = this.deps.db.query<AiWriteRow, [string]>(
      'select * from work_item_ai_writes where source_message_id = ?',
    ).get(sourceMessageId);
    return row ? mapWrite(row) : undefined;
  }

  private getRequiredRun(id: string): AiGenerationRun {
    const run = this.deps.drafts.getRun(id);
    if (!run) throw new WorkItemCoachConflictError(`ai generation run ${id} was not found`);
    return run;
  }

  private responseForExistingWrite(write: WorkItemAiWrite): CoachApplySummaryResponse {
    return {
      write,
      item: write.destination === 'description' || write.destination === 'checklist'
        ? (this.deps.workItems.get(write.workItemId) ?? undefined)
        : undefined,
      journalEntry: write.createdJournalEntryId ? this.deps.journal.list(write.workItemId).find((entry) => entry.id === write.createdJournalEntryId) : undefined,
    };
  }
}

function checklistFromSummary(body: string, clock: Clock): ChecklistItem[] {
  return body
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').replace(/^\[[ xX]\]\s+/, ''))
    .filter((line) => line.length > 0)
    .map((text) => ({ id: ulid(clock.now()), text, completed: false }));
}

function mapMessage(row: CoachMessageRow): WorkItemCoachMessage {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    runId: row.run_id ?? undefined,
    role: row.role,
    purpose: row.purpose,
    destination: row.summary_destination ?? undefined,
    body: row.body,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    createdAt: row.created_at,
  };
}

function mapWrite(row: AiWriteRow): WorkItemAiWrite {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    runId: row.run_id,
    sourceMessageId: row.source_message_id ?? undefined,
    destination: row.destination,
    body: row.body,
    createdJournalEntryId: row.created_journal_entry_id ?? undefined,
    createdAt: row.created_at,
  };
}
