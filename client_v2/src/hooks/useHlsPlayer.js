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
  { autoPlay = true, enabled = true, startDelayMs = 0, onError, onStarted, onBuffering } = {}
) {
  const hlsRef = useRef(null);
  const retryTimerRef = useRef(null);
  const liveSyncIntervalRef = useRef(null);
  const startDelayTimerRef = useRef(null);

  const onErrorRef = useRef(onError);
  const onStartedRef = useRef(onStarted);
  const onBufferingRef = useRef(onBuffering);
  useEffect(() => { onBufferingRef.current = onBuffering; }, [onBuffering]);
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
    let retryCount = 0;
    let progressTime = video.currentTime;
    const handlePlaying = () => {
      retryCount = 0;
      onBufferingRef.current?.(false);
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
    const handleProgress = () => {
      if (video.currentTime === progressTime) return;
      progressTime = video.currentTime;
      handlePlaying();
    };
    const handleWaiting = () => onBufferingRef.current?.(true);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleProgress);
    video.addEventListener('waiting', handleWaiting);
    const dispose = () => {
      disposed = true;
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleProgress);
      video.removeEventListener('waiting', handleWaiting);
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

      const retryConnection = () => {
        onBufferingRef.current?.(true);
        if (retryTimerRef.current) return;
        const delay = Math.min(2000 * 2 ** Math.min(retryCount++, 4), 30000);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (disposed || hlsRef.current !== hls) return;
          // Reuse the attached player so the last decoded frame stays visible.
          // loadSource can detach MediaSource even for the same URL. Only use
          // it if the initial manifest never loaded; established feeds resume
          // their existing controllers and preserve the held frame.
          if (!hls.levels.length) hls.loadSource(url);
          hls.startLoad(-1);
        }, delay);
      };

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (disposed || hlsRef.current !== hls) return;
        // Nonfatal fragment failures belong to hls.js's own retry/recovery.
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          retryConnection();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { onBufferingRef.current?.(true); hls.recoverMediaError(); return; }
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
          retryConnection();
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
