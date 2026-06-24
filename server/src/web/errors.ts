import type { Context } from 'hono';
import { z } from 'zod';
import {
  AreaNameConflictError,
  AreaNotFoundError,
} from '../domain/area/service.js';
import {
  InvalidStatusTransitionError,
  ValidationError,
  WorkItemNotFoundError,
} from '../domain/work-item/service.js';
import { NoPendingCandidateError } from '../domain/evidence/service.js';
import { BudgetConflictError, BudgetNotFoundError } from '../domain/budget/service.js';
import { SkillConflictError, SkillNotFoundError } from '../domain/skill/service.js';
import { KnowledgeNotFoundError } from '../domain/project-knowledge/service.js';
import { DecisionCandidateNotFoundError } from '../domain/capture/decision-candidates.js';
import { DispatchRunNotFoundError } from '../domain/session-dispatch/runs.js';
import {
  AiGenerationRunNotFoundError,
  DecisionDraftConflictError,
  DecisionDraftNotFoundError,
} from '../domain/ai-draft/service.js';
import {
  AiProviderInvalidOutputError,
  AiProviderTimeoutError,
  AiProviderUnavailableError,
} from '../domain/ai-provider/service.js';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiError(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, details } };
}

export function mapError(err: unknown): { status: 400 | 404 | 409 | 422 | 500 | 503 | 504; body: ApiError } {
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      body: apiError('VALIDATION', 'request body or query is invalid', err.issues),
    };
  }
  if (err instanceof ValidationError) {
    return { status: 400, body: apiError('VALIDATION', err.message) };
  }
  if (
    err instanceof WorkItemNotFoundError ||
    err instanceof AreaNotFoundError ||
    err instanceof SkillNotFoundError ||
    err instanceof BudgetNotFoundError ||
    err instanceof KnowledgeNotFoundError ||
    err instanceof DispatchRunNotFoundError ||
    err instanceof DecisionCandidateNotFoundError ||
    err instanceof AiGenerationRunNotFoundError ||
    err instanceof DecisionDraftNotFoundError
  ) {
    return { status: 404, body: apiError('NOT_FOUND', err.message) };
  }
  if (
    err instanceof SkillConflictError ||
    err instanceof BudgetConflictError ||
    err instanceof DecisionDraftConflictError
  ) {
    return { status: 409, body: apiError('CONFLICT', err.message) };
  }
  if (err instanceof NoPendingCandidateError) {
    return { status: 422, body: apiError('NO_PENDING_CANDIDATE', err.message) };
  }
  if (err instanceof AiProviderInvalidOutputError) {
    return { status: 422, body: apiError('AI_INVALID_OUTPUT', err.message) };
  }
  if (err instanceof AiProviderUnavailableError) {
    return { status: 503, body: apiError('AI_PROVIDER_UNAVAILABLE', err.message) };
  }
  if (err instanceof AiProviderTimeoutError) {
    return { status: 504, body: apiError('AI_PROVIDER_TIMEOUT', err.message) };
  }
  if (err instanceof AreaNameConflictError) {
    return { status: 409, body: apiError('CONFLICT', err.message) };
  }
  if (err instanceof InvalidStatusTransitionError) {
    return {
      status: 422,
      body: apiError('INVALID_TRANSITION', err.message, { from: err.from, to: err.to }),
    };
  }
  const message = err instanceof Error ? err.message : 'internal server error';
  return { status: 500, body: apiError('INTERNAL', message) };
}

export function handleError(c: Context, err: unknown): Response {
  const { status, body } = mapError(err);
  if (status === 500) {
    process.stderr.write(`[stash] 500: ${err instanceof Error ? err.stack : String(err)}\n`);
  }
  return c.json(body, status);
}
