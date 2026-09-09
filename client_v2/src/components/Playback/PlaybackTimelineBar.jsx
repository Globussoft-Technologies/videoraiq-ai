import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Clock, ShieldAlert } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const TIMELINE_ZOOM_LEVELS = [
  { label: '24h', durationMs: 24 * 60 * 60 * 1000, tickStepSec: 3600, showSeconds: false },
  { label: '12h', durationMs: 12 * 60 * 60 * 1000, tickStepSec: 1800, showSeconds: false },
  { label: '6h', durationMs: 6 * 60 * 60 * 1000, tickStepSec: 900, showSeconds: false },
  { label: '3h', durationMs: 3 * 60 * 60 * 1000, tickStepSec: 600, showSeconds: false },
  { label: '1h 30m', durationMs: 90 * 60 * 1000, tickStepSec: 300, showSeconds: false },
  { label: '45m', durationMs: 45 * 60 * 1000, tickStepSec: 120, showSeconds: false },
  { label: '22m 30s', durationMs: 1350 * 1000, tickStepSec: 60, showSeconds: false },
  { label: '11m 15s', durationMs: 675 * 1000, tickStepSec: 30, showSeconds: true },
  { label: '5m', durationMs: 300 * 1000, tickStepSec: 10, showSeconds: true },
];

const STANDARD_LABEL_INTERVALS_SEC = [
  10, 15, 20, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200, 10800, 14400, 21600, 43200,
];

function getOptimalLabelStepSec(tickStepSec, windowDurationMs, containerWidth, showSeconds) {
  const minSpacingPx = showSeconds ? 100 : 80;
  for (const stepSec of STANDARD_LABEL_INTERVALS_SEC) {
    if (stepSec >= tickStepSec && stepSec % tickStepSec === 0) {
      const px = (stepSec * 1000 / windowDurationMs) * containerWidth;
      if (px >= minSpacingPx) {
        return stepSec;
      }
    }
  }
  return tickStepSec;
}

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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatClock(ms, includeSeconds = true) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (!includeSeconds) return `${pad2(h)}:${pad2(m)}`;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export default function PlaybackTimelineBar({
  date,
  cursorMs,
  onSeek,
  segments = [],
  events = [],
  loadingMeta = false,
  playing = false,
  thumbnailCache = new Map(),
  timelineZoomLevel = 0,
  onChangeZoomLevel,
}) {
  const themeContext = useTheme();
  const isDark = themeContext?.isDark ?? (typeof document !== 'undefined' && (
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark') ||
    document.documentElement.getAttribute('data-vq-theme') !== 'light'
  ));

  const scrollRef = useRef(null);
  const trackRef = useRef(null);
  const pendingScrollLeftRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [hoverMs, setHoverMs] = useState(null);
  const [hoverX, setHoverX] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const justDraggedRef = useRef(false);

  const dayStart = useMemo(() => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [date]);

  const currentZoomConfig = TIMELINE_ZOOM_LEVELS[timelineZoomLevel] || TIMELINE_ZOOM_LEVELS[0];
  const windowDurationMs = currentZoomConfig.durationMs;
  const widthMultiplier = Math.max(1, DAY_MS / windowDurationMs);
  const trackWidthPx = Math.round(containerWidth * widthMultiplier);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateSize = () => {
      setContainerWidth(el.clientWidth || 1000);
      setScrollLeft(el.scrollLeft);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollLeft(scrollRef.current.scrollLeft);
    }
  }, []);

  useEffect(() => {
    if (!playing || dragging) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl || widthMultiplier <= 1) return;
    const playheadPx = (cursorMs / DAY_MS) * trackWidthPx;
    const viewLeft = scrollEl.scrollLeft;
    const viewRight = viewLeft + scrollEl.clientWidth;
    if (playheadPx > viewRight - 60 || playheadPx < viewLeft + 20) {
      scrollEl.scrollLeft = Math.max(0, Math.min(trackWidthPx - scrollEl.clientWidth, playheadPx - scrollEl.clientWidth / 2));
    }
  }, [cursorMs, playing, dragging, widthMultiplier, trackWidthPx]);

  const applyZoom = useCallback(
    (nextLevel, anchorMs = cursorMs, anchorClientX = null) => {
      const scrollEl = scrollRef.current;
      const cWidth = scrollEl?.clientWidth || containerWidth || 1000;
      const nextWindowMs = TIMELINE_ZOOM_LEVELS[nextLevel].durationMs;
      const nextTrackWidth = Math.round(cWidth * (DAY_MS / nextWindowMs));
      let offsetX = cWidth / 2;
      if (anchorClientX !== null && scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        offsetX = Math.max(0, Math.min(cWidth, anchorClientX - rect.left));
      }
      const anchorFrac = anchorMs / DAY_MS;
      const targetScroll = (anchorFrac * nextTrackWidth) - offsetX;
      const maxScroll = Math.max(0, nextTrackWidth - cWidth);
      const clampedScroll = Math.max(0, Math.min(maxScroll, Math.round(targetScroll)));
      pendingScrollLeftRef.current = clampedScroll;
      setScrollLeft(clampedScroll);
      if (scrollEl) scrollEl.scrollLeft = clampedScroll;
      onChangeZoomLevel(nextLevel);
    },
    [cursorMs, containerWidth, onChangeZoomLevel]
  );

  useLayoutEffect(() => {
    if (pendingScrollLeftRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScrollLeftRef.current;
      setScrollLeft(pendingScrollLeftRef.current);
      pendingScrollLeftRef.current = null;
    }
  }, [timelineZoomLevel, trackWidthPx]);

  const handleZoomIn = () => {
    if (timelineZoomLevel >= TIMELINE_ZOOM_LEVELS.length - 1) return;
    applyZoom(timelineZoomLevel + 1);
  };

  const handleZoomOut = () => {
    if (timelineZoomLevel <= 0) return;
    applyZoom(timelineZoomLevel - 1);
  };

  const msFromClientX = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * DAY_MS;
    },
    []
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const zoomingIn = e.deltaY < 0;
      const nextLevel = zoomingIn
        ? Math.min(TIMELINE_ZOOM_LEVELS.length - 1, timelineZoomLevel + 1)
        : Math.max(0, timelineZoomLevel - 1);
      if (nextLevel === timelineZoomLevel) return;
      const hoveredTimeMs = msFromClientX(e.clientX);
      applyZoom(nextLevel, hoveredTimeMs, e.clientX);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [timelineZoomLevel, msFromClientX, applyZoom]);

  const handleTrackClick = (e) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onSeek(msFromClientX(e.clientX));
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    setDragging(true);
    onSeek(msFromClientX(e.clientX));
    const onMove = (ev) => onSeek(msFromClientX(ev.clientX));
    const onUp = (ev) => {
      setDragging(false);
      justDraggedRef.current = true;
      onSeek(msFromClientX(ev.clientX));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handlePointerMove = (e) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ms = (x / rect.width) * DAY_MS;
    setHoverX(x);
    setHoverMs(ms);
  };

  const isRecorded = useCallback(
    (ms) => {
      if (!segments || segments.length === 0) return true;
      const t = dayStart + ms;
      return segments.some((seg) => {
        const s = new Date(seg.start).getTime();
        const e = new Date(seg.end).getTime();
        return t >= s && t <= e;
      });
    },
    [segments, dayStart]
  );

  const thumbStepMs = Math.max(15 * 1000, windowDurationMs / 10);
  const getNearestFrame = useCallback(
    (targetMs) => {
      if (!thumbnailCache || thumbnailCache.size === 0) return null;
      if (thumbnailCache.has(targetMs)) return thumbnailCache.get(targetMs);
      let closestKey = null;
      let minDiff = Infinity;
      const maxDiff = thumbStepMs * 1.5;
      for (const [key] of thumbnailCache.entries()) {
        const diff = Math.abs(key - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          closestKey = key;
        }
      }
      return (closestKey != null && minDiff <= maxDiff) ? thumbnailCache.get(closestKey) : null;
    },
    [thumbnailCache, thumbStepMs]
  );

  const visibleStartMs = Math.max(0, Math.min(DAY_MS, (scrollLeft / Math.max(1, trackWidthPx)) * DAY_MS));
  const visibleEndMs = Math.max(0, Math.min(DAY_MS, ((scrollLeft + containerWidth) / Math.max(1, trackWidthPx)) * DAY_MS));
  const bufferedStartMs = Math.max(0, visibleStartMs - windowDurationMs * 0.3);
  const bufferedEndMs = Math.min(DAY_MS, visibleEndMs + windowDurationMs * 0.3);

  const visibleThumbs = useMemo(() => {
    const list = [];
    for (let t = Math.floor(bufferedStartMs / thumbStepMs) * thumbStepMs; t <= bufferedEndMs; t += thumbStepMs) {
      if (t < 0 || t > DAY_MS) continue;
      const leftPct = (t / DAY_MS) * 100;
      const widthPct = (thumbStepMs / DAY_MS) * 100;
      const frameUrl = getNearestFrame(t);
      const recorded = isRecorded(t);
      list.push({ timeMs: t, leftPct, widthPct, frameUrl, recorded });
    }
    return list;
  }, [bufferedStartMs, bufferedEndMs, thumbStepMs, getNearestFrame, isRecorded]);

  const tickStepSec = currentZoomConfig.tickStepSec;
  const tickStepMs = tickStepSec * 1000;
  const labelStepSec = useMemo(() => getOptimalLabelStepSec(tickStepSec, windowDurationMs, containerWidth, currentZoomConfig.showSeconds), [tickStepSec, windowDurationMs, containerWidth, currentZoomConfig.showSeconds]);

  const visibleTicks = useMemo(() => {
    const ticks = [];
    const start = Math.floor(bufferedStartMs / tickStepMs) * tickStepMs;
    for (let t = start; t <= bufferedEndMs; t += tickStepMs) {
      if (t < 0 || t > DAY_MS) continue;
      const leftPct = (t / DAY_MS) * 100;
      const totalSec = Math.round(t / 1000);
      const showLabel = totalSec % labelStepSec === 0;
      const isMajor = showLabel;
      const label = formatClock(t, currentZoomConfig.showSeconds);
      ticks.push({ timeMs: t, leftPct, label, showLabel, isMajor });
    }
    return ticks;
  }, [bufferedStartMs, bufferedEndMs, tickStepMs, labelStepSec, currentZoomConfig.showSeconds]);

  const cursorPct = (cursorMs / DAY_MS) * 100;
  const cursorPx = (cursorMs / DAY_MS) * trackWidthPx;
  const timeLabelWidth = 76;
  const labelInset = timeLabelWidth / 2 + 4;
  const clampLabelCenter = (x) => Math.max(
    scrollLeft + labelInset,
    Math.min(scrollLeft + containerWidth - labelInset, x)
  );
  const cursorVisible = cursorPx >= scrollLeft && cursorPx <= scrollLeft + containerWidth;
  const cursorLabelOffset = clampLabelCenter(cursorPx) - cursorPx;

  return (
    <div 
      className="flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl border shadow-sm select-none transition-all"
      style={{
        backgroundColor: isDark ? 'var(--bg1)' : '#ffffff',
        borderColor: isDark ? 'var(--bd)' : 'rgba(0,0,0,0.12)'
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: isDark ? '#f1f5f9' : '#000000' }}>
            <Clock size={14} className="text-violet-600 dark:text-violet-400" />
            <span>24-Hour Playback Timeline</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] border" style={{ backgroundColor: isDark ? 'var(--bg2)' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#000000', borderColor: isDark ? 'var(--bd)' : 'rgba(0,0,0,0.12)' }}>
            <span>{new Date(dayStart).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span className="opacity-40">·</span>
            <span className="font-semibold text-violet-600 dark:text-violet-400">{formatClock(cursorMs, true)}</span>
          </div>
          {events.length > 0 && (
            <div className="hidden sm:flex items-center gap-1 text-[11px]" style={{ color: isDark ? '#94a3b8' : '#334155' }}>
              <ShieldAlert size={12} className="text-amber-500" />
              <span>{events.length} event{events.length === 1 ? '' : 's'}</span>
            </div>
          )}
          {loadingMeta && <span className="text-[10px] text-slate-500 font-mono animate-pulse">Syncing timeline…</span>}
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5" style={{ backgroundColor: isDark ? 'var(--bg2)' : '#f8fafc', borderColor: isDark ? 'var(--bd)' : 'rgba(0,0,0,0.12)' }}>
          <button type="button" onClick={handleZoomOut} disabled={timelineZoomLevel === 0} className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 disabled:opacity-30 cursor-pointer" style={{ color: isDark ? '#cbd5e1' : '#000000' }} aria-label="Zoom Out"><ZoomOut size={13} /></button>
          <button type="button" onClick={handleZoomIn} disabled={timelineZoomLevel === TIMELINE_ZOOM_LEVELS.length - 1} className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 disabled:opacity-30 cursor-pointer" style={{ color: isDark ? '#cbd5e1' : '#000000' }} aria-label="Zoom In"><ZoomIn size={13} /></button>
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="relative w-full overflow-x-auto overflow-y-hidden rounded-lg pb-6 pt-7 focus:outline-none" style={{ scrollbarWidth: widthMultiplier > 1 ? 'thin' : 'none', scrollbarColor: isDark ? 'var(--bd) transparent' : 'rgba(0,0,0,0.2) transparent' }}>
        {isHovering && hoverMs !== null && (
          <div className="absolute top-[2px] transform -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900/95 border border-white/20 text-white font-mono text-[10px] font-semibold shadow-md pointer-events-none z-30 whitespace-nowrap text-center" style={{ left: `${clampLabelCenter(hoverX)}px`, width: timeLabelWidth }}>{formatClock(hoverMs, true)}</div>
        )}
        <div ref={trackRef} onClick={handleTrackClick} onPointerDown={handlePointerDown} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => { setIsHovering(false); setHoverMs(null); }} onPointerMove={handlePointerMove} className="relative h-14 sm:h-16 bg-[#0c1017] rounded-lg border cursor-pointer shadow-inner" style={{ width: `${widthMultiplier * 100}%`, minWidth: '100%', borderColor: isDark ? 'var(--bd)' : 'rgba(0,0,0,0.2)' }}>
          <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
            <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #374151 0, #374151 2px, transparent 2px, transparent 8px)' }} />
            {segments.map((seg, i) => {
              const s = new Date(seg.start).getTime();
              const e = new Date(seg.end).getTime();
              const left = Math.max(0, ((s - dayStart) / DAY_MS) * 100);
              const right = Math.min(100, ((e - dayStart) / DAY_MS) * 100);
              return <div key={i} className="absolute top-0 bottom-0 bg-blue-500/10 border-x border-blue-400/30" style={{ left: `${left}%`, width: `${Math.max(0.1, right - left)}%` }} />;
            })}
            {visibleThumbs.map((th) => th.recorded && (
              <div key={th.timeMs} className="absolute top-0 bottom-0 flex flex-col justify-end p-0.5 border-r border-white/10 overflow-hidden pointer-events-none" style={{ left: `${th.leftPct}%`, width: `${th.widthPct}%`, minWidth: 40 }}>
                {th.frameUrl ? <img src={th.frameUrl} alt="" className="w-full h-full object-cover rounded opacity-80" loading="lazy" /> : <div className="w-full h-full bg-slate-800/40 rounded flex items-center justify-center border border-white/5"><span className="text-[8px] font-mono text-white/35">{formatClock(th.timeMs, false)}</span></div>}
                <div className="absolute bottom-0.5 left-1 px-1 py-0.2 rounded bg-black/70 text-[8px] font-mono text-white/80">{formatClock(th.timeMs, currentZoomConfig.showSeconds)}</div>
              </div>
            ))}
            <div className="absolute left-0 top-0 bottom-0 pointer-events-none" style={{ width: `${cursorPct}%`, background: 'linear-gradient(90deg, rgba(37,99,235,0.2) 0%, rgba(6,182,212,0.25) 100%)' }} />
          </div>
          {events.map((ev) => {
            const t = new Date(ev.timeOfIncident).getTime();
            const leftPct = ((t - dayStart) / DAY_MS) * 100;
            if (leftPct < 0 || leftPct > 100) return null;
            return <div key={ev._id} className="absolute top-0 bottom-0 w-1 z-20 pointer-events-none" style={{ left: `${leftPct}%`, backgroundColor: eventColor(ev.incidentType), transform: 'translateX(-50%)' }} />;
          })}
          {isHovering && hoverX > 0 && <div className="absolute top-0 bottom-0 w-[1px] bg-white/50 pointer-events-none z-25" style={{ left: `${hoverX}px` }} />}
          <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none shadow-[0_0_10px_rgba(239,68,68,1)]" style={{ left: `${cursorPct}%` }}>
            {cursorVisible && (
              <div className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded bg-red-600 text-white font-mono text-[10px] font-bold shadow-lg whitespace-nowrap border border-red-400/50 text-center" style={{ left: cursorLabelOffset, width: timeLabelWidth }}>{formatClock(cursorMs, true)}</div>
            )}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-red-500" />
          </div>
        </div>

        {/* ── Dynamic Time Ticks & Ruler ──────────────────────────────── */}
        <div
          className="relative h-6 mt-2 pt-1 font-mono text-[11px] sm:text-xs select-none pointer-events-none border-t transition-colors"
          style={{
            width: `${widthMultiplier * 100}%`,
            minWidth: '100%',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.25)',
          }}
        >
          {visibleTicks.map((tk) => {
            const alignClass =
              tk.leftPct <= 0.5
                ? 'translate-x-0 items-start'
                : tk.leftPct >= 99.5
                ? '-translate-x-full items-end'
                : '-translate-x-1/2 items-center';

            return (
              <div
                key={tk.timeMs}
                className={`absolute top-0 transform flex flex-col ${alignClass}`}
                style={{ left: `${tk.leftPct}%` }}
              >
                <div
                  className={`rounded-full mb-1 transition-colors ${
                    tk.isMajor ? 'h-3' : 'h-1.5'
                  }`}
                  style={{
                    backgroundColor: tk.isMajor
                      ? (isDark ? '#e2e8f0' : '#000000')
                      : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)'),
                    width: tk.isMajor ? '1.5px' : '1px',
                  }}
                />
                {tk.showLabel && (
                  <span
                    className="tracking-tight select-none whitespace-nowrap font-mono text-[11px] sm:text-xs font-bold text-black dark:text-slate-100"
                    style={{
                      color: isDark ? '#f1f5f9' : '#000000',
                    }}
                  >
                    {tk.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
