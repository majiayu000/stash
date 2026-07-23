export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_BASE = '/api';
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const parsed = parseBody(text);
  const body = parsed.ok ? parsed.body : text;
  if (!res.ok) {
    const err = isApiErrorBody(body) ? body.error : undefined;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? errorMessage(res, body),
      err?.details,
      body,
    );
  }
  if (!parsed.ok) {
    throw new ApiError(
      res.status,
      'INVALID_JSON',
      `expected JSON response from ${res.url || 'API'}`,
      { parseError: parsed.error.message },
      text,
    );
  }
  return body as T;
}

function parseBody(text: string): { ok: true; body: unknown } | { ok: false; error: Error } {
  if (!text) return { ok: true, body: null };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (!body || typeof body !== 'object' || !('error' in body)) return false;
  const err = (body as { error?: unknown }).error;
  return !!err && typeof err === 'object' && 'code' in err && 'message' in err;
}

function errorMessage(res: Response, body: unknown): string {
  if (typeof body === 'string' && body.trim()) return body;
  return res.statusText || `request failed with ${res.status}`;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let abortReason: 'timeout' | 'caller' | undefined;
  const onCallerAbort = () => {
    abortReason = 'caller';
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted) onCallerAbort();
  else options.signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeout = window.setTimeout(() => {
    abortReason = 'timeout';
    controller.abort();
  }, timeoutMs);

  try {
    return await parseResponse<T>(await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    }));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (abortReason === 'timeout') {
      throw new ApiError(
        0,
        'REQUEST_TIMEOUT',
        `request timed out after ${timeoutMs}ms`,
        { timeoutMs },
      );
    }
    if (abortReason === 'caller' || options.signal?.aborted) {
      throw new ApiError(0, 'REQUEST_ABORTED', 'request was aborted by the caller');
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}

export async function apiGet<T>(
  path: string,
  query?: Record<string, string | string[] | undefined>,
  options?: ApiRequestOptions,
): Promise<T> {
  const qs = query
    ? '?' +
      Object.entries(query)
        .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
        .flatMap(([k, v]) => (Array.isArray(v) ? v.map((vv) => [k, vv]) : [[k, v]]))
        .map(([k, v]) => `${encodeURIComponent(k!)}=${encodeURIComponent(v!)}`)
        .join('&')
    : '';
  return request<T>(`${path}${qs}`, undefined, options);
}

export async function apiPost<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, options);
}

export async function apiPatch<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, options);
}

export async function apiPut<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, options);
}

export async function apiDelete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return request<T>(path, { method: 'DELETE' }, options);
}
