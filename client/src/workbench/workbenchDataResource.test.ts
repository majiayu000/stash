import { describe, expect, test, vi } from 'vitest';
import { SharedRefreshResource } from './workbenchDataResource';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('SharedRefreshResource', () => {
  test('reuses a fresh snapshot and revalidates a stale snapshot', async () => {
    let now = 100;
    const fetcher = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const resource = new SharedRefreshResource(fetcher, {
      freshnessMs: 30,
      now: () => now,
    });

    await resource.revalidate();
    expect(resource.getSnapshot().data).toBe('first');
    await resource.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);

    now = 131;
    await resource.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resource.getSnapshot().data).toBe('second');
  });

  test('shares in-flight requests and coalesces one follow-up per request boundary', async () => {
    const primary = deferred<string>();
    const trailing = deferred<string>();
    const postTrailing = deferred<string>();
    const fetcher = vi.fn()
      .mockReturnValueOnce(primary.promise)
      .mockReturnValueOnce(trailing.promise)
      .mockReturnValueOnce(postTrailing.promise);
    const resource = new SharedRefreshResource(fetcher, { freshnessMs: 30 });

    const cycle = resource.revalidate();
    const shared = resource.revalidate();
    const forcedOne = resource.refresh();
    const forcedTwo = resource.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(shared).toBe(cycle);
    expect(forcedOne).toBe(cycle);
    expect(forcedTwo).toBe(cycle);

    primary.resolve('primary');
    await Promise.resolve();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    void resource.refresh();
    void resource.refresh();
    trailing.resolve('trailing');
    await Promise.resolve();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(3);
    postTrailing.resolve('post-trailing');
    await cycle;

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(resource.getSnapshot().data).toBe('post-trailing');
  });

  test('retains the successful snapshot when a refresh fails', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('cached')
      .mockRejectedValueOnce(new Error('refresh failed'));
    const resource = new SharedRefreshResource(fetcher, { freshnessMs: 30 });

    await resource.revalidate();
    await resource.refresh();

    expect(resource.getSnapshot()).toMatchObject({
      data: 'cached',
      loading: false,
      error: new Error('refresh failed'),
    });
  });

  test('invalidates a cached snapshot without eagerly fetching', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('cached')
      .mockResolvedValueOnce('refreshed');
    const resource = new SharedRefreshResource(fetcher, { freshnessMs: 30_000 });

    await resource.revalidate();
    resource.invalidate();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(resource.getSnapshot()).toMatchObject({
      data: 'cached',
      updatedAt: undefined,
    });

    await resource.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resource.getSnapshot().data).toBe('refreshed');
  });

  test('keeps an in-flight result stale when invalidated after its request starts', async () => {
    const request = deferred<string>();
    const fetcher = vi.fn().mockReturnValue(request.promise);
    const resource = new SharedRefreshResource(fetcher, { freshnessMs: 30_000 });

    const cycle = resource.revalidate();
    resource.invalidate();
    request.resolve('possibly stale');
    await cycle;

    expect(resource.getSnapshot()).toMatchObject({
      data: 'possibly stale',
      updatedAt: undefined,
    });
  });
});
