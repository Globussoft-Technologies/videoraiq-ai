import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Generic data-fetching hook with loading / error / empty handling and refetch.
 *
 * @param {Function} fetcher  async () => data  (memoize with useCallback at call site)
 * @param {Array}    deps     dependency list that triggers a refetch
 * @param {Object}   opts     { enabled, initialData, pollMs }
 */
export function useApi(fetcher, deps = [], opts = {}) {
  const { enabled = true, initialData = null, pollMs = 0 } = opts;
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mounted.current) setData(result);
    } catch (err) {
      if (mounted.current) setError(err);
      // eslint-disable-next-line no-console
      console.error('[useApi]', err?.message || err);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    run();
    let id;
    if (pollMs > 0) id = setInterval(run, pollMs);
    return () => {
      mounted.current = false;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const isEmpty =
    !loading &&
    !error &&
    (data == null ||
      (Array.isArray(data) && data.length === 0) ||
      (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0));

  return { data, loading, error, isEmpty, refetch: run, setData };
}
