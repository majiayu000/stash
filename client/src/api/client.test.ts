import { afterEach, describe, expect, test, vi } from 'vitest';
import { apiGet, DEFAULT_REQUEST_TIMEOUT_MS } from './client';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(response: Response): void {
  vi.stubGlobal('fetch', vi.fn(async () => response));
}

describe('api client errors', () => {
  test('preserves structured API error status, code, and details', async () => {
    mockFetch(new Response(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'missing item', details: { id: '1' } } }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    ));

    await expect(apiGet('/work-items/1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'missing item',
      details: { id: '1' },
    });
  });

  test('turns non-JSON error responses into typed ApiError', async () => {
    mockFetch(new Response('upstream unavailable', { status: 502, statusText: 'Bad Gateway' }));

    await expect(apiGet('/overview')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'HTTP_ERROR',
      message: 'upstream unavailable',
      body: 'upstream unavailable',
    });
  });

  test('turns successful non-JSON responses into INVALID_JSON', async () => {
    mockFetch(new Response('<html>not json</html>', { status: 200 }));

    await expect(apiGet('/overview')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      code: 'INVALID_JSON',
      body: '<html>not json</html>',
    });
  });

  test('wraps network failures without leaking raw fetch errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('failed to fetch');
    }));

    await expect(apiGet('/overview')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'failed to fetch',
    });
  });

  test('classifies timeout separately from network failures', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      })));

    const request = apiGet('/overview');
    const assertion = expect(request).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'REQUEST_TIMEOUT',
      details: { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS },
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS);

    await assertion;
  });

  test('classifies caller cancellation separately from timeout', async () => {
    const caller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      })));

    const request = apiGet('/overview', undefined, {
      signal: caller.signal,
      timeoutMs: 1_000,
    });
    caller.abort();

    await expect(request).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'REQUEST_ABORTED',
    });
  });
});
