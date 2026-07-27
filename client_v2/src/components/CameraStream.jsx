import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, VideoOff } from 'lucide-react';
import useHlsPlayer from '../hooks/useHlsPlayer';
import { streamUrl } from '../lib/stream';

/* Single shared clock — one interval regardless of how many tiles are mounted */
let _clockListeners = new Set();
let _clockTick = new Date();
let _clockInterval = null;

function _startClock() {
  if (_clockInterval) return;
  _clockInterval = setInterval(() => {
    _clockTick = new Date();
    _clockListeners.forEach(fn => fn(_clockTick));
  }, 1000);
}

function useClock() {
  const [tick, setTick] = useState(() => _clockTick);
  useEffect(() => {
    _clockListeners.add(setTick);
    _startClock();
    return () => { _clockListeners.delete(setTick); };
  }, []);
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
 */
export default function CameraStream({
  channel,
  camLabel,          // e.g. "CAM-001" — injected by CameraGrid
  showOverlay = true,
  onMaximize,
  isFullscreen = false, // swaps the maximize icon to a "restore" icon when already fullscreen
  onLiveChange,      // (isLive: boolean) => void — reports live status up to grid
  rounded = true,
  minH = 200,
  fit = 'cover',      // 'cover' crops to fill (grid tiles); 'contain' shows the full frame uncropped (fullscreen, so camera-burned OSD text at the edges isn't cut off)
}) {
  const videoRef = useRef(null);
  const [error,   setError]   = useState(false);
  const [playing, setPlaying] = useState(false);
  const now = useClock();

  const url  = streamUrl(channel);
  const name = channel?.customName || channel?.name || channel?.channelId || 'Camera';
  const site = channel?.location   || channel?.locationName || '';
  const label = camLabel || name;

  useHlsPlayer(videoRef, url, {
    enabled:   !!url,
    onError:   () => setError(true),
    onStarted: () => setError(false),
  });

  const live = playing && !error;

  useEffect(() => {
    onLiveChange?.(live);
  }, [live, onLiveChange]);

  return (
    <div
      onClick={onMaximize}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: minH,
        background: '#07090c',
        borderRadius: rounded ? 10 : 0,
        overflow: 'hidden',
        cursor: onMaximize ? 'pointer' : 'default',
      }}
    >
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        onPlaying={() => setPlaying(true)}
        onWaiting={() => setPlaying(false)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, display: url ? 'block' : 'none' }}
      />

      {/* Offline / connecting placeholder */}
      {(!url || error || !playing) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,.3)' }}>
          <VideoOff size={22} strokeWidth={1.4} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.5px' }}>
            {!url ? 'No stream configured' : error ? 'Stream unavailable' : `${name} · connecting…`}
          </span>
          {!error && url && (
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
