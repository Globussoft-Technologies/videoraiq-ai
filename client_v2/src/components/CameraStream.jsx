import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Maximize2, Minimize2, VideoOff } from 'lucide-react';
import useHlsPlayer from '../hooks/useHlsPlayer';
import useStreamSlot from '../hooks/useStreamSlot';
import { streamUrl } from '../lib/stream';
import FullscreenZoomSurface from './FullscreenZoomSurface';

/* How long a tile may hold the shared start slot before the next camera goes.
   The camera is NOT torn down at this point — it keeps connecting; it just
   stops blocking the queue, because the expensive part of startup (worker
   spawn, SourceBuffer setup, first keyframe decode) is over by then. */
const SETTLE_TIMEOUT_MS = 6000;

/* Off-screen tiles start after on-screen ones regardless of DOM order. */
const OFFSCREEN_PRIORITY_PENALTY = 500;

/* Single shared clock — one interval regardless of how many tiles are mounted */
let _clockListeners = new Set();
let _clockTick = new Date();
let _clockInterval = null;

function _startClock() {
  if (_clockInterval) return;
  _clockTick = new Date();
  _clockInterval = setInterval(() => {
    _clockTick = new Date();
    _clockListeners.forEach(fn => fn(_clockTick));
  }, 1000);
}

function _stopClockIfIdle() {
  if (_clockListeners.size || !_clockInterval) return;
  clearInterval(_clockInterval);
  _clockInterval = null;
}

function useClock(enabled = true) {
  const [tick, setTick] = useState(() => _clockTick);
  useEffect(() => {
    if (!enabled) return undefined;
    _clockListeners.add(setTick);
    _startClock();
    setTick(_clockTick);
    return () => { _clockListeners.delete(setTick); _stopClockIfIdle(); };
  }, [enabled]);
  return tick;
}

function fmtTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mo = pad(d.getMonth() + 1);
  const yy = d.getFullYear();
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${dd}/${mo}/${yy} ${day} ${hh}:${mm}:${ss}`;
}

/**
 * Live HLS camera tile. Matches the prod Live Wall overlay design:
 * - Top-left:  CAM-XXX + live timestamp
 * - Top-right: LIVE / OFFLINE badge
 * - Bottom-left: camera name + location
 * - Bottom-right: maximize icon
 *
 * Streams are never created eagerly: the tile queues for a start slot from the
 * shared stream scheduler (see lib/streamQueue) so cameras come up one at a
 * time. Setting `active` to false releases the slot and destroys the player,
 * freeing the WebRTC/MSE decoder, hls.js worker and its timers.
 */
export default function CameraStream({
  channel,
  children,
  camLabel,          // e.g. "CAM-001" — injected by CameraGrid
  showOverlay = true,
  onMaximize,
  isFullscreen = false, // swaps the maximize icon to a "restore" icon when already fullscreen
  onLiveChange,      // (isLive: boolean) => void — reports live status up to grid
  onSettled,         // () => void — fired once the stream has started or given up
  rounded = true,
  minH = 200,
  fit = 'cover',      // 'cover' crops to fill (grid tiles); 'contain' shows the full frame uncropped (fullscreen, so camera-burned OSD text at the edges isn't cut off)
  active = true,      // false → tear the stream down entirely (page hidden, probe recycled)
  priority = 0,       // lower starts earlier; the grid passes tile order here
  immediate = false,  // user explicitly asked for THIS camera — skip the queue
  requireVisible = false, // don't even queue until the tile is actually in view
  slotId,             // scheduler key; defaults to the channel id
  enableFullscreenZoom = false,
  zoomToolbarStyle,
  clickToMaximize = true, // false → a single click on the tile no longer calls onMaximize (only the explicit maximize icon and onDoubleClick, if wired by the caller, do)
  onDoubleClick,
  enableZoom = false, // scroll-to-zoom + drag-to-pan even when the tile isn't in true fullscreen (isFullscreen still only swaps the maximize/restore icon)
}) {
  const videoRef = useRef(null);
  const hostRef  = useRef(null);
  const [error,   setError]   = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settled, setSettled] = useState(false);
  /* When gated on visibility we must start as "not visible" and let the observer
     say otherwise, or an off-screen tile would queue itself before the first
     observation lands. Ungated tiles assume visible so priority still works. */
  const [onScreen, setOnScreen] = useState(!requireVisible);
  const [everVisible, setEverVisible] = useState(false);

  const url  = streamUrl(channel);
  const name = channel?.customName || channel?.name || channel?.channelId || 'Camera';
  const site = channel?.location   || channel?.locationName || '';
  const label = camLabel || name;

  /* Scheduler key. Per-instance, not per-channel: the same camera can legitimately
     be mounted twice at once (a grid tile plus the fullscreen modal on top of it),
     and two tiles sharing one queue entry would leave one of them never admitted. */
  const instanceId = useId();
  const streamId = slotId || `${channel?._id || channel?.channelId || url || 'cam'}::${instanceId}`;

  /* Viewport awareness — a tile scrolled out of view yields its turn to the
     tiles the user is actually looking at, and with `requireVisible` doesn't
     take a turn at all until it scrolls in. */
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true); // no observer support — fall back to "always eligible"
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setOnScreen(entry.isIntersecting);
        if (entry.isIntersecting) setEverVisible(true);
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Once a gated tile has been scrolled into view it keeps streaming even if it
     scrolls back out: tearing down on every scroll would make the grid flicker
     and re-buffer constantly. A page change or pause unmounts it for real. */
  const visibleEnough = !requireVisible || onScreen || everVisible;

  useEffect(() => {
    if (!active) setEverVisible(false);
  }, [active]);

  const { admitted, settle } = useStreamSlot(streamId, {
    priority: priority + (onScreen ? 0 : OFFSCREEN_PRIORITY_PENALTY),
    enabled: active && !!url && visibleEnough,
    immediate,
  });

  const enabled = active && admitted && !!url;

  /* ── Settling: release the start slot exactly once per admission ────── */
  const settledRef  = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const markSettled = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    setSettled(true);
    settle();
    onSettledRef.current?.();
  }, [settle]);

  /* Reset the tile's stream state whenever it loses (or regains) its slot, so
     a torn-down tile never reports stale playback state. */
  useEffect(() => {
    if (enabled) return;
    settledRef.current = false;
    setSettled(false);
    setPlaying(false);
    setError(false);
  }, [enabled]);

  /* Don't let one unreachable camera hold the queue hostage. */
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setTimeout(markSettled, SETTLE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [enabled, markSettled]);

  const handleError = useCallback(() => { setError(true); markSettled(); }, [markSettled]);
  const handleStarted = useCallback(() => { setError(false); }, []);
  const handlePlaying = useCallback(() => { setPlaying(true); markSettled(); }, [markSettled]);

  useHlsPlayer(videoRef, url, {
    enabled,
    onError:   handleError,
    onStarted: handleStarted,
  });

  const live = enabled && playing && !error;

  /* Report status upward only once this tile has an actual opinion. While it is
     queued (or the page is paused) the grid keeps the camera's last known
     state, so the Live/Offline filter and the online counter don't flap. */
  useEffect(() => {
    if (!enabled) return;
    if (live) { onLiveChange?.(true); return; }
    if (settled) onLiveChange?.(false);
  }, [live, settled, enabled, onLiveChange]);

  const now = useClock(showOverlay && active);

  const paused = !active;
  const queued = active && !!url && !admitted;

  const placeholder =
    !url    ? 'No stream configured'
    : paused ? 'Paused · not in view'
    : queued ? 'Queued…'
    : error  ? 'Stream unavailable'
    : `${name} · connecting…`;

  const videoElement = (
    <video
      ref={videoRef}
      muted
      autoPlay
      playsInline
      onPlaying={handlePlaying}
      onWaiting={() => setPlaying(false)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, display: url && enabled ? 'block' : 'none' }}
    />
  );

  const streamContent = (
    <>
      {videoElement}
      {children}
    </>
  );

  return (
    <div
      ref={hostRef}
      onClick={clickToMaximize ? onMaximize : undefined}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: minH,
        background: '#07090c',
        borderRadius: rounded ? 10 : 0,
        overflow: 'hidden',
        cursor: clickToMaximize && onMaximize ? 'grab' : 'default',
      }}
    >
      {enableFullscreenZoom ? (
        <FullscreenZoomSurface enabled={isFullscreen || enableZoom} resetKey={streamId} toolbarStyle={zoomToolbarStyle}>
          {streamContent}
        </FullscreenZoomSurface>
      ) : (
        streamContent
      )}

      {/* Offline / queued / connecting placeholder */}
      {(!url || !enabled || error || !playing) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,.3)' }}>
          <VideoOff size={22} strokeWidth={1.4} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px' }}>
            {placeholder}
          </span>
          {!error && url && !paused && (
            <div style={{ position: 'absolute', left: 0, right: 0, height: 2, top: 0, background: 'linear-gradient(90deg,transparent,rgba(90,170,255,.5),transparent)', animation: 'vq-scan 6s linear infinite' }} />
          )}
        </div>
      )}

      {showOverlay && (
        <>
          {/* Subtle scanline texture */}
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg,rgba(255,255,255,.008) 0 16px,transparent 16px 32px)', pointerEvents: 'none' }} />

          {/* Top-left: CAM-XXX label + timestamp */}
          <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(6,8,13,.65)', padding: '2px 7px', borderRadius: 4, backdropFilter: 'blur(4px)', letterSpacing: '.4px' }}>
              {label}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,.75)', background: 'rgba(6,8,13,.55)', padding: '2px 7px', borderRadius: 4, backdropFilter: 'blur(4px)' }}>
              {fmtTimestamp(now)}
            </span>
          </div>

          {/* Top-right: LIVE / OFFLINE badge */}
          <div style={{
            position: 'absolute', top: 8, right: 10,
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
            color: live ? '#22c55e' : '#ef4444',
            background: 'rgba(6,8,13,.65)', padding: '3px 8px', borderRadius: 4, backdropFilter: 'blur(4px)',
            letterSpacing: '.5px',
          }}>
            <span
              className={live ? 'vq-blink' : ''}
              style={{ width: 6, height: 6, borderRadius: '50%', background: live ? '#22c55e' : '#ef4444', boxShadow: live ? '0 0 5px #22c55e' : 'none', flexShrink: 0 }}
            />
            {live ? 'LIVE' : 'OFFLINE'}
          </div>

          {/* Bottom-left: camera name + site */}
          <div style={{ position: 'absolute', bottom: 8, left: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: '#fff', background: 'rgba(6,8,13,.6)', padding: '2px 7px', borderRadius: 4, backdropFilter: 'blur(4px)' }}>
              {name}
            </span>
            {site && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,.65)', background: 'rgba(6,8,13,.5)', padding: '2px 7px', borderRadius: 4, backdropFilter: 'blur(4px)' }}>
                {site}
              </span>
            )}
          </div>

          {/* Bottom-right: expand / restore button */}
          {onMaximize && (
            <div
              onClick={(e) => { e.stopPropagation(); onMaximize(); }}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              style={{ position: 'absolute', bottom: 8, right: 10, width: 26, height: 26, borderRadius: 5, background: 'rgba(6,8,13,.6)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {isFullscreen ? <Minimize2 size={12} color="#fff" /> : <Maximize2 size={12} color="#fff" />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
