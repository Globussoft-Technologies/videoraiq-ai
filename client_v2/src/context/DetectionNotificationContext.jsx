import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Trash2, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { timeOfDay } from '../lib/format';

export const DESKTOP_NOTIFICATIONS_KEY = 'vq_desktop_notifications_enabled';
export const IN_APP_NOTIFICATIONS_KEY = 'vq_inapp_notifications_enabled';

export function desktopNotificationsEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) !== 'false';
}

export function inAppNotificationsEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(IN_APP_NOTIFICATIONS_KEY) !== 'false';
}

function notificationKey(detection) {
  return [
    detection?._id,
    detection?.nvrId?._id || detection?.nvrId,
    detection?.cameraId?._id || detection?.cameraId,
    detection?.channelId?._id || detection?.channelId,
    detection?.incidentType || detection?.incidentName || detection?.displayName,
    detection?.timeOfIncident || detection?.createdAt || detection?.timestamp,
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

// How long an alert stays on screen before it auto-dismisses, matching the
// previous sonner toast `duration`. Paused while the pointer is over the
// stack so an alert can't disappear out from under the user mid-read/click.
const ALERT_DURATION = 4000;

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

function detectionTitle(detection) {
  return (
    detection?.incidentType ||
    detection?.incidentName ||
    detection?.displayName ||
    'Detection'
  );
}

function detectionTime(detection) {
  const value = detection?.timeOfIncident || detection?.createdAt || detection?.timestamp || new Date();
  return timeOfDay(value) || 'Unknown time';
}

function AlertRow({ alert, showDivider, onDismiss }) {
  const color = SEVERITY_COLOR[alert.severity] || SEVERITY_COLOR.info;
  return (
    <li
      className="vq-fadeup flex list-none items-start gap-2.5 px-3.5 py-3"
      style={{ borderTop: showDivider ? '1px solid var(--bd)' : 'none' }}
    >
      <span
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full"
        style={{ background: `${color}1a`, color }}
      >
        <Bell size={14} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold leading-tight" style={{ color: 'var(--tx)' }}>
          {alert.title}
        </div>
        <div className="mt-1 truncate text-[11.5px] leading-tight" style={{ color: 'var(--tx2)' }}>
          {alert.description}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(alert.id)}
        aria-label={`Dismiss ${alert.title} alert`}
        className="flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-md text-[var(--tx3)] transition-colors hover:bg-[var(--bg2)] hover:text-[var(--tx)]"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </li>
  );
}

/**
 * Floating stack of active detection alerts, portalled to <body> so it can't
 * be clipped or offset by whatever page happens to be mounted underneath it.
 * All alerts render at once (no stacking/collapsing); once there are more
 * than fit in the max height, only the list scrolls — the "Clear All Alerts"
 * footer stays pinned outside that scroll area.
 */
function DetectionAlertStack({ alerts, onDismiss, onClearAll }) {
  const timersRef = useRef(new Map());
  const pausedRef = useRef(false);

  const scheduleFor = useCallback((id) => {
    if (timersRef.current.has(id)) return;
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      onDismiss(id);
    }, ALERT_DURATION);
    timersRef.current.set(id, timer);
  }, [onDismiss]);

  useEffect(() => {
    const liveIds = new Set(alerts.map((a) => a.id));
    timersRef.current.forEach((timer, id) => {
      if (!liveIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });
    if (!pausedRef.current) {
      alerts.forEach((a) => scheduleFor(a.id));
    }
  }, [alerts, scheduleFor]);

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  }, []);

  if (!alerts.length || typeof document === 'undefined') return null;

  const handleMouseEnter = () => {
    pausedRef.current = true;
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  };

  const handleMouseLeave = () => {
    pausedRef.current = false;
    alerts.forEach((a) => scheduleFor(a.id));
  };

  return createPortal(
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="region"
      aria-label="Active alerts"
      className="fixed z-[9999] flex flex-col overflow-hidden rounded-2xl border"
      style={{
        left: 16,
        bottom: 16,
        width: 'min(380px, calc(100vw - 32px))',
        maxHeight: 'min(66vh, 520px)',
        borderColor: 'var(--bd)',
        background: 'var(--glass)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        boxShadow: '0 18px 46px rgba(0,0,0,.34)',
      }}
    >
      <ul className="vq-scroll m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0">
        {alerts.map((alert, index) => (
          <AlertRow key={alert.id} alert={alert} showDivider={index > 0} onDismiss={onDismiss} />
        ))}
      </ul>

      {alerts.length >= 2 && (
        <div className="flex-none border-t p-2.5" style={{ borderColor: 'var(--bd)', background: 'var(--bg1solid)' }}>
          <button
            type="button"
            onClick={onClearAll}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border py-2 text-[12.5px] font-semibold transition-colors hover:bg-[var(--bg2)]"
            style={{ borderColor: 'var(--bd)', color: 'var(--tx)' }}
          >
            <Trash2 size={13} strokeWidth={2} />
            Clear All Alerts
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

export function DetectionNotificationProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
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

  useEffect(() => {
    if (!socket || !user?.adminId) return undefined;

    const handleDetection = (data) => {
      const key = notificationKey(data) || JSON.stringify(data);
      if (shownDetections.current.has(key)) return;
      shownDetections.current.add(key);

      if (shownDetections.current.size > 200) {
        const [oldest] = shownDetections.current;
        shownDetections.current.delete(oldest);
      }

      const title = detectionTitle(data);
      const description = `${cameraLabel(data)} - ${detectionTime(data)}`;

      const desktopEnabled = desktopNotificationsEnabled();

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
        const notification = new Notification(title, { body: description });
        notification.onclick = () => window.focus();
        return;
      }

      if (!inAppNotificationsEnabled()) return;

      // On every detection, unconditionally. An earlier version only showed
      // it once a second alert was already open, which meant it was
      // invisible exactly when you went looking for it — and it depended on
      // `incidentType` being present, which it isn't always (detectionTitle
      // falls back to incidentName/displayName for the same reason).
      setAlerts((prev) => [...prev, { id: key, title, description, severity: severityBucket(data?.severity) }]);
    };

    socket.on(`cameradetection_${user.adminId}`, handleDetection);
    return () => socket.off(`cameradetection_${user.adminId}`, handleDetection);
  }, [socket, user?.adminId]);

  return (
    <>
      {children}
      <DetectionAlertStack alerts={alerts} onDismiss={dismissAlert} onClearAll={clearAllAlerts} />
    </>
  );
}

