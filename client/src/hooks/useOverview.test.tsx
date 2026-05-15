import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOverview } from './useOverview';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(payload: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: ok ? 200 : 500,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

describe('useOverview', () => {
  test('returns the parsed overview payload', async () => {
    const payload = {
      data: {
        date: '2026-05-14',
        counts: {
          inbox: 3,
          today: 2,
          planned: 4,
          waiting: 1,
          blocked: 0,
          someday: 5,
          activeProjects: 2,
        },
        today: [],
        waiting: [],
        needsAttention: [],
      },
    };
    mockFetch(payload);

    const { result } = renderHook(() => useOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.counts.inbox).toBe(3);
    expect(result.current.error).toBeUndefined();
  });

  test('surfaces server errors', async () => {
    mockFetch({ error: { code: 'INTERNAL', message: 'boom' } }, false);
    const { result } = renderHook(() => useOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toMatch(/boom/);
  });
});
