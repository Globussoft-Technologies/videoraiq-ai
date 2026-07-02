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
  const lastUrlRef = useRef("");
  const hasPlayedRef = useRef(false);
  const retryTimerRef = useRef(null);
  const liveSyncIntervalRef = useRef(null);
  const isInitializingRef = useRef(false);
  const startDelayTimerRef = useRef(null);

  const onErrorRef = useRef(onError);
  const onStartedRef = useRef(onStarted);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onStartedRef.current = onStarted; }, [onStarted]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const cleanup = () => {
      hasPlayedRef.current = false;
      if (startDelayTimerRef.current) { clearTimeout(startDelayTimerRef.current); startDelayTimerRef.current = null; }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      if (liveSyncIntervalRef.current) { clearInterval(liveSyncIntervalRef.current); liveSyncIntervalRef.current = null; }
      if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* noop */ } hlsRef.current = null; }
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* noop */ }
    };

    if (!enabled || !url) { cleanup(); isInitializingRef.current = false; return; }
    if (lastUrlRef.current === url && hlsRef.current) { isInitializingRef.current = false; return; }
    if (isInitializingRef.current) return;

    lastUrlRef.current = url;
    isInitializingRef.current = true;
    cleanup();

    // Safari native HLS
    if (!Hls.isSupported()) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        if (autoPlay) video.play().catch(() => {});
      }
      isInitializingRef.current = false;
      return;
    }

    const startPlayer = () => {
      cleanup();
      lastUrlRef.current = "";
      const token = getAccessToken();

      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        maxBufferLength: 2,
        maxMaxBufferLength: 4,
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
              context.url += context.url.includes("?") ? `&token=${token}` : `?token=${token}`;
            }
            super.load(context, config, callbacks);
          }
        },
      });

      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url));

      hls.on(Hls.Events.ERROR, (_, data) => {
        const statusCode = data?.response?.status || data?.response?.code || data?.networkDetails?.status;
        if (statusCode === 404 && !hasPlayedRef.current) {
          onErrorRef.current?.("Stream not found (404)");
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; startPlayer(); }, 2000);
          }
          return;
        }
        if (statusCode === 404 && hasPlayedRef.current) return;
        if (data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(-1); }
      });

      hls.on(Hls.Events.BUFFER_STALLED_ERROR, () => hls.startLoad(-1));

      liveSyncIntervalRef.current = setInterval(() => {
        if (video.readyState < 3 && hlsRef.current) hlsRef.current.startLoad(-1);
      }, 15000);

      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (autoPlay) video.play().catch(() => {}); });

      video.onplaying = () => {
        hasPlayedRef.current = true;
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        lastUrlRef.current = "";
      };
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

    return () => { cleanup(); isInitializingRef.current = false; };
  }, [url, enabled, autoPlay, startDelayMs]);

  return hlsRef;
}
