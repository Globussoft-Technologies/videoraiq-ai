import { useEffect, useRef } from "react";
import Hls from "hls.js";
import getAccessToken from "@/utils/getAccessToken";

/**
 * HLS player hook — ported from the V1 app (client/src/hooks/useHlsPlayer.js).
 * Low-latency live config, token appended to every fragment request, automatic
 * recovery on media/network/404 errors. Returns the Hls instance ref.
 */
export default function useHlsPlayer(
  videoRef,
  url,
  { autoPlay = true, enabled = true, startDelayMs = 0, onError, onStarted } = {}
) {
  const hlsRef = useRef(null);
  const retryTimerRef = useRef(null);
  const liveSyncIntervalRef = useRef(null);
  const startDelayTimerRef = useRef(null);

  const onErrorRef = useRef(onError);
  const onStartedRef = useRef(onStarted);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onStartedRef.current = onStarted; }, [onStarted]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const cleanup = () => {
      if (startDelayTimerRef.current) { clearTimeout(startDelayTimerRef.current); startDelayTimerRef.current = null; }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      if (liveSyncIntervalRef.current) { clearInterval(liveSyncIntervalRef.current); liveSyncIntervalRef.current = null; }
      if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* noop */ } hlsRef.current = null; }
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* noop */ }
    };

    if (!enabled || !url) { cleanup(); return; }
    cleanup();

    let disposed = false;
    const handlePlaying = () => {
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
    video.addEventListener('playing', handlePlaying);
    const dispose = () => {
      disposed = true;
      video.removeEventListener('playing', handlePlaying);
      cleanup();
    };

    // Safari native HLS
    if (!Hls.isSupported()) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        if (autoPlay) video.play().catch(() => {});
      }
      return dispose;
    }

    const startPlayer = () => {
      if (disposed) return;
      cleanup();
      const token = getAccessToken();

      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        maxBufferLength: 12,
        maxMaxBufferLength: 24,
        backBufferLength: 0,
        maxBufferHole: 0.1,
        enableWorker: true,
        capLevelToPlayerSize: true,
        fragLoadingTimeOut: 10000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        fragLoadingRetryDelayMax: 3000,
        loader: class CustomLoader extends Hls.DefaultConfig.loader {
          load(context, config, callbacks) {
            if (token && !context.url.includes("token=")) {
              context.url += context.url.includes("?") ? `&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`;
            }
            super.load(context, config, callbacks);
          }
        },
      });

      hlsRef.current = hls;
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url));

      hls.on(Hls.Events.ERROR, (_, data) => {
        const statusCode = data?.response?.status || data?.response?.code || data?.networkDetails?.status;
        if (disposed || hlsRef.current !== hls) return;
        if (statusCode === 404 || (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR)) {
          onErrorRef.current?.(statusCode === 404 ? 'Stream not found (404)' : 'Stream connection interrupted');
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; startPlayer(); }, 2000);
          }
          return;
        }
        if (data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        if (data.fatal) onErrorRef.current?.(data.details || 'Stream playback failed');
      });

      // Buffered data can remain available while a live feed is frozen. Check
      // progress as well as readyState, and reopen the playlist after a stall.
      let lastTime = video.currentTime;
      liveSyncIntervalRef.current = setInterval(() => {
        if (disposed || hlsRef.current !== hls || !autoPlay) return;
        const stalled = video.currentTime === lastTime;
        lastTime = video.currentTime;
        if ((video.readyState < 3 || stalled) && !retryTimerRef.current) {
          onErrorRef.current?.('Live stream stalled; reconnecting');
          retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; startPlayer(); }, 2000);
        }
      }, 15000);

      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (autoPlay) video.play().catch(() => {}); });

      hls.attachMedia(video);
    };

    if (startDelayMs > 0) {
      startDelayTimerRef.current = setTimeout(() => {
        startDelayTimerRef.current = null;
        onStartedRef.current?.();
        startPlayer();
      }, startDelayMs);
    } else {
      onStartedRef.current?.();
      startPlayer();
    }

    return dispose;
  }, [url, enabled, autoPlay, startDelayMs]);

  return hlsRef;
}
