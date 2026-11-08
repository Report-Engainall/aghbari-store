import { useCallback, useEffect, useRef, useState } from 'react';

type Fetcher<T> = () => Promise<T>;

export function useFetch<T>(fetcher: Fetcher<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const refetch = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (generation === requestGeneration.current) setData(result);
    } catch (err) {
      if (generation === requestGeneration.current) {
        setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
      }
    } finally {
      // An older request must never clear the loading state of a newer request.
      if (generation === requestGeneration.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void refetch();
    return () => {
      // Invalidate pending work when dependencies change or the hook unmounts.
      requestGeneration.current += 1;
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}
