import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

/**
 * Live feed of detection schedule transitions.
 *
 * The backend emits `detectionSchedule_${adminId}` every time it calls the DS
 * API to start or stop a detection — from the one-minute scheduler and from
 * immediate saves alike. Each event carries the DS call trace (endpoint,
 * status, raw response or error), so this is primarily a verification tool:
 * it answers "was DS actually hit, and what did it say?".
 *
 * Every event toasts individually and immediately, not batched — the point is
 * to make it obvious in the UI the instant DS is actually hit (useful while
 * verifying the scheduler is firing), even if that means several toasts in a
 * burst when many cameras transition at once.
 */
const MAX_EVENTS = 50;

export function useDetectionScheduleEvents({ enabled = true } = {}) {
  const { socket } = useSocket() || {};
  const { user } = useAuth();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!enabled || !socket || !user?.adminId) return undefined;

    const handle = (payload) => {
      if (!payload || typeof payload !== 'object') return;

      const event = {
        // The same camera+detector can transition more than once; the
        // timestamp keeps React keys unique without needing an id from the API.
        key: `${payload.channelId}_${payload.settingType}_${payload.at || Date.now()}`,
        at: payload.at || new Date().toISOString(),
        channelId: payload.channelId,
        channelName: payload.channelName || payload.channelId,
        settingType: payload.settingType,
        detectionName: payload.detectionName || payload.settingType,
        operation: payload.operation || (payload.enabled ? 'resume' : 'stop'),
        status: payload.status || 'success',
        source: payload.source,
        scheduleSource: payload.scheduleSource,
        dsEndpoint: payload.dsEndpoint,
        dsResponse: payload.dsResponse,
        dsError: payload.dsError,
        enabled: payload.enabled === true,
      };

      setEvents((current) => [event, ...current].slice(0, MAX_EVENTS));

      if (event.status === 'failed') {
        toast.error(
          `DS ${event.operation} failed — ${event.channelName} / ${event.detectionName}: ${
            event.dsError || 'no response'
          }`,
        );
        return;
      }

      const icon = event.enabled ? '●' : '○';
      const verb = event.enabled ? 'Started' : 'Stopped';
      toast.success(`${icon} ${verb} — ${event.channelName} / ${event.detectionName}`);
    };

    const channel = `detectionSchedule_${user.adminId}`;
    socket.on(channel, handle);

    return () => {
      socket.off(channel, handle);
    };
  }, [socket, user?.adminId, enabled]);

  return { events, clear: () => setEvents([]) };
}

export default useDetectionScheduleEvents;
