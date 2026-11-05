import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { ensureAccessToken } from "@/utils/refreshAuth";

/**
 * HLS player hook — ported from the V1 app (client/src/hooks/useHlsPlayer.js).
 * Low-latency live config, token appended to every fragment request, automatic
 * recovery on media/network/404 errors. Returns the Hls instance ref.
 */
export default function useHlsPlayer(
  videoRef,
  url,
  { autoPlay = true, enabled = true, startDelayMs = 0, onError, onStarted, onBeforeReconnect } = {}
) {
  const hlsRef = useRef(null);
  const retryTimerRef = useRef(null);
  const liveSyncIntervalRef = useRef(null);
  const startDelayTimerRef = useRef(null);

  const onErrorRef = useRef(onError);
  const onStartedRef = useRef(onStarted);
  const onBeforeReconnectRef = useRef(onBeforeReconnect);
  onBeforeReconnectRef.current = onBeforeReconnect;
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
      let renewalTimer;
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        let lastToken;
        const updateNativeSource = async () => {
          try {
            const token = await ensureAccessToken();
            if (disposed || token === lastToken) return;
            lastToken = token;
            const source = new URL(url, window.location.href);
            if (token) source.searchParams.set('token', token);
            video.src = source.toString();
            if (autoPlay) video.play().catch(() => {});
          } catch { onErrorRef.current?.('Unable to renew stream access'); }
        };
        updateNativeSource();
        renewalTimer = setInterval(updateNativeSource, 30000);
      }
      return () => { clearInterval(renewalTimer); dispose(); };
    }

    const startPlayer = () => {
      if (disposed) return;
      // Preserve the displayed frame before destroying MSE clears the video.
      if (hlsRef.current) onBeforeReconnectRef.current?.();
      cleanup();

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
            // A live player may outlast many JWTs. Resolve the token per
            // fragment rather than retaining the one from player startup.
            ensureAccessToken().then(token => {
              if (disposed || hlsRef.current !== hls) return;
              const source = new URL(context.url, window.location.href);
              if (token) source.searchParams.set('token', token);
              context.url = source.toString();
              super.load(context, config, callbacks);
            }).catch(() => {
              if (!disposed) callbacks.onError({ code: 401, text: 'Unable to renew stream access' }, context, null);
            });
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
