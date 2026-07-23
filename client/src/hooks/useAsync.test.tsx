import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useAsync } from './useAsync';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('useAsync request generations', () => {
  test('an older success cannot overwrite a newer success', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fn = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    act(() => result.current.reload());
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));

    await act(async () => second.resolve('new'));
    await waitFor(() => expect(result.current.data).toBe('new'));
    await act(async () => first.resolve('old'));

    expect(result.current.data).toBe('new');
    expect(result.current.error).toBeUndefined();
  });

  test('an older error cannot overwrite a newer success', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fn = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    act(() => result.current.reload());
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    await act(async () => first.reject(new Error('stale failure')));
    expect(result.current.error).toBeUndefined();
    await act(async () => second.resolve('latest'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBe('latest');
    expect(result.current.error).toBeUndefined();
  });

  test('does not write state after unmount', async () => {
    const request = deferred<string>();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useAsync(() => request.promise));

    unmount();
    await act(async () => request.resolve('late'));

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
