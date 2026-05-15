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

export function mapError(err: unknown): { status: 400 | 404 | 409 | 422 | 500; body: ApiError } {
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      body: apiError('VALIDATION', 'request body or query is invalid', err.issues),
    };
  }
  if (err instanceof ValidationError) {
    return { status: 400, body: apiError('VALIDATION', err.message) };
  }
  if (err instanceof WorkItemNotFoundError || err instanceof AreaNotFoundError) {
    return { status: 404, body: apiError('NOT_FOUND', err.message) };
  }
  if (err instanceof NoPendingCandidateError) {
    return { status: 422, body: apiError('NO_PENDING_CANDIDATE', err.message) };
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
