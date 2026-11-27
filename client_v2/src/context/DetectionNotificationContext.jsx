import { useDetectionLabels } from '@/context/DetectionDisplayNamesContext';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { router } from '@/App';
import { Bell, ChevronDown, ChevronLeft, ChevronUp, GripHorizontal, LoaderCircle, Trash2, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { usePermissions } from './PermissionContext';
import { incidentTimestamp, timeOfDay } from '../lib/format';
import getAccessToken from '@/utils/getAccessToken';
import { registerWebPush, webPushActive } from '@/utils/webPush';

export const DESKTOP_NOTIFICATIONS_KEY = 'vq_desktop_notifications_enabled';
export const IN_APP_NOTIFICATIONS_KEY = 'vq_inapp_notifications_enabled';
export const NOTIFICATION_STACK_EXPANDED_KEY = 'vq_notification_stack_expanded';
const DetectionNotificationContext = createContext(null);

export function useNotifyFetchedDetection() {
  return useContext(DetectionNotificationContext);
}

export function desktopNotificationsEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) !== 'false';
}

export function inAppNotificationsEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(IN_APP_NOTIFICATIONS_KEY) !== 'false';
}

function notificationKey(detection) {
  const id = detection?._id || detection?.id || detection?.incidentId;
  const timestamp = incidentTimestamp(detection);
  const epoch = new Date(timestamp).getTime();
  if (id) return JSON.stringify([String(id), Number.isFinite(epoch) ? epoch : timestamp]);
  return [
    detection?._id,
    detection?.nvrId?._id || detection?.nvrId,
    detection?.cameraId?._id || detection?.cameraId,
    detection?.channelId?._id || detection?.channelId,
    detection?.incidentType || detection?.incidentName || detection?.displayName,
    incidentTimestamp(detection),
  ].filter(Boolean).join('_');
}

function severityBucket(severity) {
  const value = String(severity || '').toLowerCase();
  if (value === 'high' || value === 'critical') return 'critical';
  if (value === 'moderate' || value === 'medium') return 'warning';
  return 'info';
}

const SEVERITY_COLOR = {
  critical: 'var(--crit)',
  warning: 'var(--warn)',
  info: 'var(--blue)',
};

// Each alert gets its own display window once it reaches the front of the queue.
// Hovering pauses that window so the alert stays available for interaction.
const ALERT_DURATION = 12000;
// Keep the existing dismissal timing, but wait for the full visual exit sequence
// before removing the row from React so the reference animation can complete.
const ALERT_EXIT_DURATION = 1200;
const COMPACT_PILL_WIDTH = 60;
const COMPACT_PILL_HEIGHT = 56;

function alertDurationForCount(count) {
  if (count > 20) return 5000;
  if (count > 10) return 8000;
  return ALERT_DURATION;
}

function cameraLabel(detection) {
  return (
    detection?.channelName ||
    detection?.channelData?.name ||
    detection?.channelData?.customName ||
    detection?.cameraName ||
    detection?.cameraId?.name ||
    detection?.cameraId?.customName ||
    detection?.channelId?.name ||
    detection?.channelId?.customName ||
    'Camera'
  );
}

// Human labels for detection slugs / settingTypes that arrive on the socket
// payload as raw identifiers (e.g. "guardSleepingDetection"). Extend as needed;
// anything not listed falls back to a title-cased version of the slug.
const DETECTION_LABELS = {
  cylinderDetection: 'Cylinder Detection',
  cylinderDetectionSettings: 'Cylinder Detection',
  guardSleepingDetection: 'Sleep Activity Detection',
  guardSleepingDetectionSettings: 'Sleep Activity Detection',
  guardAbsence: 'Guard Absence Detection',
  guardAbsenceSettings: 'Guard Absence Detection',
  deskAbsence: 'Desk Absence Detection',
  deskAbsenceSettings: 'Desk Absence Detection',
  workingAtHeightDetection: 'Working at Height Detection',
  workingAtHeightDetectionSettings: 'Working at Height Detection',
  oilLeakageDetection: 'Oil Leakage Detection',
  oilLeakageDetectionSettings: 'Oil Leakage Detection',
  equipmentOilLeakageDetection: 'Equipment Oil Leakage Detection',
  equipmentOilLeakageDetectionSettings: 'Equipment Oil Leakage Detection',
  vehicleFuelOilLeakageDetection: 'Vehicle Fuel/Oil Leakage Detection',
  vehicleFuelOilLeakageDetectionSettings: 'Vehicle Fuel/Oil Leakage Detection',
  gunnyBagsMaterialsWrongLocationDetection: 'Gunny Bags/Materials Wrong Location Detection',
  gunnyBagsMaterialsWrongLocationDetectionSettings: 'Gunny Bags/Materials Wrong Location Detection',
  sandDustWasteScrapDisposalDetection: 'Sand, Dust, Waste & Scrap Disposal Detection',
  sandDustWasteScrapDisposalDetectionSettings: 'Sand, Dust, Waste & Scrap Disposal Detection',
  unauthorizedAnimalEntryDetection: 'Unauthorized Animal Entry Detection',
  unauthorizedAnimalEntryDetectionSettings: 'Unauthorized Animal Entry Detection',
  spillsDirtyMessyAreasDetection: 'Spills, Dirty or Messy Areas Detection',
  spillsDirtyMessyAreasDetectionSettings: 'Spills, Dirty or Messy Areas Detection',
  loadingUnloadingStockCountingDetection: 'Loading/Unloading Stock Counting Detection',
  sackLoadingUnloadingDetection: 'Sack Loading/Unloading Detection',
  loadingUnloadingStockCountingSettings: 'Loading/Unloading Stock Counting Detection',
  sackLoadingUnloadingSettings: 'Sack Loading/Unloading Detection',
  blurredCameraDetection: 'Camera Tampering Detection',
  emotionDetection: 'Emotion Detection',
  genderAgeDetection: 'Gender & Age Detection',
  machineOpsDetection: 'Machine Operations Detection',
  blurredCameraDetectionSettings: 'Camera Tampering Detection',
  deskSolarShoulderDetection: 'Desk Solar Shoulder Detection',
  boxPackingDetection: 'Box Packing Detection',
  deskSolarShoulderDetectionSettings: 'Desk Solar Shoulder Detection',
  boxPackingDetectionSettings: 'Box Packing Detection',
  lightingVisibilitySiteConditionsDetection: 'Lighting / Visibility / Site Conditions Detection',
  lightingVisibilitySiteConditionsDetectionSettings: 'Lighting / Visibility / Site Conditions Detection',
  hygieneSanitationFoodSafetyDetection: 'Hygiene, Sanitation & Food Safety Detection',
  hygieneSanitationFoodSafetyDetectionSettings: 'Hygiene, Sanitation & Food Safety Detection',
};

function prettifySlug(value) {
  return String(value || '')
    .replace(/Settings$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectionTitle(detection) {
  const raw =
    detection?.incidentType ||
    detection?.incidentName ||
    detection?.displayName ||
    detection?.detectionType;
  if (!raw) return 'Detection';
  return DETECTION_LABELS[raw] || prettifySlug(raw);
}

function detectionTime(detection) {
  return timeOfDay(incidentTimestamp(detection)) || 'Unknown time';
}

function AlertRow({ alert, showDivider, exiting, onDismiss, onOpen }) {
  const color = SEVERITY_COLOR[alert.severity] || SEVERITY_COLOR.info;
  return (
    <li
      className={`nm-wrap ${exiting ? 'is-going' : 'vq-fadeup'}`}
      style={{ borderTop: showDivider ? '1px solid var(--bd)' : 'none' }}
    >
      <div className="nm-item flex list-none items-start gap-2.5 px-3.5 py-4">
        <span
          className="nm-bell flex h-7 w-7 flex-none items-center justify-center rounded-full"
          style={{ background: `${color}1a`, color }}
        >
          <Bell size={14} strokeWidth={2} />
        </span>
        <button type="button" onClick={() => onOpen(alert)} className="min-w-0 flex-1 cursor-pointer text-left" aria-label={`Open ${alert.title} alert`}>
          <div className="truncate text-[13px] font-semibold leading-tight" style={{ color: 'var(--tx)' }}>
            {alert.title}
          </div>
          <div className="mt-1 truncate text-[11.5px] leading-tight" style={{ color: 'var(--tx2)' }}>
            {alert.description}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          aria-label={`Dismiss ${alert.title} alert`}
          className="nm-x flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-md text-[var(--tx3)] transition-colors hover:bg-[var(--bg2)] hover:text-[var(--tx)]"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
    </li>
  );
}

/**
 * Floating stack of active detection alerts, portalled to <body> so it can't
 * be clipped or offset by whatever page happens to be mounted underneath it.
 * Render the original scrollable alert stack while animating rows before removal.
 */
function DetectionAlertStack({ alerts, onDismiss, onClearAll, onOpen }) {
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(() => {
    try {
      return window.localStorage.getItem(NOTIFICATION_STACK_EXPANDED_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [compactMinimized, setCompactMinimized] = useState(false);
  const [compactHovered, setCompactHovered] = useState(false);
  const [compactPosition, setCompactPosition] = useState(null);
  const [expandedPosition, setExpandedPosition] = useState(null);
  const [viewport, setViewport] = useState(() => typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight });
  const [dragging, setDragging] = useState(false);
  const [clearing, setClearing] = useState(false);
  const remainingRef = useRef(ALERT_DURATION);
  const startedRef = useRef(0);
  const currentIdRef = useRef(null);
  const compactTargetRef = useRef(null);
  const stackRef = useRef(null);
  const alertListRef = useRef(null);
  const followLatestRef = useRef(true);
  const dragRef = useRef(null);
  const suppressDragClickRef = useRef(false);
  const hoverTimerRef = useRef(null);
  const exitTimersRef = useRef(new Map());
  const [exitingIds, setExitingIds] = useState(() => new Set());
  const orderedAlerts = useMemo(() => [...alerts].sort((a, b) => a.timestamp - b.timestamp), [alerts]);
  const active = orderedAlerts[0];
  const hasAlerts = alerts.length > 0;
  const isCompact = !expanded;
  const compactPeek = isCompact && (dragging || (compactMinimized && !compactHovered && !clearing));
  const compactLeft = compactPosition
    ? `clamp(0px, ${compactPosition.left}px, calc(100vw - var(--vq-alert-peek-width)))`
    : 'var(--vq-alert-compact-left)';
  const compactBottom = compactPosition
    ? `clamp(0px, ${compactPosition.bottom}px, calc(100dvh - var(--vq-alert-compact-height)))`
    : '16px';
  const expandLeft = compactPosition !== null && compactPosition.left + COMPACT_PILL_WIDTH / 2 >= viewport.width / 2;
  const expandDown = compactPosition !== null && compactPosition.bottom + COMPACT_PILL_HEIGHT / 2 >= viewport.height / 2;
  const ExpandChevron = expandDown ? ChevronDown : ChevronUp;
  const CollapseChevron = expandDown ? ChevronUp : ChevronDown;
  const panelWidth = isCompact ? 'var(--vq-alert-summary-width)' : 'min(340px, calc(100vw - 24px))';
  const panelLeft = expandLeft ? `calc(${compactLeft} + var(--vq-alert-peek-width) - ${panelWidth})` : compactLeft;
  const panelTop = `calc(100dvh - ${compactBottom} - var(--vq-alert-compact-height))`;
  const draggedPanel = !isCompact ? expandedPosition : null;
  const draggedTop = draggedPanel ? `clamp(0px, ${draggedPanel.top}px, calc(100dvh - 120px))` : undefined;
  const alertDuration = alertDurationForCount(alerts.length);

  useLayoutEffect(() => {
    const list = alertListRef.current;
    if (list && followLatestRef.current) list.scrollTop = list.scrollHeight;
  }, [isCompact, orderedAlerts]);

  const updateExpanded = (next) => {
    if (next) followLatestRef.current = true;
    setExpanded(next);
    try {
      window.localStorage.setItem(NOTIFICATION_STACK_EXPANDED_KEY, String(next));
    } catch {}
  };

  const dismissWithAnimation = useCallback((id) => {
    if (!id || exitTimersRef.current.has(id) || exitTimersRef.current.has('__clear_all__')) return;
    setExitingIds((prev) => new Set(prev).add(id));
    const timer = setTimeout(() => {
      exitTimersRef.current.delete(id);
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      onDismiss(id);
    }, ALERT_EXIT_DURATION);
    exitTimersRef.current.set(id, timer);
  }, [onDismiss]);

  const clearAllWithAnimation = useCallback(() => {
    if (!alerts.length || exitTimersRef.current.has('__clear_all__')) return;
    setClearing(true);
    exitTimersRef.current.forEach((timer) => clearTimeout(timer));
    exitTimersRef.current.clear();
    alerts.forEach((alert) => {
      setExitingIds((prev) => new Set(prev).add(alert.id));
    });
    const timer = setTimeout(() => {
      exitTimersRef.current.clear();
      setExitingIds(new Set());
      setClearing(false);
      onClearAll();
    }, ALERT_EXIT_DURATION);
    exitTimersRef.current.set('__clear_all__', timer);
  }, [alerts, onClearAll]);

  useEffect(() => () => {
    clearTimeout(hoverTimerRef.current);
    exitTimersRef.current.forEach((timer) => clearTimeout(timer));
    exitTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!alerts.length) setPaused(false);
  }, [alerts.length]);

  useEffect(() => {
    if (!isCompact || !hasAlerts) {
      setCompactMinimized(false);
      setCompactHovered(false);
      return undefined;
    }
    if (paused || clearing || compactMinimized) return undefined;
    const timer = setTimeout(() => setCompactMinimized(true), 3000);
    return () => clearTimeout(timer);
  }, [isCompact, hasAlerts, paused, clearing, compactMinimized]);

  useEffect(() => {
    if (active?.id !== currentIdRef.current) {
      currentIdRef.current = active?.id ?? null;
      remainingRef.current = alertDuration;
    } else if (alertDuration < remainingRef.current) {
      // If a burst pushes the stack over a threshold, shorten the current
      // alert's remaining time as well instead of waiting for the old timer.
      remainingRef.current = alertDuration;
    }
    if (!active || paused || clearing) return undefined;
    startedRef.current = Date.now();
    const timer = setTimeout(() => dismissWithAnimation(active.id), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
    };
  }, [active?.id, alertDuration, paused, clearing, dismissWithAnimation]);

  if (!alerts.length || typeof document === 'undefined') return null;

  const handleStackMouseEnter = ({ clientX, clientY }) => {
    if (dragRef.current || clearing) return;
    if (isCompact && compactMinimized) {
      const target = compactTargetRef.current?.getBoundingClientRect();
      if (!target || clientX < target.left || clientX >= target.right || clientY < target.top || clientY >= target.bottom) return;
      if (hoverTimerRef.current == null) {
        hoverTimerRef.current = setTimeout(() => {
          hoverTimerRef.current = null;
          setCompactHovered(true);
        }, 220);
      }
    }
    setPaused(true);
  };

  const handleStackMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    if (dragRef.current) return;
    setPaused(false);
    setCompactHovered(false);
  };

  const startStackDrag = (event) => {
    if (!event.isPrimary || event.button !== 0 || clearing) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    const rect = (isCompact ? event.currentTarget : stackRef.current).getBoundingClientRect();
    dragRef.current = {
      expanded: !isCompact,
      width: rect.width,
      height: rect.height,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: isCompact ? Math.min(event.clientX - rect.left, COMPACT_PILL_WIDTH / 2) : event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPaused(true);
  };

  const moveStackDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      if (!drag.expanded) {
        setExpandedPosition(null);
        setCompactMinimized(true);
        setCompactHovered(false);
      }
    }
    const { clientWidth, clientHeight } = document.documentElement;
    if (drag.expanded) {
      const left = Math.max(0, Math.min(clientWidth - drag.width, event.clientX - drag.offsetX));
      const top = Math.max(0, Math.min(clientHeight - drag.height, event.clientY - drag.offsetY));
      const onRight = left + drag.width / 2 >= clientWidth / 2;
      const onTop = top + drag.height / 2 < clientHeight / 2;
      setExpandedPosition({ left, top });
      setCompactPosition({
        left: onRight ? left + drag.width - COMPACT_PILL_WIDTH : left,
        bottom: clientHeight - top - (onTop ? COMPACT_PILL_HEIGHT : drag.height),
      });
      return;
    }
    const width = compactTargetRef.current?.offsetWidth || COMPACT_PILL_WIDTH;
    const height = compactTargetRef.current?.offsetHeight || COMPACT_PILL_HEIGHT;
    setCompactPosition({
      left: Math.max(0, Math.min(clientWidth - width, event.clientX - drag.offsetX)),
      bottom: Math.max(0, Math.min(clientHeight - height, clientHeight - event.clientY + drag.offsetY - height)),
    });
  };

  const finishStackDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    suppressDragClickRef.current = drag.moved;
    setDragging(false);
    if (drag.moved || event.pointerType !== 'mouse') setPaused(false);
  };

  return createPortal(
    <div
      className="vq-alert-position"
      data-expand-side={expandLeft ? 'left' : 'right'}
      style={{ '--vq-alert-peek-width': `${COMPACT_PILL_WIDTH}px` }}
      onMouseEnter={handleStackMouseEnter}
      onMouseMove={compactPeek ? handleStackMouseEnter : undefined}
      onMouseLeave={handleStackMouseLeave}
      onPointerDownCapture={() => { suppressDragClickRef.current = false; }}
      onPointerMove={moveStackDrag}
      onPointerUp={finishStackDrag}
      onPointerCancel={finishStackDrag}
      onLostPointerCapture={(event) => {
        if (!dragRef.current?.moved || event.target === event.currentTarget) finishStackDrag(event);
      }}
      onClickCapture={(event) => {
        if (!suppressDragClickRef.current || event.detail === 0) return;
        event.stopPropagation();
        suppressDragClickRef.current = false;
      }}
    >
      {isCompact && compactMinimized && (
        <span ref={compactTargetRef} aria-hidden="true" className="fixed z-[9998]" style={{ left: compactLeft, bottom: compactBottom, height: 'var(--vq-alert-compact-height)', width: 'var(--vq-alert-peek-width)' }} />
      )}
      <div
        ref={stackRef}
        role="region"
        aria-label="Active alerts"
        className={`vq-alert-stack fixed z-[9999] flex flex-col rounded-2xl border ${isCompact ? 'vq-alert-stack-compact' : ''} ${compactPeek ? 'vq-alert-stack-compact-peek' : ''} ${isCompact && compactMinimized && !dragging ? 'vq-alert-stack-hover-motion' : ''}`}
        style={{
          left: compactPeek ? compactLeft : `clamp(0px, ${draggedPanel ? `${draggedPanel.left}px` : panelLeft}, calc(100vw - ${panelWidth}))`,
          top: draggedTop ?? (!isCompact && expandDown ? panelTop : undefined),
          bottom: !isCompact && (draggedPanel || expandDown) ? undefined : compactBottom,
          height: isCompact ? 'var(--vq-alert-compact-height)' : undefined,
          width: compactPeek ? 'var(--vq-alert-peek-width)' : panelWidth,
          maxHeight: isCompact ? undefined : `min(66dvh, 520px, calc(100dvh - ${draggedTop ?? (expandDown ? panelTop : compactBottom)}${draggedPanel ? '' : ' - 8px'}))`,
          borderColor: 'var(--bd)',
          background: 'var(--vq-alert-card-bg, var(--glass))',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          boxShadow: '0 12px 36px rgba(45,35,100,.18), 0 3px 10px rgba(45,35,100,.08)',
        }}
      >
        {isCompact ? (
          <>
            <button type="button" inert={!compactPeek} onPointerDown={startStackDrag} onClick={() => updateExpanded(true)} className={`vq-alert-peek flex h-full w-full touch-none select-none items-center justify-between rounded-full pl-1 pr-1.5 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`} aria-label="Expand notifications" aria-expanded={false}>
              <ChevronLeft className="vq-alert-expand-icon shrink-0" size={10} strokeWidth={2} aria-hidden="true" />
              <span className="vq-alert-summary-icon flex h-9 w-9 flex-none items-center justify-center rounded-full">
                <Bell size={18} strokeWidth={2.2} />
                <span className="vq-alert-count" aria-label={`${alerts.length} notifications`}>
                  {alerts.length > 99 ? '99+' : alerts.length}
                </span>
              </span>
            </button>
          <div inert={compactPeek} className="vq-alert-compact flex h-full w-full items-center gap-2 px-2">
            <button
              type="button"
              onPointerDown={startStackDrag}
              onClick={() => updateExpanded(true)}
              className="vq-alert-compact-summary flex min-w-0 flex-1 touch-none select-none cursor-grab items-center gap-3 text-left"
              aria-label="View notifications"
              aria-expanded={false}
            >
              <span className="vq-alert-summary-icon flex h-9 w-9 flex-none items-center justify-center rounded-full">
                <Bell size={18} strokeWidth={2.2} />
                <span className="vq-alert-count" aria-label={`${alerts.length} notifications`}>
                  {alerts.length > 99 ? '99+' : alerts.length}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="vq-alert-compact-title block text-[14px] font-semibold leading-tight">Notifications</span>
                <span className="vq-alert-compact-subtitle mt-0.5 block text-[11px] leading-tight">{alerts.length} new alerts</span>
              </span>
            </button>
            <span className="vq-alert-compact-divider" aria-hidden="true" />
            <button type="button" disabled={clearing} aria-busy={clearing} onClick={clearAllWithAnimation} className="vq-alert-compact-clear flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold disabled:cursor-wait" aria-label={clearing ? 'Clearing alerts' : 'Clear all alerts'}>
              {clearing ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" size={14} strokeWidth={2} /> : <Trash2 size={14} strokeWidth={2} />}
              <span className="hidden min-[380px]:inline">{clearing ? 'Clearing…' : 'Clear All'}</span>
            </button>
            <span className="vq-alert-compact-divider" aria-hidden="true" />
            <button type="button" onClick={() => updateExpanded(true)} className="vq-alert-compact-toggle flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg" aria-label="Expand notifications" aria-expanded={false}>
              <ExpandChevron className="vq-alert-expand-icon" size={20} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>
          </>
        ) : (
          <>
            <ul
              ref={alertListRef}
              onScroll={({ currentTarget: list }) => {
                followLatestRef.current = list.scrollHeight - list.clientHeight - list.scrollTop <= 8;
              }}
              className="vq-scroll m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0"
            >
              {orderedAlerts.map((alert, index) => (
                <AlertRow key={alert.id} alert={alert} showDivider={index > 0} exiting={exitingIds.has(alert.id)} onDismiss={dismissWithAnimation} onOpen={onOpen} />
              ))}
            </ul>

            <div className="vq-alert-actions flex flex-none items-center border-t px-2 py-1.5" style={{ borderColor: 'var(--bd)' }}>
              <button type="button" onClick={clearAllWithAnimation} className="vq-alert-action flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold">
                <Trash2 size={13} strokeWidth={2} />
                Clear All
              </button>
              <div
                title="Drag notifications"
                onPointerDown={startStackDrag}
                className={`flex h-8 w-8 shrink-0 touch-none select-none items-center justify-center text-[var(--tx3)] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                <GripHorizontal size={17} aria-hidden="true" />
              </div>
              <button type="button" onClick={() => updateExpanded(false)} aria-expanded={true} className="vq-alert-action vq-alert-view-pill flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold">
                View Less <CollapseChevron size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export function DetectionNotificationProvider({ children }) {
  const labels = useDetectionLabels();
  const { socket } = useSocket();
  const { user } = useAuth();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canViewAlerts = !permissionsLoading && permissions?.alerts?.view === true;
  const shownDetections = useRef(new Set());
  const permissionAsked = useRef(false);
  // The alert stack's source of truth — added to on every detection, trimmed
  // by the stack's own auto-dismiss timers or by the user (X / Clear All).
  const [alerts, setAlerts] = useState([]);

  const dismissAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const openAlert = useCallback((alert) => {
    if (!alert.incidentId) return;
    router.navigate(`/alerts?alertId=${encodeURIComponent(alert.incidentId)}`, {
      state: { alertId: alert.incidentId, alert: alert.incident, fromDetectionNotification: true },
    });
    dismissAlert(alert.id);
  }, [dismissAlert]);

  const notifyDetection = useCallback((data, fromFeed = false) => {
    if (!canViewAlerts || !user?.adminId || !data || (fromFeed && !inAppNotificationsEnabled())) return;
    const key = notificationKey(data) || JSON.stringify(data);
    if (shownDetections.current.has(key)) return;
    shownDetections.current.add(key);

    if (shownDetections.current.size > 200) {
      const [oldest] = shownDetections.current;
      shownDetections.current.delete(oldest);
    }

    const type = data?.incidentType || data?.detectionType;
    const title = labels.override(type) ? labels.event(type, data?.incidentName) : detectionTitle(data);
    const description = `${cameraLabel(data)} - ${detectionTime(data)}`;

    const desktopEnabled = !fromFeed && desktopNotificationsEnabled();

    if (
      desktopEnabled &&
      !permissionAsked.current &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission();
      permissionAsked.current = true;
    }

    if (
      desktopEnabled &&
      document.visibilityState !== 'visible' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      // With web push active, the service worker already shows this one for
      // a hidden tab — don't pop it twice. The shared tag is a second guard.
      if (webPushActive()) return;
      const notification = new Notification(title, {
        body: description,
        tag: `incident-${data?._id}-${data?.timeOfIncident}`,
      });
      notification.onclick = () => window.focus();
      return;
    }

    if (!inAppNotificationsEnabled()) return;

    // On every detection, unconditionally. An earlier version only showed
    // it once a second alert was already open, which meant it was
    // invisible exactly when you went looking for it — and it depended on
    // `incidentType` being present, which it isn't always (detectionTitle
    // falls back to incidentName/displayName for the same reason).
    const timestamp = new Date(incidentTimestamp(data)).getTime() || 0;
    setAlerts((prev) => [...prev, { id: key, incidentId: String(data?.incidentId || data?._id || data?.id || ''), incident: data, title, description, severity: severityBucket(data?.severity), timestamp }]);
  }, [canViewAlerts, user?.adminId, labels]);

  const notifyFetchedDetection = useCallback((data) => notifyDetection(data, true), [notifyDetection]);

  useEffect(() => {
    shownDetections.current.clear();
    setAlerts([]);
  }, [user?.adminId, user?.memberId, canViewAlerts]);

  useEffect(() => {
    if (!socket || !user?.adminId || !canViewAlerts) return undefined;
    const handleDetection = (data) => notifyDetection(data);
    socket.on(`cameradetection_${user.adminId}`, handleDetection);
    return () => socket.off(`cameradetection_${user.adminId}`, handleDetection);
  }, [socket, user?.adminId, canViewAlerts, notifyDetection]);

  // Incident push for when no tab is open — follows the same Settings ▸
  // Desktop notifications switch as the socket-driven desktop notification.
  useEffect(() => {
    if (user?.adminId && canViewAlerts && desktopNotificationsEnabled()) registerWebPush(getAccessToken());
  }, [user?.adminId, canViewAlerts]);

  return (
    <DetectionNotificationContext.Provider value={notifyFetchedDetection}>
      {children}
      <DetectionAlertStack alerts={alerts} onDismiss={dismissAlert} onClearAll={clearAllAlerts} onOpen={openAlert} />
    </DetectionNotificationContext.Provider>
  );
}

