import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Tiny async-fetch hook. No retry, no cache eviction — enough for MVP.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const generationRef = useRef(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const generation = ++generationRef.current;
    setLoading(true);
    fn()
      .then((v) => {
        if (generationRef.current === generation) {
          setData(v);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (generationRef.current === generation) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      })
      .finally(() => {
        if (generationRef.current === generation) setLoading(false);
      });

    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload };
}
