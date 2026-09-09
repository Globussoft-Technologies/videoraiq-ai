import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Maximize2, Minimize2, SkipBack, SkipForward, RotateCcw, RotateCw } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import BufferingIndicator from './BufferingIndicator';
import FullscreenZoomSurface from './FullscreenZoomSurface';
import PlaybackTimelineBar, { TIMELINE_ZOOM_LEVELS } from './Playback/PlaybackTimelineBar';
import { createPlaybackTransport } from './Playback/playbackTransport';
import { bufferedForwardTarget, createPlaylistClock, frameRecordingTime, observePlaybackClock, rememberFragmentClock } from './Playback/playbackClock';
import { fetchIncidents } from '../helpers/incidents';
import {
  getPlaybackUrl,
  getPlaybackTimeline,
  normalizeRecordingSegments,
  getPlaybackSessionId,
} from '../helpers/playback';

const DAY_MS = 24 * 60 * 60 * 1000;
const SPEED_LEVELS = [1, 4, 16]; // Decoupled: video playback rate only
const SCRUB_DEBOUNCE_MS = 350;
const SKIP_MS = 30 * 1000;
const MAX_NATIVE_RATE = 4;
const FAST_FORWARD_TICK_MS = 500;
const MANIFEST_RETRY_MS = 1000;
const MANIFEST_RETRY_LIMIT = 20;

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Midnight (local time) for the given date, as a Date. */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Playback timeline — Camera View only. Not shared with Live Wall / LiveWallGrid.
 * Shows the recording for whichever camera/time is selected.
 * Enhanced with 24-hour down to 5-minute time-scale zoom and actual video frame thumbnails.
 */
export default function PlaybackTimeline({ channel, date = new Date(), onPrev, onNext, onExpand, isExpanded }) {
  const themeContext = useTheme();
  const isDark = themeContext?.isDark ?? (typeof document !== 'undefined' && (
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark') ||
    document.documentElement.getAttribute('data-vq-theme') !== 'light'
  ));

  const channelId = channel?._id || channel?.channelId;
  const camName = channel?.customName || channel?.name || 'Camera';
  const camSite = channel?.location || channel?.locationName || channel?.site || '';
  const nvrId = channel?.nvrId?._id || channel?.nvrId;
  const day = useMemo(() => startOfDay(date), [date]);

  // Video playback speed (1x, 4x, 16x) — decoupled from timeline zoom
  const [speedIdx, setSpeedIdx] = useState(0);

  // Timeline time-scale zoom level (0 = 24h, ..., 8 = 5m)
  const [timelineZoomLevel, setTimelineZoomLevel] = useState(0);
  const [thumbnailCache, setThumbnailCache] = useState(new Map());

  const [cursorMs, setCursorMs] = useState(0); // ms since midnight
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);

  const [events, setEvents] = useState([]);
  const [segments, setSegments] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [videoUrl, setVideoUrl] = useState('');
  const [sourceRevision, setSourceRevision] = useState(0);
  const [videoState, setVideoState] = useState('idle'); // idle | loading | ready | error | no-recording
  const videoRef = useRef(null);
  const transportRef = useRef(null);
  const scrubTimerRef = useRef(null);
  const seekTokenRef = useRef(0);
  const streamStartMsRef = useRef(0);
  const clockAnchoredRef = useRef(false);
  const fragmentAnchorsRef = useRef([]);
  const playlistClockRef = useRef(null);
  const playbackProgressRef = useRef({ playing: false, buffering: false });

  useEffect(() => {
    const transport = createPlaybackTransport(videoRef.current, {
      onPlaying: (value) => {
        playbackProgressRef.current.playing = value;
        setPlaying(value);
      },
      onBuffering: (value) => {
        playbackProgressRef.current.buffering = value;
        setBuffering(value);
      },
      onReady: () => setVideoState('ready'),
      onError: () => setVideoState('error'),
    });
    transportRef.current = transport;
    return () => {
      transport.destroy();
      transportRef.current = null;
    };
  }, []);

  // Reset per channel/date
  useEffect(() => {
    setCursorMs(0);
    streamStartMsRef.current = 0;
    transportRef.current?.pause();
    setPlaying(false);
    setVideoUrl('');
    setVideoState('idle');
    setTimelineZoomLevel(0);
    setThumbnailCache(new Map());
  }, [channelId, +day]);

  // Fetch event markers + recording-segment availability for the day
  useEffect(() => {
    if (!channelId) { setEvents([]); setSegments([]); return; }
    let cancelled = false;
    setLoadingMeta(true);

    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const endOfDay = new Date(day.getTime() + DAY_MS - 1);

    Promise.allSettled([
      fetchIncidents({ skip: 0, limit: 200 }, { channelId: [channelId], startDate: dateStr, endDate: dateStr }),
      nvrId ? getPlaybackTimeline({ nvrId, cameraId: channelId, channel: channel?.channelId, startTime: day.toISOString(), endTime: endOfDay.toISOString() }) : Promise.resolve(null),
    ]).then(([incidentsRes, timelineRes]) => {
      if (cancelled) return;
      const items = incidentsRes.status === 'fulfilled' ? incidentsRes.value?.items || [] : [];
      setEvents(items.filter((it) => it?.timeOfIncident));
      const timeline = timelineRes.status === 'fulfilled' ? timelineRes.value : null;
      setSegments(timeline ? normalizeRecordingSegments(timeline) : []);
    }).finally(() => {
      if (!cancelled) setLoadingMeta(false);
    });

    return () => { cancelled = true; };
  }, [channelId, nvrId, +day, channel?.channelId]);

  // Pre-populate thumbnail cache from real incident frames
  useEffect(() => {
    if (!events || events.length === 0) return;
    setThumbnailCache((prev) => {
      const next = new Map(prev);
      events.forEach((ev) => {
        const imgUrl = ev.images?.frameImage || ev.images?.personImage || ev.imageUrl || ev.snapshotUrl;
        if (imgUrl && ev.timeOfIncident) {
          const t = new Date(ev.timeOfIncident).getTime();
          const diffMs = t - day.getTime();
          if (diffMs >= 0 && diffMs <= DAY_MS) {
            const bucket = Math.floor(diffMs / (30 * 1000)) * (30 * 1000);
            if (!next.has(bucket)) {
              next.set(bucket, imgUrl);
            }
          }
        }
      });
      return next;
    });
  }, [events, day]);

  // Resolve + load a playable segment for the current cursor (debounced)
  const loadAt = useCallback((ms) => {
    if (!channelId) return;
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    const token = ++seekTokenRef.current;
    // The playback API encodes startTime to whole seconds.
    const requestedMs = Math.floor(ms / 1000) * 1000;
    transportRef.current?.prepare({ autoplay: true });
    streamStartMsRef.current = requestedMs;
    clockAnchoredRef.current = false;
    fragmentAnchorsRef.current = [];
    playlistClockRef.current = createPlaylistClock(requestedMs);
    setVideoState('loading');
    scrubTimerRef.current = setTimeout(async () => {
      const startTime = new Date(day.getTime() + requestedMs);
      const endTime = new Date(day.getTime() + DAY_MS - 1000);
      try {
        const url = await getPlaybackUrl({
          channelId,
          streamId: channel?.rtspChannels?.[0]?.id || channel?.channelId || '102',
          startTime,
          endTime,
          sessionId: getPlaybackSessionId(),
        });
        if (token !== seekTokenRef.current) return;
        if (!url) { transportRef.current?.pause(); setVideoState('no-recording'); setVideoUrl(''); return; }
        setVideoUrl(url);
        // A retry/seek may return the same playlist URL with a new source behind it.
        setSourceRevision((revision) => revision + 1);
      } catch {
        if (token !== seekTokenRef.current) return;
        transportRef.current?.pause();
        setVideoState('no-recording');
        setVideoUrl('');
      }
    }, SCRUB_DEBOUNCE_MS);
  }, [channelId, day]);

  // Auto-load start of day on channel/date change
  useEffect(() => {
    if (channelId) loadAt(0);
    return () => {
      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
      seekTokenRef.current += 1;
    };
  }, [channelId, +day, loadAt]);

  // HLS attach
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (/^rtsp:\/\//i.test(videoUrl)) {
      transportRef.current?.pause();
      setVideoState('no-recording');
      return;
    }
    let hls;
    let cancelled = false;
    let retryTimer = null;
    let attempts = 0;
    let resumePosition = null;
    let failed = false;
    const seekToken = seekTokenRef.current;
    const isCurrent = () => !cancelled && !failed && seekToken === seekTokenRef.current;
    const failPlayback = (error) => {
      if (!isCurrent()) return;
      failed = true;
      if (retryTimer) clearTimeout(retryTimer);
      transportRef.current?.fail(error);
      if (hls) { try { hls.destroy(); } catch { /* noop */ } }
    };

    import('hls.js').then(({ default: Hls }) => {
      if (!isCurrent()) return;

      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          clockAnchoredRef.current = true;
          transportRef.current?.attach();
          video.src = videoUrl;
        } else {
          transportRef.current?.pause();
          setVideoState('no-recording');
        }
        return;
      }

      const attach = () => {
        if (!isCurrent()) return;
        if (hls) {
          if (video.readyState > 0 && video.currentTime > 0 && Number.isFinite(video.currentTime)) resumePosition = video.currentTime;
          transportRef.current?.prepare();
          try { hls.destroy(); } catch { /* noop */ }
        }
        transportRef.current?.attach();
        hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, startPosition: resumePosition ?? -1 });
        hls.attachMedia(video);
        hls.loadSource(videoUrl);

        hls.on(Hls.Events.LEVEL_UPDATED, (_, data) => {
          if (!isCurrent()) return;
          playlistClockRef.current?.remember(data?.details);
        });
        const rememberClock = (_, data) => {
          if (!isCurrent()) return;
          const offset = playlistClockRef.current?.offset(data?.frag) ?? null;
          if (offset !== null) {
            clockAnchoredRef.current = true;
            fragmentAnchorsRef.current = rememberFragmentClock(fragmentAnchorsRef.current, data?.frag, offset);
          }
        };
        // Index decoded segments ahead of presentation; only displayed frames
        // publish clock updates, so buffering cannot advance the timeline.
        hls.on(Hls.Events.FRAG_BUFFERED, rememberClock);
        hls.on(Hls.Events.FRAG_CHANGED, rememberClock);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data?.fatal || !isCurrent()) return;
          const status = data?.response?.status || data?.networkDetails?.status;
          if (status === 404 && attempts < MANIFEST_RETRY_LIMIT) {
            attempts += 1;
            playbackProgressRef.current = { playing: false, buffering: true };
            setBuffering(true);
            setPlaying(false);
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(attach, MANIFEST_RETRY_MS);
            return;
          }
          failPlayback();
        });
      };
      attach();
    }).catch((error) => {
      failPlayback(error);
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (hls) { try { hls.destroy(); } catch { /* noop */ } }
      else { video.removeAttribute('src'); video.load(); }
    };
  }, [videoUrl, day, sourceRevision]);

  // Fullscreen must preserve the current source and the user's play/pause intent.
  useEffect(() => {
    const frame = requestAnimationFrame(() => transportRef.current?.resume());
    return () => cancelAnimationFrame(frame);
  }, [isExpanded]);

  // Playback rate & 16x fast-forward jump simulation
  const fastForwardRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const target = SPEED_LEVELS[speedIdx];
    const nativeRate = Math.min(target, MAX_NATIVE_RATE);
    transportRef.current?.setRate(nativeRate);

    if (fastForwardRef.current) { clearInterval(fastForwardRef.current); fastForwardRef.current = null; }
    if (target > MAX_NATIVE_RATE) {
      const extraPerTick = ((target - nativeRate) * FAST_FORWARD_TICK_MS) / 1000;
      fastForwardRef.current = setInterval(() => {
        const progress = playbackProgressRef.current;
        if (!progress.playing || progress.buffering) return;
        const targetTime = bufferedForwardTarget(video, extraPerTick);
        if (targetTime > video.currentTime) video.currentTime = targetTime;
      }, FAST_FORWARD_TICK_MS);
    }
    return () => {
      if (fastForwardRef.current) { clearInterval(fastForwardRef.current); fastForwardRef.current = null; }
    };
  }, [speedIdx, videoUrl]);

  // All clock labels and the timeline follow displayed frames, not download time.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    return observePlaybackClock(video, {
      canAdvance: () => clockAnchoredRef.current && transportRef.current?.wantsPlayback,
      onTime: (mediaTime) => {
        // A displayed frame proves playback resumed even if a prior buffering
        // event left the UI flags stale. Explicit Pause is guarded above.
        if (!playbackProgressRef.current.playing || playbackProgressRef.current.buffering) {
          playbackProgressRef.current = { playing: true, buffering: false };
          setPlaying(true);
          setBuffering(false);
        }
        const recordingTime = frameRecordingTime(mediaTime, fragmentAnchorsRef.current, streamStartMsRef.current);
        if (recordingTime === null) return;
        const next = Math.min(DAY_MS - 1, Math.max(0, Math.floor(recordingTime)));
        // The UI displays seconds; avoid re-rendering the whole timeline per frame.
        setCursorMs((previous) => Math.floor(previous / 1000) === Math.floor(next / 1000) ? previous : next);
      },
    });
  }, [videoUrl, sourceRevision]);

  const currentZoomConfig = TIMELINE_ZOOM_LEVELS[timelineZoomLevel] || TIMELINE_ZOOM_LEVELS[0];
  const currentThumbStepMs = Math.max(15 * 1000, currentZoomConfig.durationMs / 10);
  const lastSeekMsRef = useRef(null);

  // Frame Capture from active video element
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 68;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 120, 68);
      return canvas.toDataURL('image/jpeg', 0.65);
    } catch {
      return null;
    }
  }, []);

  // Store frame in cache keyed by both exact ms and rounded thumbStepMs bucket
  const saveFrameAt = useCallback(
    (timeMs) => {
      const dataUrl = captureFrame();
      if (!dataUrl) return;
      const step = currentThumbStepMs;
      const bucket = Math.round(timeMs / step) * step;

      setThumbnailCache((prev) => {
        const next = new Map(prev);
        if (next.size > 500) {
          const firstKey = next.keys().next().value;
          next.delete(firstKey);
        }
        next.set(Math.round(timeMs), dataUrl);
        next.set(bucket, dataUrl);
        return next;
      });
    },
    [captureFrame, currentThumbStepMs]
  );

  // Periodic frame capture during continuous playback tied to current zoom's thumbStepMs
  useEffect(() => {
    if (!playing || videoState !== 'ready') return;
    const effectiveRate = SPEED_LEVELS[speedIdx] || 1;
    // Real wall-clock interval needed to capture each thumbnail slot at the current zoom
    const captureIntervalMs = Math.max(
      400,
      Math.min(2500, Math.round(currentThumbStepMs / effectiveRate))
    );

    const interval = setInterval(() => {
      saveFrameAt(cursorMs);
    }, captureIntervalMs);

    return () => clearInterval(interval);
  }, [playing, videoState, cursorMs, currentThumbStepMs, speedIdx, saveFrameAt]);

  // Capture frame immediately on manual seek, frame load, or seeked event
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleFrameReady = () => {
      const targetTime = lastSeekMsRef.current !== null ? lastSeekMsRef.current : cursorMs;
      saveFrameAt(targetTime);
      lastSeekMsRef.current = null;
    };

    video.addEventListener('loadeddata', handleFrameReady);
    video.addEventListener('seeked', handleFrameReady);
    video.addEventListener('canplay', handleFrameReady);
    return () => {
      video.removeEventListener('loadeddata', handleFrameReady);
      video.removeEventListener('seeked', handleFrameReady);
      video.removeEventListener('canplay', handleFrameReady);
    };
  }, [cursorMs, saveFrameAt]);

  const seekTo = useCallback(
    (ms) => {
      const clamped = Math.max(0, Math.min(DAY_MS - 1, ms));
      setCursorMs(clamped);
      streamStartMsRef.current = clamped;
      lastSeekMsRef.current = clamped;
      loadAt(clamped);

      // Attempt immediate capture if the video element is already rendering
      requestAnimationFrame(() => {
        saveFrameAt(clamped);
      });
    },
    [loadAt, saveFrameAt]
  );

  const skipBy = useCallback((deltaMs) => seekTo(cursorMs + deltaMs), [seekTo, cursorMs]);
  const skipToStart = useCallback(() => seekTo(0), [seekTo]);
  const skipToEnd = useCallback(() => seekTo(DAY_MS - 1), [seekTo]);

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, padding: '16px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 0, width: '100%', height: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <style>{`
        @media (max-width: 640px) {
          .vq-pbtl-video { height: 42vh !important; min-height: 220px !important; }
          .vq-pbtl-camlabel { font-size: 11px !important; padding: 5px 8px !important; max-width: calc(100% - 56px) !important; }
          .vq-pbtl-navbtn { width: 32px !important; height: 32px !important; left: 8px !important; right: 8px !important; }
          .vq-pbtl-expand { width: 26px !important; height: 26px !important; bottom: 8px !important; right: 8px !important; }
          .vq-pbtl-transport { justify-content: center !important; }
          .vq-pbtl-clock { min-width: 0 !important; order: 3 !important; flex: 1 1 100% !important; text-align: center !important; }
          .vq-pbtl-speed { min-width: 0 !important; justify-content: center !important; flex: 1 1 100% !important; order: 2 !important; }
          .vq-pbtl-spacer { display: none !important; }
          .vq-pbtl-pill { order: 1 !important; flex: 1 1 100% !important; justify-content: center !important; }
        }
        @media (max-width: 420px) {
          .vq-pbtl-pill { gap: 2px !important; padding: 4px !important; }
        }
      `}</style>

      {/* Video surface */}
      <div className="vq-pbtl-video" style={{ position: 'relative', flex: '1 1 auto', minHeight: isExpanded ? 0 : 300, background: '#000', borderRadius: 10, overflow: 'hidden' }}>
        {/* Keep the video mounted so fullscreen preserves HLS and playback state. */}
        <FullscreenZoomSurface enabled={isExpanded} resetKey={`${channelId || 'camera'}-${+day}`}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: videoState === 'ready' ? 'block' : 'none' }}
          />
        </FullscreenZoomSurface>
        {(videoState !== 'ready' || buffering) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#2563EB', fontSize: 13, padding: 12, textAlign: 'center' }}>
            {(videoState === 'loading' || buffering) && <BufferingIndicator />}
            {videoState === 'error' && (
              <span>Couldn't play this recording. Press play to retry.</span>
            )}
            {videoState === 'no-recording' && (
              <span style={{ color: 'rgba(255,255,255,.55)', fontFamily: 'var(--mono)', fontSize: 12 }}>No recording available for this time</span>
            )}
            {videoState === 'idle' && (
              <span style={{ color: 'rgba(255,255,255,.55)', fontFamily: 'var(--mono)', fontSize: 12 }}>Select a point on the timeline</span>
            )}
          </div>
        )}

        {/* Top-left: camera name + site */}
        <div className="vq-pbtl-camlabel" style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, maxWidth: 'calc(100% - 64px)', background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(4px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {camName}{camSite ? ` — ${camSite}` : ''}
        </div>

        {/* Prev/Next navigation */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="vq-pbtl-navbtn"
            style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 40, height: 40, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="vq-pbtl-navbtn"
            style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 40, height: 40, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* Fullscreen toggle */}
        {onExpand && (
          <button
            onClick={onExpand}
            title={isExpanded ? 'Exit fullscreen' : 'Fullscreen'}
            className="vq-pbtl-expand"
            style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 10, width: 30, height: 30, borderRadius: 6, background: 'rgba(6,8,13,.6)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {isExpanded ? <Minimize2 size={14} color="#fff" /> : <Maximize2 size={14} color="#fff" />}
          </button>
        )}
      </div>

      {/* Transport row */}
      <div className="vq-pbtl-transport" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', rowGap: 8 }}>
        <span
          className="vq-pbtl-clock"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 13,
            color: isDark ? '#f1f5f9' : '#000000',
            fontWeight: 600,
            minWidth: 150,
            whiteSpace: 'nowrap',
          }}
        >
          {fmtClock(cursorMs)} / 24:00:00
        </span>

        <div className="vq-pbtl-spacer" style={{ flex: 1 }} />

        {/* Transport pill */}
        <div
          className="vq-pbtl-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: isDark ? 'var(--bg2)' : '#ffffff',
            border: `1px solid ${isDark ? 'var(--bd)' : 'rgba(0,0,0,0.15)'}`,
            borderRadius: 20,
            padding: '4px 6px',
            boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <button
            onClick={skipToStart}
            title="Jump to start of day"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: isDark ? 'var(--tx2)' : '#000000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            <SkipBack size={15} />
          </button>
          <button
            onClick={() => skipBy(-SKIP_MS)}
            title="Rewind 30 sec"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: isDark ? 'var(--tx2)' : '#000000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={() => {
              if (videoState === 'error' || videoState === 'no-recording' || videoState === 'idle') { loadAt(cursorMs); return; }
              if (playing || buffering) transportRef.current?.pause();
              else transportRef.current?.play();
            }}
            disabled={videoState === 'loading'}
            title={videoState === 'error' || videoState === 'no-recording' ? 'Retry loading this time' : playing || buffering ? 'Pause' : 'Play'}
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--violet)', border: 0, color: '#fff', cursor: videoState === 'loading' ? 'default' : 'pointer', opacity: videoState === 'loading' ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            {(playing || buffering) && videoState === 'ready' ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <button
            onClick={() => skipBy(SKIP_MS)}
            title="Forward 30 sec"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: isDark ? 'var(--tx2)' : '#000000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            <RotateCw size={15} />
          </button>
          <button
            onClick={skipToEnd}
            title="Jump to end of day"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: isDark ? 'var(--tx2)' : '#000000', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            <SkipForward size={15} />
          </button>
        </div>

        <div className="vq-pbtl-spacer" style={{ flex: 1 }} />

        {/* Speed selector — video.playbackRate only */}
        <div className="vq-pbtl-speed" style={{ display: 'flex', gap: 4, minWidth: 150, justifyContent: 'flex-end' }}>
          {SPEED_LEVELS.map((z, i) => (
            <button
              key={z}
              onClick={() => setSpeedIdx(i)}
              title={`Play at ${z}× speed`}
              style={{
                background: speedIdx === i ? 'var(--bg3)' : (isDark ? 'var(--bg2)' : '#ffffff'),
                border: `1px solid ${speedIdx === i ? 'var(--blue)' : (isDark ? 'var(--bd)' : 'rgba(0,0,0,0.15)')}`,
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: 11,
                fontFamily: 'var(--mono)',
                fontWeight: 600,
                color: speedIdx === i ? 'var(--blue)' : (isDark ? 'var(--tx2)' : '#000000'),
                cursor: 'pointer',
              }}
            >
              {z}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Enhanced Playback Timeline with Time-Scale Zoom & Video Frame Thumbnails ── */}
      <PlaybackTimelineBar
        date={day}
        cursorMs={cursorMs}
        onSeek={seekTo}
        segments={segments}
        events={events}
        loadingMeta={loadingMeta}
        playing={playing}
        thumbnailCache={thumbnailCache}
        timelineZoomLevel={timelineZoomLevel}
        onChangeZoomLevel={setTimelineZoomLevel}
      />
    </div>
  );
}
