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

  test('shares an in-flight request and runs at most one trailing forced refresh', async () => {
    const primary = deferred<string>();
    const trailing = deferred<string>();
    const fetcher = vi.fn()
      .mockReturnValueOnce(primary.promise)
      .mockReturnValueOnce(trailing.promise);
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
    trailing.resolve('trailing');
    await cycle;

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resource.getSnapshot().data).toBe('trailing');
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
});
