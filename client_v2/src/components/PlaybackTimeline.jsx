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
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, padding: '16px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 0, width: '100%', height: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Responsive breakpoints for this component only — same <style>+vq- className
          pattern used elsewhere in the app (e.g. AlertsView.jsx / tokens.css) rather
          than inventing a new one. Prefixed vq-pbtl- to avoid clashing with the
          global vq-* rules in theme/tokens.css. */}
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
          .vq-pbtl-hourticks span { font-size: 9px !important; }
        }
        @media (max-width: 420px) {
          .vq-pbtl-pill { gap: 2px !important; padding: 4px !important; }
          .vq-pbtl-hourticks span:nth-child(even) { display: none; }
        }
      `}</style>

      {/* Video surface — the only screen in Camera View; shows the recording,
          never live. Sized larger in true browser fullscreen (no toolbar
          competing for space anymore) than in the normal in-page layout. */}
      <div className="vq-pbtl-video" style={{ position: 'relative', flex: '1 1 auto', minHeight: isExpanded ? 0 : 300, background: '#000', borderRadius: 10, overflow: 'hidden' }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: videoState === 'ready' ? 'block' : 'none' }} />
        {videoState !== 'ready' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#2563EB', fontSize: 13, padding: 12, textAlign: 'center' }}>
            {videoState === 'loading' && (
              <>
                <Wifi size={34} className="vq-blink" />
                <span>Buffering…</span>
              </>
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

        {/* Prev/Next — switch which camera's recording is loaded, same screen */}
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

        {/* Browser fullscreen toggle */}
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

      {/* Transport row: elapsed time · skip/rewind/play/forward/skip pill · speed selector */}
      <div className="vq-pbtl-transport" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', rowGap: 8 }}>
        <span className="vq-pbtl-clock" style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--tx)', minWidth: 150, whiteSpace: 'nowrap' }}>
          {fmtClock(cursorMs)} / 24:00:00
        </span>

        <div className="vq-pbtl-spacer" style={{ flex: 1 }} />

        {/* Transport pill: skip-to-start · rewind 30s · play/pause · forward 30s · skip-to-end */}
        <div className="vq-pbtl-pill" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 20, padding: '4px 6px' }}>
          <button
            onClick={skipToStart}
            title="Jump to start of day"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: 'var(--tx2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            <SkipBack size={15} />
          </button>
          <button
            onClick={() => skipBy(-SKIP_MS)}
            title="Rewind 30 sec"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: 'var(--tx2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
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
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--violet)', border: 0, color: '#fff', cursor: videoState === 'loading' ? 'default' : 'pointer', opacity: videoState === 'loading' ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            {playing && videoState === 'ready' ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <button
            onClick={() => skipBy(SKIP_MS)}
            title="Forward 30 sec"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: 'var(--tx2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            <RotateCw size={15} />
          </button>
          <button
            onClick={skipToEnd}
            title="Jump to end of day"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: 0, color: 'var(--tx2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
          >
            <SkipForward size={15} />
          </button>
        </div>

        <div className="vq-pbtl-spacer" style={{ flex: 1 }} />

        {/* Speed selector — sets both timeline zoom and actual video.playbackRate */}
        <div className="vq-pbtl-speed" style={{ display: 'flex', gap: 4, minWidth: 150, justifyContent: 'flex-end' }}>
          {ZOOM_LEVELS.map((z, i) => (
            <button
              key={z}
              onClick={() => setZoomIdx(i)}
              title={`Play at ${z}× speed`}
              style={{ background: zoomIdx === i ? 'var(--bg3)' : 'var(--bg2)', border: `1px solid ${zoomIdx === i ? 'var(--blue)' : 'var(--bd)'}`, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontFamily: 'var(--mono)', color: zoomIdx === i ? 'var(--blue)' : 'var(--tx2)', cursor: 'pointer' }}
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
      <div ref={scrollRef} style={{ overflowX: ZOOM_LEVELS[zoomIdx] > 1 ? 'auto' : 'hidden', maxWidth: '100%' }}>
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          onPointerDown={handlePointerDown}
          style={{ position: 'relative', height: 34, background: '#e2e8f0', borderRadius: 6, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.15)', cursor: 'pointer', width: `${ZOOM_LEVELS[zoomIdx] * 100}%`, minWidth: '100%', overflow: 'hidden' }}
        >
          {/* progress fill — static 3-stop gradient, width = playback position */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${cursorPct}%`, background: 'linear-gradient(90deg, #07486A 0%, #2563EB 50%, #06B6D4 100%)', transition: dragging ? 'none' : 'width .1s linear' }} />

          {/* recording availability (dim overlay where no segment exists) */}
          {segments.map((seg, i) => {
            const left = ((seg.start - day) / DAY_MS) * 100;
            const width = ((seg.end - seg.start) / DAY_MS) * 100;
            if (width <= 0) return null;
            return (
              <div key={i} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, background: 'rgba(255,255,255,.06)', borderLeft: '1px solid rgba(255,255,255,.25)', borderRight: '1px solid rgba(255,255,255,.25)' }} />
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
                style={{ position: 'absolute', left: `${leftPct}%`, top: 0, bottom: 0, width: 4, background: eventColor(ev.incidentType), borderRadius: 2, transform: 'translateX(-50%)', boxShadow: '0 0 4px rgba(0,0,0,.4)' }}
              />
            );
          })}

          {/* scrub cursor — the gradient fill's leading edge, made visible as a thin bright line */}
          <div style={{ position: 'absolute', left: `${cursorPct}%`, top: 0, bottom: 0, width: dragging ? 3 : 2, background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,.8)', transform: 'translateX(-50%)' }} />

          {/* hour ticks scale with the track so they stay aligned at any zoom */}
          <div className="vq-pbtl-hourticks" style={{ position: 'absolute', left: 0, right: 0, bottom: -14, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', pointerEvents: 'none' }}>
            {hourTicks.map((h) => <span key={h}>{pad2(h)}:00</span>)}
          </div>
        </div>
      </div>
      <div style={{ height: 8 }} />{/* spacer for the absolutely-positioned hour-tick row above */}

      {loadingMeta && (
        <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>Loading recording timeline…</span>
      )}
    </div>
  );
}
