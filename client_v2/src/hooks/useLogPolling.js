import { useEffect, useRef } from 'react';

// One timer per mounted log view. A slow request never starts another tick.
export default function useLogPolling(fetchData, enabled, intervalSeconds, loading) {
  const pending = useRef(false);
  useEffect(() => {
    if (!enabled || intervalSeconds <= 0) return undefined;
    let active = true;
    const timer = setInterval(async () => {
      if (!active || pending.current || loading) return;
      pending.current = true;
      try { await fetchData({ background: true }); }
      finally { pending.current = false; }
    }, intervalSeconds * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [fetchData, enabled, intervalSeconds, loading]);
}
