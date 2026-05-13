import { useEffect, useRef } from "react";
import Hls from "hls.js";
import getAccessToken from "@/utils/getAccessToken";

export default function useHlsPlayer(
  videoRef,
  url,
  { autoPlay = true, enabled = true, onError } = {}
) {
  const hlsRef = useRef(null);
  const lastUrlRef = useRef("");
  const hasPlayedRef = useRef(false);
  const retryTimerRef = useRef(null);
  const liveSyncIntervalRef = useRef(null);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    /* ---------------- CLEANUP ---------------- */
    const cleanup = () => {
      hasPlayedRef.current = false;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (liveSyncIntervalRef.current) {
        clearInterval(liveSyncIntervalRef.current);
        liveSyncIntervalRef.current = null;
      }

      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}
    };

    if (!enabled || !url) {
      cleanup();
      isInitializingRef.current = false;
      return;
    }

    if (lastUrlRef.current === url && hlsRef.current) {
      isInitializingRef.current = false;
      return;
    }
    
    // Prevent double initialization during React StrictMode
    if (isInitializingRef.current) {
      return;
    }

    lastUrlRef.current = url;
    isInitializingRef.current = true;

    cleanup();

    /* ---------------- SAFARI NATIVE ---------------- */
    if (!Hls.isSupported()) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        if (autoPlay) video.play().catch(() => {});
      }
      isInitializingRef.current = false;
      return;
    }

    /* ---------------- START PLAYER ---------------- */
    const startPlayer = () => {
      cleanup();
      lastUrlRef.current = "";

      const token = getAccessToken();

      const hls = new Hls({
        lowLatencyMode: true,

        //  MEMORY-SAFE LIVE SETTINGS
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,

        maxBufferLength: 2,
        maxMaxBufferLength: 4,
        backBufferLength: 0, // VERY IMPORTANT

        maxBufferHole: 0.1,

        enableWorker: true,
        capLevelToPlayerSize: true,

        fragLoadingTimeOut: 10000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        fragLoadingRetryDelayMax: 3000,

        loader: class CustomLoader extends Hls.DefaultConfig.loader {
          load(context, config, callbacks) {
            if (!context.url.includes("token=")) {
              context.url += context.url.includes("?")
                ? `&token=${token}`
                : `?token=${token}`;
            }
            super.load(context, config, callbacks);
          }
        },
      });

      hlsRef.current = hls;

      /* ---------------- ATTACH MEDIA ---------------- */
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(url);
      });

      /* ---------------- ERROR HANDLING ---------------- */
      hls.on(Hls.Events.ERROR, (_, data) => {
        const statusCode =
          data?.response?.status ||
          data?.response?.code ||
          data?.networkDetails?.status;

        /*  404 BEFORE PLAYBACK → ERROR + RETRY */
        if (statusCode === 404 && !hasPlayedRef.current) {
          onError?.("Stream not found (404)");

          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              startPlayer(); //  retry
            }, 2000);
          }
          return;
        }

        /*  404 AFTER PLAYBACK → IGNORE */
        if (statusCode === 404 && hasPlayedRef.current) return;

        /* 🛠 MEDIA ERROR → RECOVER */
        if (data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }

        /*  NETWORK ERROR → LIVE RESYNC */
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad(-1);
        }
      });

      /* ---------------- BUFFER STALL FIX ---------------- */
      hls.on(Hls.Events.BUFFER_STALLED_ERROR, () => {
        hls.startLoad(-1);
      });

      /* ---------------- PERIODIC LIVE RESYNC ---------------- */
      liveSyncIntervalRef.current = setInterval(() => {
        if (video.readyState < 3 && hlsRef.current) {
          hlsRef.current.startLoad(-1);
        }
      }, 15000); // every 15s

      /* ---------------- AUTOPLAY ---------------- */
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) video.play().catch(() => {});
      });

      /* ---------------- MARK PLAYBACK ---------------- */
      video.onplaying = () => {
        hasPlayedRef.current = true;

        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }

        lastUrlRef.current = "";
      };
    };

    startPlayer();
    return () => {
      cleanup();
      isInitializingRef.current = false;
    };
  }, [url, enabled, autoPlay]);

  return hlsRef;
}
