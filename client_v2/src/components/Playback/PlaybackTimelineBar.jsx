import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, ZoomOut, Clock, ShieldAlert } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { detectionLabel, mediaUrl } from '../../lib/format';
import { fetchIncidentById } from '../../helpers/incidents';
import { incidentPreviewImageUrls } from './incidentPreviewImages';
import { isFutureSeek } from './playbackTimeGuard';
import BufferingIndicator from '../BufferingIndicator';

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
  genericObjectDetection: '#a3e635',
  unauthorizedAccess: '#ef4444',
  lineCrossing: '#f97316',
  fireSmokeDetection: '#dc2626',
  weaponDetection: '#fb7185',
  unattendedBaggageDetection: '#d97706',
  crowdDetection: '#eab308',
  doorDetection: '#06b6d4',
  vehicleDetection: '#0ea5e9',
  deskAbsence: '#84cc16',
  guardAbsence: '#e11d48',
  loiteringDetection: '#d946ef',
  workingAtHeightDetection: '#f59e0b',
  oilLeakageDetection: '#2dd4bf',
  equipmentOilLeakageDetection: '#0891b2',
  vehicleFuelOilLeakageDetection: '#0e7490',
  gunnyBagsMaterialsWrongLocationDetection: '#8b5cf6',
  sandDustWasteScrapDisposalDetection: '#78716c',
  unauthorizedAnimalEntryDetection: '#c084fc',
  spillsDirtyMessyAreasDetection: '#14b8a6',
  loadingUnloadingStockCountingDetection: '#6366f1',
  faceAuthentication: '#2563eb',
  personalProtectiveEquipment: '#22c55e',
  lightDetection: '#fde047',
  guardSleepingDetection: '#be123c',
  conveyorDetection: '#a78bfa',
  crusherDetection: '#a855f7',
  cylinderDetection: '#f472b6',
  waterSpillageDetection: '#38bdf8',
  vehicleObstruction: '#facc15',
  unauthorizedParkingDetection: '#fdba74',
  personFallSickDetection: '#f43f5e',
  vehicleTypeDetection: '#60a5fa',
  tableOccupancyDetection: '#4ade80',
  foodServicePPEDetection: '#10b981',
  mobilePhoneDetection: '#e879f9',
  carModelDetection: '#818cf8',
  vehicleCheckInOut: '#67e8f9',
  blurredCameraDetection: '#94a3b8',
  countPersons: '#bef264',
  countVehicles: '#93c5fd',
  loiteringWithoutAuth: '#c026d3',
  loiteringWithAuth: '#f0abfc',
};

function eventColor(type) {
  if (INCIDENT_COLOR[type]) return INCIDENT_COLOR[type];
  // Keep unlisted detection types stable rather than painting all of them purple.
  let hash = 0;
  for (const char of String(type || 'Detection')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360}, ${65 + (hash % 15)}%, ${55 + (hash % 10)}%)`;
}

// Use the same severity labels and colors as Incident Center.
const INCIDENT_SEVERITY = {
  high: { label: 'HIGH', color: '#ef4444' },
  critical: { label: 'CRIT', color: '#ef4444' },
  moderate: { label: 'MEDIUM', color: '#f59e0b' },
  medium: { label: 'MEDIUM', color: '#f59e0b' },
  low: { label: 'LOW', color: '#6b7796' },
};

function IncidentSeverityBadge({ value }) {
  const severityKey = String(value || '').toLowerCase();
  const severity = INCIDENT_SEVERITY[severityKey] || {
    label: String(value || 'LOW').toUpperCase(),
    color: '#6b7796',
  };
  return (
    <span
      aria-label={`Severity: ${severity.label}`}
      className="shrink-0 rounded font-bold"
      style={{ color: severity.color, border: `1px solid ${severity.color}`, fontSize: 10, lineHeight: '14px', padding: '3px 8px' }}
    >
      {severity.label}
    </span>
  );
}

function previewImageUrls(path) {
  const imagePath = typeof path === 'string' ? path.trim() : '';
  return incidentPreviewImageUrls(imagePath, {
    primaryUrl: mediaUrl(imagePath),
    incidentBase: import.meta.env.VITE_INCIDENT_URL || '',
    backendBase: import.meta.env.VITE_BACKEND || '',
  });
}

function IncidentPreviewImage({ path, incidentId, label, loadIncident }) {
  const [detailPath, setDetailPath] = useState('');
  const [failedUrls, setFailedUrls] = useState(() => new Set());
  const [loadingDetails, setLoadingDetails] = useState(!!incidentId);
  const [loadedUrl, setLoadedUrl] = useState('');
  const imageRef = useRef(null);
  const candidates = [...new Set([...previewImageUrls(detailPath), ...previewImageUrls(path)])];
  const url = candidates.find((candidate) => !failedUrls.has(candidate));

  // This component only mounts for the hovered incident. Reuse the same
  // read-only detail API used by Alerts, with a cache owned by this timeline.
  useEffect(() => {
    let cancelled = false;
    if (!incidentId) { setLoadingDetails(false); return; }
    loadIncident(incidentId).then((incident) => {
      if (cancelled) return;
      setDetailPath(incident?.Image || incident?.image || incident?.imageUrl || '');
      setLoadingDetails(false);
    });
    return () => { cancelled = true; };
  }, [incidentId, loadIncident]);

  useLayoutEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) setLoadedUrl(url);
  }, [url]);

  const loading = url ? loadedUrl !== url : loadingDetails;
  return (
    <div className="relative flex items-center justify-center rounded-md overflow-hidden bg-black/10" style={{ height: 'clamp(80px, 20vh, 144px)', minHeight: 60, flexShrink: 1 }} aria-busy={loading}>
      {url && (
        <img key={url} ref={imageRef} src={url} alt={`${label} incident`} className="w-full h-full object-contain" decoding="async" onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrls((prev) => new Set([...prev, url]))} />
      )}
      {loading && <span className="absolute text-xs opacity-70">Loading incident image…</span>}
      {!url && !loadingDetails && <span className="text-xs opacity-70">Image unavailable</span>}
    </div>
  );
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
  onIncidentSeek,
  segments = [],
  events = [],
  loadingMeta = false,
  playing = false,
  thumbnailCache = new Map(),
  timelineZoomLevel = 0,
  onChangeZoomLevel,
  onFutureSeekAttempt,
  onPreviewRequest,
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
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const [framePreview, setFramePreview] = useState(null);
  const [isHovering, setIsHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const justDraggedRef = useRef(false);
  const previewRef = useRef(null);
  const previewCloseTimerRef = useRef(null);
  const framePreviewTimerRef = useRef(null);
  const framePreviewAbortRef = useRef(null);
  const incidentDetailsRef = useRef(new Map());
  const [incidentPreview, setIncidentPreview] = useState(null);
  const [previewPosition, setPreviewPosition] = useState({ left: 8, bottom: 8, maxHeight: 'calc(100vh - 16px)', width: 300 });

  const dayStart = useMemo(() => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [date]);

  const incidentMarkers = useMemo(() => events.flatMap((event, index) => {
    if (!event?.timeOfIncident) return [];
    const timeMs = new Date(event.timeOfIncident).getTime() - dayStart;
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs >= DAY_MS) return [];
    return [{
      key: `${event._id || 'incident'}-${index}`,
      timeMs,
      label: detectionLabel(event.incidentType),
      name: event.incidentName,
      severity: event.severity,
      color: eventColor(event.incidentType),
      incidentId: event._id || event.id,
      imagePath: event.Image || event.images?.frameImage || event.images?.personImage || event.image || event.imageUrl || event.snapshotUrl || event.carImage || event.carImageUrl,
    }];
  }), [events, dayStart]);

  const cancelPreviewClose = useCallback(() => {
    clearTimeout(previewCloseTimerRef.current);
  }, []);
  const loadPreviewIncident = useCallback((incidentId) => {
    const cache = incidentDetailsRef.current;
    if (!cache.has(incidentId)) {
      const request = fetchIncidentById(incidentId).catch(() => {
        // A temporary detail failure must not poison later hovers.
        if (cache.get(incidentId) === request) cache.delete(incidentId);
        return null;
      });
      cache.set(incidentId, request);
    }
    return cache.get(incidentId);
  }, []);
  const closeIncidentPreview = useCallback(() => {
    clearTimeout(previewCloseTimerRef.current);
    setIncidentPreview(null);
  }, []);
  const schedulePreviewClose = useCallback(() => {
    clearTimeout(previewCloseTimerRef.current);
    previewCloseTimerRef.current = setTimeout(() => setIncidentPreview(null), 200);
  }, []);

  useEffect(() => {
    incidentDetailsRef.current.clear();
    closeIncidentPreview();
  }, [incidentMarkers, closeIncidentPreview]);
  useEffect(() => { closeIncidentPreview(); }, [timelineZoomLevel, closeIncidentPreview]);
  useEffect(() => () => clearTimeout(previewCloseTimerRef.current), []);

  const showIncidentPreview = (marker, element) => {
    if (dragging) return;
    cancelPreviewClose();
    const trackWidth = trackRef.current?.getBoundingClientRect().width || trackWidthPx;
    // At the 24-hour scale several incidents can occupy the same few pixels.
    const nearby = incidentMarkers.filter((item) => Math.abs(item.timeMs - marker.timeMs) / DAY_MS * trackWidth <= 8);
    nearby.sort((a, b) => a.timeMs - b.timeMs);
    const rect = element.getBoundingClientRect();
    setIncidentPreview({ items: nearby, activeKey: marker.key, anchor: { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom } });
  };

  useLayoutEffect(() => {
    if (!incidentPreview || !scrollRef.current) return;
    const { anchor } = incidentPreview;
    const timeline = scrollRef.current.getBoundingClientRect();
    const leftEdge = Math.max(8, timeline.left);
    const rightEdge = Math.min(window.innerWidth - 8, timeline.right);
    const width = Math.min(300, Math.max(0, rightEdge - leftEdge));
    // The scroll area starts with the red/blue time-label row above the track.
    // Keep the preview above that row so both the time and track stay visible.
    const previewBottom = Math.min(window.innerHeight - 8, timeline.top - 8);
    setPreviewPosition({
      left: Math.max(leftEdge, Math.min(rightEdge - width, anchor.x - width / 2)),
      bottom: window.innerHeight - previewBottom,
      maxHeight: Math.max(0, previewBottom - 8),
      width,
    });
  }, [incidentPreview]);

  useEffect(() => {
    if (!incidentPreview) return;
    const onScroll = (event) => {
      if (!previewRef.current?.contains(event.target)) closeIncidentPreview();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeIncidentPreview();
    };
    const onPointerDown = (event) => {
      if (!previewRef.current?.contains(event.target) && !trackRef.current?.contains(event.target)) closeIncidentPreview();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closeIncidentPreview);
    document.addEventListener('fullscreenchange', closeIncidentPreview);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeIncidentPreview);
      document.removeEventListener('fullscreenchange', closeIncidentPreview);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [incidentPreview, closeIncidentPreview]);

  const lastFutureWarningRef = useRef(0);
  const notifyFutureSeek = useCallback(() => {
    const now = Date.now();
    if (now - lastFutureWarningRef.current > 1000) {
      lastFutureWarningRef.current = now;
      onFutureSeekAttempt?.();
    }
  }, [onFutureSeekAttempt]);

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
    closeIncidentPreview();
    if (scrollRef.current) {
      setScrollLeft(scrollRef.current.scrollLeft);
    }
  }, [closeIncidentPreview]);

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
    const ms = msFromClientX(e.clientX);
    if (isFutureSeek(dayStart, ms)) {
      lastFutureWarningRef.current = Date.now();
      onFutureSeekAttempt?.();
      return;
    }
    onSeek(ms);
  };

  const handlePointerDown = (e) => {
    closeIncidentPreview();
    e.preventDefault();
    const ms = msFromClientX(e.clientX);
    if (isFutureSeek(dayStart, ms)) {
      lastFutureWarningRef.current = Date.now();
      onFutureSeekAttempt?.();
      return;
    }
    setDragging(true);
    onSeek(ms);
    const onMove = (ev) => {
      const moveMs = msFromClientX(ev.clientX);
      if (isFutureSeek(dayStart, moveMs)) {
        notifyFutureSeek();
        return;
      }
      onSeek(moveMs);
    };
    const onUp = (ev) => {
      setDragging(false);
      justDraggedRef.current = true;
      const upMs = msFromClientX(ev.clientX);
      if (isFutureSeek(dayStart, upMs)) {
        notifyFutureSeek();
      } else {
        onSeek(upMs);
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const seekToIncident = (marker, e) => {
    e.stopPropagation();
    // Marker clicks must not also start the parent track's drag-to-seek path.
    justDraggedRef.current = false;
    if (isFutureSeek(dayStart, marker.timeMs)) {
      notifyFutureSeek();
      return;
    }
    closeIncidentPreview();
    (onIncidentSeek || onSeek)(marker.timeMs);
  };

  const handlePointerMove = (e) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ms = (x / rect.width) * DAY_MS;
    setHoverX(x);
    setHoverMs(ms);
    setHoverAnchor({ x: e.clientX, y: rect.top });
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

  // Fetch only after the pointer rests. Each response is a five-second
  // animated WebP. At second two, preload the following window so the preview
  // and its clock can continue without touching the main playback session.
  useEffect(() => {
    clearTimeout(framePreviewTimerRef.current);
    framePreviewAbortRef.current?.abort();
    framePreviewAbortRef.current = null;

    const eligible = onPreviewRequest && isHovering && !dragging &&
      hoverMs !== null && !isFutureSeek(dayStart, hoverMs) && isRecorded(hoverMs);
    if (!eligible) {
      setFramePreview(null);
      return undefined;
    }

    const requestedMs = hoverMs;
    const controller = new AbortController();
    framePreviewAbortRef.current = controller;
    setFramePreview({ timeMs: requestedMs, url: '', loading: true, unavailable: false });
    framePreviewTimerRef.current = setTimeout(async () => {
      const wait = (milliseconds) => new Promise((resolve) => {
        framePreviewTimerRef.current = setTimeout(resolve, milliseconds);
      });
      const normalizePreview = (result, fallbackTimeMs) => {
        if (!result) return null;
        if (typeof result === 'string') return { url: result, timeMs: fallbackTimeMs };
        return result.url ? { url: result.url, timeMs: result.timeMs ?? fallbackTimeMs } : null;
      };
      try {
        let clip = normalizePreview(
          await onPreviewRequest(requestedMs, { signal: controller.signal }),
          requestedMs,
        );
        while (!controller.signal.aborted && clip) {
          setFramePreview({
            timeMs: clip.timeMs,
            url: clip.url,
            loading: false,
            unavailable: false,
          });

          let nextRequest = null;
          for (let elapsed = 1; elapsed <= 5; elapsed += 1) {
            await wait(1000);
            if (controller.signal.aborted) return;
            if (elapsed < 5) {
              setFramePreview((current) => current && ({
                ...current,
                timeMs: clip.timeMs + elapsed * 1000,
              }));
            }
            if (elapsed === 2) {
              nextRequest = onPreviewRequest(clip.timeMs + 5000, {
                signal: controller.signal,
              });
            }
          }

          setFramePreview((current) => current && ({ ...current, loading: true }));
          const next = normalizePreview(
            await (nextRequest || onPreviewRequest(clip.timeMs + 5000, {
              signal: controller.signal,
            })),
            clip.timeMs + 5000,
          );
          if (!next) {
            setFramePreview((current) => current && ({
              ...current,
              loading: false,
              unavailable: true,
            }));
            return;
          }
          clip = next;
        }
      } catch (error) {
        if (!controller.signal.aborted && error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
          setFramePreview((current) => ({
            timeMs: current?.timeMs ?? requestedMs,
            url: current?.url || '',
            loading: false,
            unavailable: true,
          }));
        }
      }
    }, 350);

    return () => {
      clearTimeout(framePreviewTimerRef.current);
      controller.abort();
    };
  }, [hoverMs, isHovering, dragging, dayStart, isRecorded, onPreviewRequest]);

  useEffect(() => () => {
    clearTimeout(framePreviewTimerRef.current);
    framePreviewAbortRef.current?.abort();
  }, []);

  const futureStartMs = Math.max(0, Math.min(DAY_MS, Date.now() - dayStart));
  const recordingRanges = useMemo(() => {
    // NVR searches can return touching or overlapping recording fragments.
    // Draw their coverage once so fragment borders do not stack into stripes.
    const ranges = segments.flatMap((segment) => {
      const start = Math.max(0, new Date(segment.start).getTime() - dayStart);
      const end = Math.min(DAY_MS, new Date(segment.end).getTime() - dayStart);
      return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
    }).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
    }
    return merged;
  }, [segments, dayStart]);
  const thumbStepMs = Math.max(15 * 1000, windowDurationMs / 10);
  const getNearestFrame = useCallback(
    (targetMs) => {
      if (targetMs >= futureStartMs || !thumbnailCache || thumbnailCache.size === 0) return null;
      if (thumbnailCache.has(targetMs)) return thumbnailCache.get(targetMs);
      let closestKey = null;
      let minDiff = Infinity;
      const maxDiff = thumbStepMs * 1.5;
      for (const [key] of thumbnailCache.entries()) {
        if (key >= futureStartMs) continue;
        const diff = Math.abs(key - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          closestKey = key;
        }
      }
      return (closestKey != null && minDiff <= maxDiff) ? thumbnailCache.get(closestKey) : null;
    },
    [thumbnailCache, thumbStepMs, futureStartMs]
  );

  const visibleStartMs = Math.max(0, Math.min(DAY_MS, (scrollLeft / Math.max(1, trackWidthPx)) * DAY_MS));
  const visibleEndMs = Math.max(0, Math.min(DAY_MS, ((scrollLeft + containerWidth) / Math.max(1, trackWidthPx)) * DAY_MS));
  const bufferedStartMs = Math.max(0, visibleStartMs - windowDurationMs * 0.3);
  const bufferedEndMs = Math.min(DAY_MS, visibleEndMs + windowDurationMs * 0.3);

  const visibleThumbs = useMemo(() => {
    const list = [];
    for (let t = Math.floor(bufferedStartMs / thumbStepMs) * thumbStepMs; t <= bufferedEndMs; t += thumbStepMs) {
      if (t < 0 || t >= DAY_MS) continue;
      const leftPct = (t / DAY_MS) * 100;
      const widthPct = (Math.min(thumbStepMs, DAY_MS - t) / DAY_MS) * 100;
      const future = t >= futureStartMs;
      const recorded = !future && isRecorded(t);
      const frameUrl = recorded ? getNearestFrame(t) : null;
      list.push({ timeMs: t, leftPct, widthPct, frameUrl, recorded, future });
    }
    return list;
  }, [bufferedStartMs, bufferedEndMs, thumbStepMs, getNearestFrame, isRecorded, futureStartMs]);

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
  const previewIncident = incidentPreview?.items.find((item) => item.key === incidentPreview.activeKey);

  return (
    <div 
      className="vq-pbtl-timeline relative flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl border shadow-sm select-none transition-all"
      style={{
        flexShrink: 0,
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

      <div ref={scrollRef} onScroll={handleScroll} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => { setIsHovering(false); setHoverMs(null); setHoverAnchor(null); }} onPointerMove={handlePointerMove} className="vq-pbtl-scroll relative w-full overflow-x-auto overflow-y-hidden rounded-lg pb-6 pt-7 focus:outline-none" style={{ scrollbarWidth: widthMultiplier > 1 ? 'thin' : 'none', scrollbarColor: isDark ? 'var(--bd) transparent' : 'rgba(0,0,0,0.2) transparent' }}>
        {isHovering && hoverMs !== null && (
          <div className="absolute top-[2px] transform -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900/95 border border-white/20 text-white font-mono text-[10px] font-semibold shadow-md pointer-events-none z-40 whitespace-nowrap text-center" style={{ left: `${clampLabelCenter(hoverX)}px`, width: timeLabelWidth }}>{formatClock(hoverMs, true)}</div>
        )}
        <div ref={trackRef} onClick={handleTrackClick} onPointerDown={handlePointerDown} className="relative h-14 sm:h-16 bg-[#0c1017] rounded-lg border cursor-pointer shadow-inner" style={{ width: `${widthMultiplier * 100}%`, minWidth: '100%', borderColor: isDark ? 'var(--bd)' : 'rgba(0,0,0,0.2)', cursor: isHovering && hoverMs !== null && isFutureSeek(dayStart, hoverMs) ? 'not-allowed' : 'pointer' }}>
          <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
            <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #374151 0, #374151 2px, transparent 2px, transparent 8px)' }} />
            {recordingRanges.map((range) => (
              <div key={range.start} className="absolute top-0 bottom-0 bg-blue-500/10" style={{ left: `${range.start / DAY_MS * 100}%`, width: `${(range.end - range.start) / DAY_MS * 100}%` }} />
            ))}
            {visibleThumbs.map((th) => (
              <div key={th.timeMs} className="absolute top-0 bottom-0 flex flex-col justify-end p-0.5 border-r border-white/10 overflow-hidden pointer-events-none" style={{ left: `${th.leftPct}%`, width: `${th.widthPct}%` }}>
                {th.frameUrl ? <img src={th.frameUrl} alt="" className="w-full h-full object-cover rounded opacity-80" loading="lazy" /> : <div className={`w-full h-full rounded border border-white/5 ${th.recorded ? 'bg-slate-800/40' : 'bg-slate-800/10'}`} />}
                <div className="absolute bottom-0.5 left-1 px-1 py-0.2 rounded bg-black/70 text-[8px] font-mono" style={{ color: th.future ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.8)' }}>{formatClock(th.timeMs, currentZoomConfig.showSeconds)}</div>
              </div>
            ))}
            <div className="absolute left-0 top-0 bottom-0 pointer-events-none" style={{ width: `${cursorPct}%`, background: 'linear-gradient(90deg, rgba(37,99,235,0.2) 0%, rgba(6,182,212,0.25) 100%)' }} />
            {futureStartMs < DAY_MS && <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ left: `${(futureStartMs / DAY_MS) * 100}%`, backgroundColor: 'rgba(12,16,23,0.45)' }} />}
          </div>
          {incidentMarkers.map((marker) => (
            <button
              key={marker.key}
              type="button"
              aria-label={`${marker.label} at ${formatClock(marker.timeMs)}. Jump to incident.`}
              aria-haspopup="dialog"
              className="absolute top-0 bottom-0 w-2 z-20 p-0 border-0 bg-transparent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              style={{ left: `${marker.timeMs / DAY_MS * 100}%`, transform: 'translateX(-50%)' }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => seekToIncident(marker, e)}
              onMouseEnter={(e) => showIncidentPreview(marker, e.currentTarget)}
              onMouseLeave={schedulePreviewClose}
              onFocus={(e) => showIncidentPreview(marker, e.currentTarget)}
              onBlur={(e) => { if (!previewRef.current?.contains(e.relatedTarget)) schedulePreviewClose(); }}
            >
              <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 pointer-events-none" style={{ backgroundColor: marker.color }} />
            </button>
          ))}
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
      {previewIncident && createPortal(
        <div
          ref={previewRef}
          role="dialog"
          aria-label="Incident preview"
          className="fixed flex flex-col rounded-xl border p-3 shadow-2xl text-sm"
          style={{ ...previewPosition, overflow: 'hidden', zIndex: 10000, fontFamily: 'var(--ui)', backgroundColor: isDark ? '#111827' : '#ffffff', color: isDark ? '#f1f5f9' : '#0f172a', borderColor: isDark ? '#334155' : '#cbd5e1' }}
          onMouseEnter={cancelPreviewClose}
          onMouseLeave={schedulePreviewClose}
          onFocusCapture={cancelPreviewClose}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) schedulePreviewClose(); }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: previewIncident.color }} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold break-words">{previewIncident.label}</div>
              {previewIncident.name && previewIncident.name !== previewIncident.label && <div className="text-xs opacity-75 break-words">{previewIncident.name}</div>}
              <div className="font-mono text-xs mt-1">{formatClock(previewIncident.timeMs)}</div>
            </div>
            <IncidentSeverityBadge value={previewIncident.severity} />
          </div>
          <IncidentPreviewImage key={`${previewIncident.key}-${previewIncident.imagePath || ''}`} path={previewIncident.imagePath} incidentId={previewIncident.incidentId} label={previewIncident.label} loadIncident={loadPreviewIncident} />
          {incidentPreview.items.length > 1 && (
            <div className="mt-2 flex flex-col min-h-0" style={{ flex: '0 1 auto' }}>
              <div className="shrink-0 text-xs opacity-75 mb-1">{incidentPreview.items.length} nearby incidents — select to jump</div>
              <div className="min-h-0 max-h-28 overflow-y-auto space-y-1" style={{ overscrollBehavior: 'contain' }}>
                {incidentPreview.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="w-full flex items-center gap-2 rounded p-1.5 text-left text-xs hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
                    style={{ color: isDark ? '#f1f5f9' : '#0f172a', backgroundColor: item.key === previewIncident.key ? (isDark ? '#334155' : '#e2e8f0') : undefined }}
                    onMouseEnter={() => setIncidentPreview((prev) => prev && ({ ...prev, activeKey: item.key }))}
                    onFocus={() => setIncidentPreview((prev) => prev && ({ ...prev, activeKey: item.key }))}
                    onClick={(e) => seekToIncident(item, e)}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="flex-1">{item.label}</span>
                    <span className="font-mono shrink-0">{formatClock(item.timeMs)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="w-full mt-2 shrink-0 rounded-md py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400" style={{ backgroundColor: '#7c3aed', color: '#ffffff', minHeight: 36, cursor: 'pointer' }} onClick={(e) => seekToIncident(previewIncident, e)}>Jump to {formatClock(previewIncident.timeMs)}</button>
        </div>,
        document.fullscreenElement || document.body
      )}
      {framePreview && hoverAnchor && !incidentPreview && createPortal(
        <div
          aria-live="polite"
          className="fixed overflow-hidden rounded-lg border shadow-2xl pointer-events-none"
          style={{
            zIndex: 9999,
            width: 208,
            left: Math.max(8, Math.min(window.innerWidth - 216, hoverAnchor.x - 104)),
            top: Math.max(8, hoverAnchor.y - 142),
            backgroundColor: isDark ? '#111827' : '#ffffff',
            borderColor: isDark ? '#475569' : '#cbd5e1',
            color: isDark ? '#f8fafc' : '#0f172a',
          }}
        >
          <div className="relative flex h-[108px] items-center justify-center bg-black">
            {framePreview.url && (
              <img src={framePreview.url} alt="Playback frame preview" className="h-full w-full object-contain" />
            )}
            {framePreview.loading && (
              <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-950/90 via-slate-900/90 to-violet-950/80">
                <BufferingIndicator title="Loading preview..." size={38} compact />
              </div>
            )}
            {framePreview.unavailable && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/75 text-xs text-white/60">
                Preview unavailable
              </span>
            )}
          </div>
          <div className="px-2 py-1.5 text-center font-mono text-[11px] font-semibold">
            {formatClock(framePreview.timeMs, true)}
          </div>
        </div>,
        document.fullscreenElement || document.body
      )}
    </div>
  );
}
