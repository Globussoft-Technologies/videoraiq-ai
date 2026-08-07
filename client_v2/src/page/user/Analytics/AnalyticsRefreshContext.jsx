import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

/**
 * Lets the Analytics page refresh every widget at once without owning any of
 * their data.
 *
 * Each card registers its own `refetch`; the page calls them all on a tick or
 * on a manual click. The alternative — remounting the widget tree on a counter
 * — would also reset local UI state on every tick (the attendance date picker,
 * the Total Detections breakdown), which is exactly the kind of thing an
 * unattended auto-refresh must not do.
 *
 * Refetches are silent: `useApi` keeps the previous data on screen instead of
 * flipping to a spinner, so a background refresh doesn't blank the page.
 */
const AnalyticsRefreshContext = createContext(null);

export function AnalyticsRefreshProvider({ children }) {
  const listeners = useRef(new Set());

  const subscribe = useCallback((refetch) => {
    listeners.current.add(refetch);
    return () => listeners.current.delete(refetch);
  }, []);

  // Silent by default — that's the background tick, which must not blank the
  // page. An explicit click passes { silent: false } so the panels show their
  // loading state and the refresh visibly did something.
  const refreshAll = useCallback((opts) => {
    const silent = opts?.silent !== false;
    listeners.current.forEach((refetch) => {
      try {
        refetch({ silent });
      } catch {
        // One card failing to refresh must not stop the rest.
      }
    });
  }, []);

  const value = useMemo(() => ({ subscribe, refreshAll }), [subscribe, refreshAll]);

  return (
    <AnalyticsRefreshContext.Provider value={value}>
      {children}
    </AnalyticsRefreshContext.Provider>
  );
}

/** Page-level: the trigger passed to the auto-refresh control. */
export function useAnalyticsRefreshAll() {
  return useContext(AnalyticsRefreshContext)?.refreshAll;
}

/**
 * Card-level: register this widget's refetch.
 *
 * Safe to call outside the provider (returns a no-op), so the cards stay usable
 * on their own.
 */
export function useAnalyticsRefresh(refetch) {
  const ctx = useContext(AnalyticsRefreshContext);
  const subscribe = ctx?.subscribe;
  // Held in a ref so a card re-render doesn't churn the subscription — useApi
  // returns a new `refetch` identity whenever its `enabled` flag changes.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe((opts) => refetchRef.current?.(opts));
  }, [subscribe]);
}
