import { useCallback, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { fragmentsOf, resolveFramePosition } from './framePosition';

/**
 * Keeps track of which HLS fragment is on screen, and resolves `(seq, offset)`
 * on demand.
 *
 * `useHlsPlayer` already returns its `Hls` instance ref, so nothing in the
 * shared player hook needs changing — this attaches alongside it.
 *
 * **The non-obvious problem this solves.** `useHlsPlayer.startPlayer()` runs
 * `cleanup()` and then `new Hls(...)` on every 404, fatal network error, or
 * 15-second stall check. So `hlsRef.current` is not a stable object: a listener
 * attached once is silently orphaned the first time the stream hiccups, and
 * `lastFrag` would then freeze at whatever was playing before the reconnect —
 * which is the worst kind of bug here, because a stale `seq` does not throw. It
 * tracks the wrong moment in time.
 *
 * So the instance is re-checked on a slow interval and the listener re-attached
 * whenever it has been swapped. 1 Hz against a reconnect path that already takes
 * two seconds, and the callback is a single assignment.
 */
const INSTANCE_POLL_MS = 1000;

export default function useFragTracker(hlsRef, videoRef) {
  const lastFrag = useRef(null);
  /** The instance our listener is currently bound to, so swaps are detectable. */
  const boundTo = useRef(null);

  useEffect(() => {
    const onFragChanged = (_event, data) => {
      if (data?.frag) lastFrag.current = data.frag;
    };

    const bind = () => {
      const hls = hlsRef?.current ?? null;
      if (hls === boundTo.current) return;

      if (boundTo.current) {
        // `off` on a destroyed instance is harmless, but the instance may have
        // been torn down mid-call, so this stays defensive.
        try { boundTo.current.off(Hls.Events.FRAG_CHANGED, onFragChanged); } catch { /* noop */ }
      }
      boundTo.current = hls;
      // A fragment from the previous instance describes a timeline that no
      // longer exists. Dropping it forces the playlist fallback until the new
      // instance reports a real fragment, which is correct rather than merely
      // safe.
      lastFrag.current = null;
      if (hls) {
        try { hls.on(Hls.Events.FRAG_CHANGED, onFragChanged); } catch { /* noop */ }
      }
    };

    bind();
    const timer = setInterval(bind, INSTANCE_POLL_MS);
    return () => {
      clearInterval(timer);
      if (boundTo.current) {
        try { boundTo.current.off(Hls.Events.FRAG_CHANGED, onFragChanged); } catch { /* noop */ }
      }
      boundTo.current = null;
      lastFrag.current = null;
    };
  }, [hlsRef]);

  /**
   * `(seq, offset)` for the frame on screen now, or `null` if it cannot be
   * determined — in which case the caller must refuse the click locally rather
   * than send a guess.
   *
   * Resolved at call time, never cached: `video.currentTime` advances 25 times a
   * second, so anything older than this instant is already wrong.
   */
  const resolve = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return null;
    return resolveFramePosition({
      lastFrag: lastFrag.current,
      fragments: fragmentsOf(hlsRef?.current),
      currentTime: video.currentTime,
    });
  }, [hlsRef, videoRef]);

  return resolve;
}
