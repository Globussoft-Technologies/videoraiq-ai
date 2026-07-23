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
  // Guards against out-of-order responses: if deps change again (e.g. the
  // user keeps typing in a search box) before an in-flight request resolves,
  // a stale response must never overwrite what a newer request already set.
  const requestIdRef = useRef(0);

  // `silent` refetches without flipping `loading` to true — the previous data
  // stays rendered while the new request is in flight, so callers can refresh
  // after a mutation without AsyncBoundary swapping the whole view for a
  // spinner (avoids a full unmount/remount flicker on e.g. a checkbox toggle).
  const run = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mounted.current && requestId === requestIdRef.current) setData(result);
    } catch (err) {
      if (mounted.current && requestId === requestIdRef.current) setError(err);
      // eslint-disable-next-line no-console
      console.error('[useApi]', err?.message || err);
    } finally {
      if (mounted.current && requestId === requestIdRef.current && !silent) setLoading(false);
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
    // `enabled` must be tracked here, not just inside run() — callers like
    // RolesPermission gate on a permission flag that loads asynchronously
    // (undefined -> true after PermissionContext resolves). Without this,
    // the effect fires once while enabled is still false/undefined, does
    // nothing, and never re-fires once enabled flips true on the same
    // mount (deps like [page, search] don't change), so data never loads
    // until something else changes deps — e.g. a hard refresh never fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  const isEmpty =
    !loading &&
    !error &&
    (data == null ||
      (Array.isArray(data) && data.length === 0) ||
      (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0));

  return { data, loading, error, isEmpty, refetch: run, setData };
}
