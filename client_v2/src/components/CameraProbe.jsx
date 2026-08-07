import { memo, useCallback, useEffect, useRef, useState } from 'react';
import CameraStream from './CameraStream';

/* Probes exist only to learn a camera's live/offline state — for the Live Wall's
   status filter and the "Cameras Online" tally. They don't need to stream
   forever, so each one connects just long enough to reach a verdict, drops the
   stream, and re-checks on a slow cadence. Combined with the shared scheduler
   (lib/streamQueue) that means at most ONE hidden stream exists at a time,
   instead of one per camera.

   Set RECYCLE_PROBES = false to go back to permanently-connected probes. */
export const RECYCLE_PROBES   = true;
export const PROBE_DWELL_MS   = 2500;    // hold open briefly after the verdict lands
export const PROBE_REFRESH_MS = 120000;  // then re-check that camera ~2 min later

/**
 * Hidden, zero-size camera connection used purely for status detection.
 * Renders nothing visible — callers put it inside a 0×0 clipped container.
 */
const CameraProbe = memo(function CameraProbe({ channel, channelId, setLive, active, priority }) {
  const [connected, setConnected] = useState(true);
  const dwellRef = useRef(null);

  const handleLiveChange = useCallback((live) => setLive(channelId, live), [setLive, channelId]);

  const handleSettled = useCallback(() => {
    if (!RECYCLE_PROBES || dwellRef.current) return;
    dwellRef.current = setTimeout(() => {
      dwellRef.current = null;
      setConnected(false);
    }, PROBE_DWELL_MS);
  }, []);

  /* Re-check on a slow cadence. The scheduler still serialises these, so a large
     inventory refreshes gradually rather than in one burst. */
  useEffect(() => {
    if (connected) return undefined;
    const t = setTimeout(() => setConnected(true), PROBE_REFRESH_MS);
    return () => clearTimeout(t);
  }, [connected]);

  /* Resuming after a pause restarts the probe cycle from the top. */
  useEffect(() => {
    if (!active) return;
    if (dwellRef.current) { clearTimeout(dwellRef.current); dwellRef.current = null; }
    setConnected(true);
  }, [active]);

  useEffect(() => () => { if (dwellRef.current) clearTimeout(dwellRef.current); }, []);

  return (
    <CameraStream
      channel={channel}
      camLabel=""
      minH={0}
      rounded={false}
      showOverlay={false}
      active={active && connected}
      priority={priority}
      onLiveChange={handleLiveChange}
      onSettled={handleSettled}
    />
  );
});

export default CameraProbe;
