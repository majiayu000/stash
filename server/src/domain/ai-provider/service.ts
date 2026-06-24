import { createHash } from 'crypto';
import { z } from 'zod';
import type {
  AiGenerationRun,
  DecisionDraft,
  Priority,
  SourceSpan,
  WorkItem,
} from '@stash/shared';
import type { Config } from '../../config.js';
import type { AiDraftService } from '../ai-draft/service.js';
import { WorkItemNotFoundError, type WorkItemService } from '../work-item/service.js';
import {
  buildCoachSummaryPrompt,
  buildIdeaDecompositionPrompt,
  buildTaskCoachPrompt,
} from './prompts.js';

export class AiProviderUnavailableError extends Error {
  constructor(message = 'AI provider is unavailable') {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

export class AiProviderTimeoutError extends Error {
  constructor(message = 'AI provider timed out') {
    super(message);
    this.name = 'AiProviderTimeoutError';
  }
}

export class AiProviderInvalidOutputError extends Error {
  constructor(message = 'AI provider returned invalid output') {
    super(message);
    this.name = 'AiProviderInvalidOutputError';
  }
}

export interface JsonCompletionRequest {
  prompt: string;
  model: string;
  timeoutMs: number;
}

export interface JsonCompletionResult {
  text: string;
  raw: string;
}

export interface AiJsonClient {
  completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult>;
}

const SourceSpanOutput = z.object({
  label: z.string().optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  text: z.string().trim().min(1),
});

const ChecklistOutput = z.object({
  text: z.string().trim().min(1),
  completed: z.boolean().optional(),
});

const DraftOutput = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  labels: z.array(z.string()).optional(),
  checklist: z.array(ChecklistOutput).optional(),
  sourceSpans: z.array(SourceSpanOutput).optional(),
});

const IdeaDecompositionOutput = z.object({
  drafts: z.array(DraftOutput).min(1),
});

const CoachReplyOutput = z.object({
  reply: z.string().trim().min(1),
  suggestedActions: z.array(z.string()).optional(),
});

const CoachSummaryOutput = z.object({
  summary: z.string().trim().min(1),
  destination: z.enum(['journal', 'description']),
  sourceSpans: z.array(SourceSpanOutput).optional(),
});

const ChatCompletionResponse = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable(),
    }),
  })).min(1),
});

export interface IdeaDecompositionResult {
  run: AiGenerationRun;
  drafts: DecisionDraft[];
}

export interface CoachReplyResult {
  run: AiGenerationRun;
  reply: string;
  suggestedActions: string[];
}

export interface CoachSummaryResult {
  run: AiGenerationRun;
  summary: string;
  destination: 'journal' | 'description';
  sourceSpans: SourceSpan[];
}

export interface AiProviderServiceDeps {
  config: Config['aiProvider'];
  workItems: WorkItemService;
  drafts: AiDraftService;
  client?: AiJsonClient;
}

export class OpenAiCompatibleJsonClient implements AiJsonClient {
  constructor(private readonly config: Config['aiProvider'], private readonly fetchImpl: typeof fetch = fetch) {}

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    if (this.config.mode !== 'openai_compatible') {
      throw new AiProviderUnavailableError('AI provider is disabled');
    }
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new AiProviderUnavailableError('AI provider base URL or API key is missing');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.fetchImpl(this.config.baseUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: request.prompt }],
        }),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new AiProviderUnavailableError(`AI provider returned ${response.status}`);
      }
      const parsed = parseJson(raw, ChatCompletionResponse);
      const text = parsed.choices[0]?.message.content;
      if (!text) throw new AiProviderInvalidOutputError('AI provider response was empty');
      return { text, raw };
    } catch (err) {
      if (err instanceof AiProviderUnavailableError || err instanceof AiProviderInvalidOutputError) {
        throw err;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AiProviderTimeoutError();
      }
      throw new AiProviderUnavailableError(err instanceof Error ? err.message : 'AI provider request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class AiProviderService {
  private readonly client: AiJsonClient;

  constructor(private readonly deps: AiProviderServiceDeps) {
    this.client = deps.client ?? new OpenAiCompatibleJsonClient(deps.config);
  }

  async decomposeIdea(input: { ideaId: string; projectContext?: string }): Promise<IdeaDecompositionResult> {
    const idea = this.getRequiredWorkItem(input.ideaId);
    if (idea.kind !== 'idea') {
      throw new AiProviderInvalidOutputError('idea decomposition requires an idea work item');
    }
    if (idea.status === 'done' || idea.status === 'dropped') {
      throw new AiProviderInvalidOutputError('terminal ideas cannot be decomposed');
    }

    const prompt = buildIdeaDecompositionPrompt({ idea, projectContext: input.projectContext });
    const run = this.createPendingRun({
      feature: 'idea_decomposition',
      sourceKind: 'idea_decomposition',
      sourceWorkItemId: idea.id,
      prompt,
    });

    try {
      const completion = await this.complete(prompt);
      const parsed = parseProviderJson(completion.text, IdeaDecompositionOutput);
      const succeeded = this.deps.drafts.recordRunSuccess(run.id, completion.raw);
      const drafts = this.deps.drafts.createDrafts(succeeded.id, parsed.drafts.map((draft, index) => ({
        sourceKind: 'idea_decomposition',
        proposedTitle: draft.title,
        proposedDescription: draft.description,
        proposedPriority: draft.priority as Priority | undefined,
        proposedLabels: draft.labels ?? [],
        proposedChecklist: draft.checklist?.map((item, itemIndex) => ({
          id: `ai-check-${index + 1}-${itemIndex + 1}`,
          text: item.text,
          completed: item.completed ?? false,
        })),
        sourceSpans: draft.sourceSpans ?? [{ text: idea.title }],
        sortOrder: index + 1,
      })));
      return { run: succeeded, drafts };
    } catch (err) {
      this.recordFailedRun(run.id, err);
      throw err;
    }
  }

  async coachTask(input: { workItemId: string; question: string; recentJournal?: string[] }): Promise<CoachReplyResult> {
    const task = this.getRequiredWorkItem(input.workItemId);
    const prompt = buildTaskCoachPrompt({ task, question: input.question, recentJournal: input.recentJournal });
    const run = this.createPendingRun({
      feature: 'task_coach',
      sourceKind: 'task_coach',
      sourceWorkItemId: task.id,
      prompt,
    });

    try {
      const completion = await this.complete(prompt);
      const parsed = parseProviderJson(completion.text, CoachReplyOutput);
      const succeeded = this.deps.drafts.recordRunSuccess(run.id, completion.raw);
      return { run: succeeded, reply: parsed.reply, suggestedActions: parsed.suggestedActions ?? [] };
    } catch (err) {
      this.recordFailedRun(run.id, err);
      throw err;
    }
  }

  async summarizeTask(input: {
    workItemId: string;
    messages: string[];
    destination: 'journal' | 'description';
  }): Promise<CoachSummaryResult> {
    const task = this.getRequiredWorkItem(input.workItemId);
    const prompt = buildCoachSummaryPrompt({ task, messages: input.messages, destination: input.destination });
    const run = this.createPendingRun({
      feature: 'coach_summary',
      sourceKind: 'coach_summary',
      sourceWorkItemId: task.id,
      prompt,
    });

    try {
      const completion = await this.complete(prompt);
      const parsed = parseProviderJson(completion.text, CoachSummaryOutput);
      const succeeded = this.deps.drafts.recordRunSuccess(run.id, completion.raw);
      return {
        run: succeeded,
        summary: parsed.summary,
        destination: parsed.destination,
        sourceSpans: parsed.sourceSpans ?? input.messages.map((text) => ({ text })),
      };
    } catch (err) {
      this.recordFailedRun(run.id, err);
      throw err;
    }
  }

  private getRequiredWorkItem(id: string): WorkItem {
    const item = this.deps.workItems.get(id);
    if (!item) throw new WorkItemNotFoundError(id);
    return item;
  }

  private async complete(prompt: string): Promise<JsonCompletionResult> {
    const model = this.deps.config.model;
    if (this.deps.config.mode === 'disabled') {
      throw new AiProviderUnavailableError('AI provider is disabled');
    }
    if (!model) {
      throw new AiProviderUnavailableError('AI provider model is missing');
    }
    return this.client.completeJson({ prompt, model, timeoutMs: this.deps.config.timeoutMs });
  }

  private createPendingRun(input: {
    feature: 'idea_decomposition' | 'task_coach' | 'coach_summary';
    sourceKind: 'idea_decomposition' | 'task_coach' | 'coach_summary';
    sourceWorkItemId: string;
    prompt: string;
  }): AiGenerationRun {
    return this.deps.drafts.createRun({
      feature: input.feature,
      sourceKind: input.sourceKind,
      sourceWorkItemId: input.sourceWorkItemId,
      provider: this.deps.config.mode,
      model: this.deps.config.model,
      promptHash: createHash('sha256').update(input.prompt).digest('hex'),
    });
  }

  private recordFailedRun(runId: string, err: unknown): void {
    const message = err instanceof Error ? err.message : 'AI provider failed';
    this.deps.drafts.recordRunFailure(runId, message);
  }
}

function parseJson<T>(raw: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    throw new AiProviderInvalidOutputError(err instanceof Error ? err.message : 'invalid JSON');
  }
}

function parseProviderJson<T>(raw: string, schema: z.ZodType<T>): T {
  return parseJson(raw, schema);
}
