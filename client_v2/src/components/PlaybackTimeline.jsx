import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Maximize2, Minimize2, SkipBack, SkipForward, RotateCcw, RotateCw, Wifi } from 'lucide-react';
import { fetchIncidents } from '../helpers/incidents';
import {
  getPlaybackUrl,
  getPlaybackTimeline,
  normalizeRecordingSegments,
  getPlaybackSessionId,
} from '../helpers/playback';

const DAY_MS = 24 * 60 * 60 * 1000;
/* 1x/4x/16x is both the timeline zoom AND the video playback rate — one
   control, matching the reference UI's single speed-meter row. */
const ZOOM_LEVELS = [1, 4, 16];
const SCRUB_DEBOUNCE_MS = 350;
const SKIP_MS = 30 * 1000;
/* Chrome/Firefox/Safari accept HTMLMediaElement.playbackRate values up to 16,
   but the actual decode pipeline stalls well before that on HLS video — the
   rate "sets" successfully yet playback doesn't speed up past roughly this
   point. Above it we simulate the extra speed with periodic currentTime jumps. */
const MAX_NATIVE_RATE = 4;
const FAST_FORWARD_TICK_MS = 500;
/* Media server generates the HLS manifest asynchronously after playback-url is
   requested — same fixed-delay retry V1 uses (PlaybackVideoCanvasStream.jsx),
   capped at 20s total instead of retrying forever. */
const MANIFEST_RETRY_MS = 1000;
const MANIFEST_RETRY_LIMIT = 20;

const INCIDENT_COLOR = {
  faceRecognition: '#3b82f6',
  motionDetection: '#f5a623',
  genericObjectDetection: '#f5a623',
  unauthorizedAccess: '#ef4444',
  lineCrossing: '#f97316',
  fireSmokeDetection: '#ef4444',
  weaponDetection: '#ef4444',
  unattendedBaggageDetection: '#f5a623',
  crowdDetection: '#f5a623',
  doorDetection: '#06b6d4',
  vehicleDetection: '#06b6d4',
  deskAbsence: '#f5a623',
  guardAbsence: '#ef4444',
  loiteringDetection: '#f5a623',
};
function eventColor(type) {
  return INCIDENT_COLOR[type] || '#8b5cf6';
}

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
 * This is the single video surface for Camera View: it shows the recording
 * for whichever camera/time is selected, never a separate live feed.
 * Fetches real event markers (incidents API) and real recording-segment
 * availability (channel playback-timeline API) for the selected channel/date,
 * then resolves an actual playable URL (channel playback-url API) on seek.
 */
export default function PlaybackTimeline({ channel, date = new Date(), onPrev, onNext, onExpand, isExpanded }) {
  const channelId = channel?._id || channel?.channelId;
  const camName = channel?.customName || channel?.name || 'Camera';
  const camSite = channel?.location || channel?.locationName || channel?.site || '';
  const nvrId = channel?.nvrId?._id || channel?.nvrId;
  const day = useMemo(() => startOfDay(date), [date]);

  const [zoomIdx, setZoomIdx] = useState(0); // also drives video.playbackRate (1x/4x/16x)
  const [cursorMs, setCursorMs] = useState(0); // ms since midnight
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [events, setEvents] = useState([]);
  const [segments, setSegments] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [videoUrl, setVideoUrl] = useState('');
  const [videoState, setVideoState] = useState('idle'); // idle | loading | ready | error | no-recording
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const scrollRef = useRef(null);
  const scrubTimerRef = useRef(null);
  const seekTokenRef = useRef(0);

  /* Keep the cursor in view when zooming in on a scrollable track. */
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const trackWidth = scrollEl.scrollWidth;
    const targetX = (cursorMs / DAY_MS) * trackWidth - scrollEl.clientWidth / 2;
    scrollEl.scrollLeft = Math.max(0, targetX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomIdx]);

  /* ── Reset per channel/date: clear stale video + cursor. Session id is NOT
     regenerated here — it's reused for the whole day (see getPlaybackSessionId),
     matching V1, so the media server can manage/replace one ongoing session
     instead of accumulating a new one per camera/date switch. ── */
  useEffect(() => {
    setCursorMs(0);
    setPlaying(false);
    setVideoUrl('');
    setVideoState('idle');
  }, [channelId, +day]);

  /* ── Fetch event markers + recording-segment availability for the day ──── */
  useEffect(() => {
    if (!channelId) { setEvents([]); setSegments([]); return; }
    let cancelled = false;
    setLoadingMeta(true);

    // Local calendar date (not toISOString, which shifts to UTC and can land
    // on the wrong day for timezones ahead of UTC, e.g. IST).
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

  /* ── Resolve + load a playable segment for the current cursor (debounced) ── */
  const loadAt = useCallback((ms) => {
    if (!channelId) return;
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    const token = ++seekTokenRef.current;
    setVideoState('loading');
    scrubTimerRef.current = setTimeout(async () => {
      const startTime = new Date(day.getTime() + ms);
      // V1 always requests start→end-of-day (23:59:59Z same day), not a short
      // window — the media server streams forward from startTime as playback advances.
      const endTime = new Date(day.getTime() + DAY_MS - 1000);
      try {
        const url = await getPlaybackUrl({
          channelId,
          streamId: channel?.rtspChannels?.[0]?.id || channel?.channelId || '102',
          startTime,
          endTime,
          sessionId: getPlaybackSessionId(),
        });
        if (token !== seekTokenRef.current) return; // superseded by a newer seek
        if (!url) { setVideoState('no-recording'); setVideoUrl(''); return; }
        // Stays 'loading' until the HLS effect's MANIFEST_PARSED fires — the
        // media server generates the manifest asynchronously after this resolves.
        setVideoUrl(url);
      } catch {
        if (token !== seekTokenRef.current) return;
        setVideoState('no-recording');
        setVideoUrl('');
      }
    }, SCRUB_DEBOUNCE_MS);
  }, [channelId, day]);

  /* ── Auto-load the start of the day whenever the channel/date changes,
     so there's always something loaded to play instead of an empty player. ── */
  useEffect(() => {
    if (channelId) loadAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, +day]);

  /* ── HLS attach for whatever URL we resolved (mirrors useHlsPlayer's Hls.js usage).
     The media server generates the HLS manifest asynchronously after playback-url
     is requested, so the very first manifest fetch commonly 404s — same race V1
     handles in PlaybackVideoCanvasStream.jsx via a fixed-delay retry loop. We mirror
     that here (1s delay) but cap it so a genuinely missing recording doesn't spin
     forever. ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (/^rtsp:\/\//i.test(videoUrl)) {
      // Raw RTSP (Tiandy / local-Tiandy branches) — no browser can play this directly.
      setVideoState('no-recording');
      return;
    }
    let hls;
    let cancelled = false;
    let retryTimer = null;
    let attempts = 0;

    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;

      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
        } else {
          setVideoState('no-recording');
        }
        return;
      }

      const attach = () => {
        if (cancelled) return;
        if (hls) { try { hls.destroy(); } catch { /* noop */ } }
        hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        // attachMedia before loadSource — same order as V1's PlaybackVideoCanvasStream.
        hls.attachMedia(video);
        hls.loadSource(videoUrl);
        // MANIFEST_PARSED alone means the playlist loaded, not that a frame is
        // renderable yet — V1 waits for the first FRAG_LOADED before marking the
        // player ready and autoplaying, avoiding a play() call on an empty buffer.
        let fragLoaded = false;
        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (cancelled || fragLoaded) return;
          fragLoaded = true;
          setVideoState('ready');
          setPlaying(true);
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data?.fatal || cancelled) return;
          const status = data?.response?.status || data?.networkDetails?.status;
          // Manifest not generated yet — the media server is still processing the
          // segment; retry for up to MANIFEST_RETRY_LIMIT * MANIFEST_RETRY_MS.
          if (status === 404 && attempts < MANIFEST_RETRY_LIMIT) {
            attempts += 1;
            retryTimer = setTimeout(attach, MANIFEST_RETRY_MS);
            return;
          }
          setVideoState('no-recording');
        });
      };
      attach();
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (hls) { try { hls.destroy(); } catch { /* noop */ } }
    };
  }, [videoUrl]);

  /* ── Play/pause drives the video element; video "ended" advances the cursor ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing, videoUrl]);

  /* ── The 1x/4x/16x selector sets the video playback rate.
     Browsers silently clamp/degrade HTMLMediaElement.playbackRate well below
     16 in practice (the decode pipeline can't keep up), so a `playbackRate =
     16` assignment "succeeds" but visibly plays at native speed. Above
     MAX_NATIVE_RATE we instead drive a synthetic fast-forward: play at the
     capped native rate and periodically jump currentTime ahead so the extra
     speed is real, not just requested. ── */
  const fastForwardRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const target = ZOOM_LEVELS[zoomIdx];
    const nativeRate = Math.min(target, MAX_NATIVE_RATE);
    video.playbackRate = nativeRate;

    if (fastForwardRef.current) { clearInterval(fastForwardRef.current); fastForwardRef.current = null; }
    if (target > MAX_NATIVE_RATE) {
      const extraPerTick = ((target - nativeRate) * FAST_FORWARD_TICK_MS) / 1000;
      fastForwardRef.current = setInterval(() => {
        if (video.paused) return;
        video.currentTime = Math.min(video.currentTime + extraPerTick, video.duration || Infinity);
      }, FAST_FORWARD_TICK_MS);
    }
    return () => {
      if (fastForwardRef.current) { clearInterval(fastForwardRef.current); fastForwardRef.current = null; }
    };
  }, [zoomIdx, videoUrl]);

  /* ── Advance the on-screen cursor while playing (from the video's own clock) ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playing) return;
    const segStartMs = cursorMs - (cursorMs % (5 * 60 * 1000));
    const id = setInterval(() => {
      if (!video || video.paused) return;
      const next = segStartMs + video.currentTime * 1000;
      setCursorMs(Math.min(next, DAY_MS - 1));
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, videoUrl]);

  const seekTo = useCallback((ms) => {
    const clamped = Math.max(0, Math.min(DAY_MS - 1, ms));
    setCursorMs(clamped);
    loadAt(clamped);
  }, [loadAt]);

  const skipBy = useCallback((deltaMs) => seekTo(cursorMs + deltaMs), [seekTo, cursorMs]);
  const skipToStart = useCallback(() => seekTo(0), [seekTo]);
  const skipToEnd = useCallback(() => seekTo(DAY_MS - 1), [seekTo]);

  const msFromClientX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * DAY_MS;
  }, []);

  const justDraggedRef = useRef(false);

  const handleTrackClick = (e) => {
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    seekTo(msFromClientX(e.clientX));
  };

  const handlePointerDown = (e) => {
    setDragging(true);
    setPlaying(false);
    seekTo(msFromClientX(e.clientX));
    const onMove = (ev) => setCursorMs(Math.max(0, Math.min(DAY_MS - 1, msFromClientX(ev.clientX))));
    const onUp = (ev) => {
      setDragging(false);
      justDraggedRef.current = true;
      seekTo(msFromClientX(ev.clientX));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const cursorPct = (cursorMs / DAY_MS) * 100;
  const hourTicks = [0, 4, 8, 12, 16, 20, 24];

  return (
    <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[14px] p-[16px] flex flex-col gap-[12px] min-w-0 max-w-full box-border">
      {/* Responsive breakpoints for this component only — same <style>+vq- className
          pattern used elsewhere in the app (e.g. AlertsView.jsx / tokens.css) rather
          than inventing a new one. Prefixed vq-pbtl- to avoid clashing with the
          global vq-* rules in theme/tokens.css. */}
      <style>{`
        @media (max-width: 640px) {
          .vq-pbtl-video { height: 52vh !important; min-height: 300px !important; }
          .vq-pbtl-camlabel { font-size: 11px !important; padding: 5px 8px !important; max-width: calc(100% - 56px) !important; }
          .vq-pbtl-navbtn { width: 32px !important; height: 32px !important; left: 8px !important; right: 8px !important; }
          .vq-pbtl-expand { width: 26px !important; height: 26px !important; bottom: 8px !important; right: 8px !important; }
          .vq-pbtl-transport { justify-content: center !important; }
          .vq-pbtl-clock { min-width: 0 !important; order: 3 !important; flex: 1 1 100% !important; text-align: center !important; }
          .vq-pbtl-speed { min-width: 0 !important; justify-content: center !important; flex: 1 1 100% !important; order: 2 !important; }
          .vq-pbtl-spacer { display: none !important; }
          .vq-pbtl-pill { order: 1 !important; flex: 1 1 100% !important; justify-content: center !important; }
          .vq-pbtl-hourticks span { font-size: 9px !important; }
        }
        @media (max-width: 420px) {
          .vq-pbtl-pill { gap: 2px !important; padding: 4px !important; }
          .vq-pbtl-hourticks span:nth-child(even) { display: none; }
        }
      `}</style>

      {/* Video surface — the only screen in Camera View; shows the recording, never live */}
      <div className="vq-pbtl-video relative h-[60vh] min-h-[360px] bg-black rounded-[10px] overflow-hidden">
        <video ref={videoRef} muted playsInline className={`w-full h-full object-contain ${videoState === 'ready' ? 'block' : 'hidden'}`} />
        {videoState !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px] text-[#2563EB] text-[13px] p-[12px] text-center">
            {videoState === 'loading' && (
              <>
                <Wifi size={34} className="vq-blink" />
                <span>Buffering…</span>
              </>
            )}
            {videoState === 'no-recording' && (
              <span className="text-[rgba(255,255,255,.55)] font-[family-name:var(--mono)] text-[12px]">No recording available for this time</span>
            )}
            {videoState === 'idle' && (
              <span className="text-[rgba(255,255,255,.55)] font-[family-name:var(--mono)] text-[12px]">Select a point on the timeline</span>
            )}
          </div>
        )}

        {/* Top-left: camera name + site */}
        <div className="vq-pbtl-camlabel absolute top-[14px] left-[14px] z-10 max-w-[calc(100%_-_64px)] bg-[rgba(15,23,42,0.75)] border border-[rgba(255,255,255,0.15)] px-[12px] py-[6px] rounded-[8px] text-white text-[12px] font-semibold backdrop-blur-[4px] overflow-hidden text-ellipsis whitespace-nowrap">
          {camName}{camSite ? ` — ${camSite}` : ''}
        </div>

        {/* Prev/Next — switch which camera's recording is loaded, same screen */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="vq-pbtl-navbtn absolute left-[16px] top-1/2 -translate-y-1/2 z-10 w-[40px] h-[40px] rounded-full bg-[rgba(15,23,42,0.65)] border border-[rgba(255,255,255,0.15)] text-white cursor-pointer flex items-center justify-center"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="vq-pbtl-navbtn absolute right-[16px] top-1/2 -translate-y-1/2 z-10 w-[40px] h-[40px] rounded-full bg-[rgba(15,23,42,0.65)] border border-[rgba(255,255,255,0.15)] text-white cursor-pointer flex items-center justify-center"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* Browser fullscreen toggle */}
        {onExpand && (
          <button
            onClick={onExpand}
            title={isExpanded ? 'Exit fullscreen' : 'Fullscreen'}
            className="vq-pbtl-expand absolute bottom-[14px] right-[14px] z-10 w-[30px] h-[30px] rounded-[6px] bg-[rgba(6,8,13,.6)] border border-[rgba(255,255,255,.15)] backdrop-blur-[4px] flex items-center justify-center cursor-pointer"
          >
            {isExpanded ? <Minimize2 size={14} color="#fff" /> : <Maximize2 size={14} color="#fff" />}
          </button>
        )}
      </div>

      {/* Transport row: elapsed time · skip/rewind/play/forward/skip pill · speed selector */}
      <div className="vq-pbtl-transport flex items-center gap-x-[12px] gap-y-[8px] flex-wrap">
        <span className="vq-pbtl-clock font-[family-name:var(--mono)] text-[13px] text-[var(--tx)] min-w-[150px] whitespace-nowrap">
          {fmtClock(cursorMs)} / 24:00:00
        </span>

        <div className="vq-pbtl-spacer flex-1" />

        {/* Transport pill: skip-to-start · rewind 30s · play/pause · forward 30s · skip-to-end */}
        <div className="vq-pbtl-pill flex items-center gap-[6px] bg-[var(--bg2)] border border-[var(--bd)] rounded-[20px] px-[6px] py-[4px]">
          <button
            onClick={skipToStart}
            title="Jump to start of day"
            className="w-[30px] h-[30px] rounded-full bg-transparent border-0 text-[var(--tx2)] cursor-pointer flex items-center justify-center flex-none"
          >
            <SkipBack size={15} />
          </button>
          <button
            onClick={() => skipBy(-SKIP_MS)}
            title="Rewind 30 sec"
            className="w-[30px] h-[30px] rounded-full bg-transparent border-0 text-[var(--tx2)] cursor-pointer flex items-center justify-center flex-none"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={() => {
              if (videoState === 'no-recording' || videoState === 'idle') { loadAt(cursorMs); return; }
              setPlaying((p) => !p);
            }}
            disabled={videoState === 'loading'}
            title={videoState === 'no-recording' ? 'Retry loading this time' : playing ? 'Pause' : 'Play'}
            className={`w-[34px] h-[34px] rounded-full bg-[var(--violet)] border-0 text-white flex items-center justify-center flex-none ${videoState === 'loading' ? 'cursor-default opacity-50' : 'cursor-pointer opacity-100'}`}
          >
            {playing && videoState === 'ready' ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <button
            onClick={() => skipBy(SKIP_MS)}
            title="Forward 30 sec"
            className="w-[30px] h-[30px] rounded-full bg-transparent border-0 text-[var(--tx2)] cursor-pointer flex items-center justify-center flex-none"
          >
            <RotateCw size={15} />
          </button>
          <button
            onClick={skipToEnd}
            title="Jump to end of day"
            className="w-[30px] h-[30px] rounded-full bg-transparent border-0 text-[var(--tx2)] cursor-pointer flex items-center justify-center flex-none"
          >
            <SkipForward size={15} />
          </button>
        </div>

        <div className="vq-pbtl-spacer flex-1" />

        {/* Speed selector — sets both timeline zoom and actual video.playbackRate */}
        <div className="vq-pbtl-speed flex gap-[4px] min-w-[150px] justify-end">
          {ZOOM_LEVELS.map((z, i) => (
            <button
              key={z}
              onClick={() => setZoomIdx(i)}
              title={`Play at ${z}× speed`}
              className={`rounded-[6px] px-[10px] py-[3px] text-[11px] font-[family-name:var(--mono)] cursor-pointer border ${zoomIdx === i ? 'bg-[var(--bg3)] border-[var(--blue)] text-[var(--blue)]' : 'bg-[var(--bg2)] border-[var(--bd)] text-[var(--tx2)]'}`}
            >
              {z}×
            </button>
          ))}
        </div>
      </div>

      {/* Scrubbable 24h timeline — gradient fill bar matches V1's TimelineBar.jsx
          (navy → blue → cyan, filled proportionally to playback position).
          Zoom widens the inner track (scrollable) rather than scaling it, so
          hit-testing for click/drag stays in sync with marker positions. */}
      <div ref={scrollRef} className={`max-w-full ${ZOOM_LEVELS[zoomIdx] > 1 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          onPointerDown={handlePointerDown}
          className="relative h-[48px] bg-[#e2e8f0] rounded-[6px] shadow-[inset_0_1px_3px_rgba(0,0,0,.15)] cursor-pointer min-w-full overflow-hidden"
          style={{ width: `${ZOOM_LEVELS[zoomIdx] * 100}%` }}
        >
          {/* progress fill — static 3-stop gradient, width = playback position */}
          <div className="absolute left-0 top-0 bottom-0 bg-[linear-gradient(90deg,#07486A_0%,#2563EB_50%,#06B6D4_100%)]" style={{ width: `${cursorPct}%`, transition: dragging ? 'none' : 'width .1s linear' }} />

          {/* recording availability (dim overlay where no segment exists) */}
          {segments.map((seg, i) => {
            const left = ((seg.start - day) / DAY_MS) * 100;
            const width = ((seg.end - seg.start) / DAY_MS) * 100;
            if (width <= 0) return null;
            return (
              <div key={i} className="absolute top-0 bottom-0 bg-[rgba(255,255,255,.06)] border-x border-[rgba(255,255,255,.25)]" style={{ left: `${left}%`, width: `${width}%` }} />
            );
          })}

          {/* event markers — 4px rounded bars on top of the gradient */}
          {events.map((ev) => {
            const t = new Date(ev.timeOfIncident);
            const leftPct = (((t - day) / DAY_MS) * 100).toFixed(3);
            if (leftPct < 0 || leftPct > 100) return null;
            return (
              <div
                key={ev._id}
                title={`${ev.incidentName || ev.incidentType} · ${t.toLocaleTimeString()}`}
                className="absolute top-0 bottom-0 w-[4px] rounded-[2px] -translate-x-1/2 shadow-[0_0_4px_rgba(0,0,0,.4)]"
                style={{ left: `${leftPct}%`, background: eventColor(ev.incidentType) }}
              />
            );
          })}

          {/* scrub cursor — the gradient fill's leading edge, made visible as a thin bright line */}
          <div className={`absolute top-0 bottom-0 bg-white shadow-[0_0_6px_rgba(255,255,255,.8)] -translate-x-1/2 ${dragging ? 'w-[3px]' : 'w-[2px]'}`} style={{ left: `${cursorPct}%` }} />

          {/* hour ticks scale with the track so they stay aligned at any zoom */}
          <div className="vq-pbtl-hourticks absolute left-0 right-0 -bottom-[16px] flex justify-between text-[10px] text-[var(--tx3)] font-[family-name:var(--mono)] pointer-events-none">
            {hourTicks.map((h) => <span key={h}>{pad2(h)}:00</span>)}
          </div>
        </div>
      </div>
      <div className="h-[12px]" />{/* spacer for the absolutely-positioned hour-tick row above */}

      {loadingMeta && (
        <span className="text-[10.5px] text-[var(--tx3)] font-[family-name:var(--mono)]">Loading recording timeline…</span>
      )}
    </div>
  );
}
