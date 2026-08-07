import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { timeOfDay } from '../lib/format';

export const DESKTOP_NOTIFICATIONS_KEY = 'vq_desktop_notifications_enabled';

export function desktopNotificationsEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) !== 'false';
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

function severityToast(severity) {
  const value = String(severity || '').toLowerCase();
  if (value === 'high' || value === 'critical') return toast.error;
  if (value === 'moderate' || value === 'medium') return toast.warning;
  return toast.info;
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

export function DetectionNotificationProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const shownDetections = useRef(new Set());
  const permissionAsked = useRef(false);

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

      severityToast(data?.severity)(title, {
        id: key,
        position: 'bottom-left',
        description,
        duration: 4000,
      });
    };

    socket.on(`cameradetection_${user.adminId}`, handleDetection);
    return () => {
      socket.off(`cameradetection_${user.adminId}`, handleDetection);
    };
  }, [socket, user?.adminId]);

  return children;
}

