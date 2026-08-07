import { useCallback, useEffect, useRef, useState } from 'react';
import streamQueue from '../lib/streamQueue';

/**
 * Claims a start slot from the shared {@link streamQueue}.
 *
 * `admitted` stays false while the camera is queued behind others and flips to
 * true when it is this camera's turn to build its player. Call `settle()` once
 * the stream is playing (or has definitively failed) to hand the slot on.
 *
 * Setting `enabled` to false releases the slot immediately — that is how the
 * Live Wall tears everything down when the page goes inactive.
 */
export default function useStreamSlot(id, { priority = 0, enabled = true, immediate = false } = {}) {
  const [admitted, setAdmitted] = useState(false);

  const idRef = useRef(id);
  idRef.current = id;
  const priorityRef = useRef(priority);
  priorityRef.current = priority;

  useEffect(() => {
    if (!enabled || !id) {
      setAdmitted(false);
      return undefined;
    }
    let alive = true;
    setAdmitted(false);
    streamQueue.request(id, priorityRef.current, () => { if (alive) setAdmitted(true); }, immediate);
    return () => {
      alive = false;
      streamQueue.release(id);
    };
  }, [id, enabled, immediate]);

  /* Re-rank while still waiting (e.g. the tile scrolled into view). */
  useEffect(() => {
    if (!enabled || !id) return;
    streamQueue.setPriority(id, priority);
  }, [id, enabled, priority]);

  const settle = useCallback(() => { streamQueue.settle(idRef.current); }, []);

  return { admitted, settle };
}

/** Live queue depth — `{ waiting, starting }`. Drives the "loading" read-out. */
export function useStreamQueueStats() {
  const [stats, setStats] = useState(() => streamQueue.getStats());
  useEffect(() => streamQueue.subscribe((next) => {
    setStats((prev) => (
      prev.waiting === next.waiting && prev.starting === next.starting ? prev : next
    ));
  }), []);
  return stats;
}
