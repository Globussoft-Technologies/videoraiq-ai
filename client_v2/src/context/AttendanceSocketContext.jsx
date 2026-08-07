import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { fetchLogsSound, updateLogsSound } from '../helpers/administer';

const AttendanceSocketContext = createContext();
export const useAttendanceSocket = () => useContext(AttendanceSocketContext);

const TWO_MINUTES = 2 * 60 * 1000;
const LINE_CROSSING_AUDIO_STORAGE_KEY = 'lineCrossingAudioMuted';

function applyLineCrossingAudioEnabled(enabled) {
  if (typeof window === 'undefined') return;
  const muted = !enabled;
  try { window.localStorage.setItem(LINE_CROSSING_AUDIO_STORAGE_KEY, String(muted)); } catch {}
  window.dispatchEvent(new CustomEvent('line-crossing-audio-change', { detail: { muted } }));
}

function cleanId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || value.$oid || '');
  return String(value);
}

/** Live attendance feed via socket — ported from the attendanceLogs slice of
 * client/src/context/Sockets/AllDetectionContext.jsx. Listens on the
 * per-admin room `attendanceLog_${adminId}`; each event is the raw payload
 * consumed by LiveAttendance's mapItem(). Clears the feed after 2 minutes of
 * silence, matching v1's behavior.
 *
 * Also owns the "Audio Alarm" mute preference (admin's `logsSound` field) —
 * logsSound=true means unmuted, matching v1's inverse mapping. Starts muted
 * until the first fetch resolves so we never assume the wrong default. */
export function AttendanceSocketProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [allDetections, setAllDetections] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [accessAllDetections, setAccessAllDetections] = useState([]);
  const [cameraLimit, setCameraLimit] = useState({
    purchasedCameras: 0,
    added: 0,
    remaining: null,
  });
  const [isMuted, setIsMuted] = useState(true);
  const [audioLoading, setAudioLoading] = useState(true);
  const [audioSaving, setAudioSaving] = useState(false);
  const isMutedRef = useRef(true);
  const attendanceClearTimerRef = useRef(null);
  const accessClearTimerRef = useRef(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const applyLogsSound = useCallback((logsSound) => {
    if (typeof logsSound !== 'boolean') return;
    const nextMuted = !logsSound;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    applyLineCrossingAudioEnabled(logsSound);
  }, []);

  const refreshAudioPreference = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setAudioLoading(true);
    try {
      const logsSound = await fetchLogsSound();
      applyLogsSound(logsSound);
      return logsSound;
    } finally {
      if (!silent) setAudioLoading(false);
    }
  }, [applyLogsSound]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAudioLoading(true);
    fetchLogsSound().then((logsSound) => {
      if (!cancelled) applyLogsSound(logsSound);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setAudioLoading(false);
    });
    return () => { cancelled = true; };
  }, [user, applyLogsSound]);

  const setAudioEnabled = useCallback(async (enabled, { successMessage, syncLineCrossing = false } = {}) => {
    const previousMuted = isMutedRef.current;
    const nextMuted = !enabled;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    if (syncLineCrossing) applyLineCrossingAudioEnabled(enabled);
    setAudioSaving(true);
    try {
      await updateLogsSound(enabled);
      if (successMessage) toast.success(successMessage);
    } catch {
      isMutedRef.current = previousMuted;
      setIsMuted(previousMuted);
      if (syncLineCrossing) applyLineCrossingAudioEnabled(!previousMuted);
      toast.error('Could not update audio alarm preference');
    } finally {
      setAudioSaving(false);
    }
  }, []);

  const toggleMute = async () => {
    await setAudioEnabled(isMutedRef.current);
  };

  const resetAttendanceClearTimer = () => {
    if (attendanceClearTimerRef.current) clearTimeout(attendanceClearTimerRef.current);
    attendanceClearTimerRef.current = setTimeout(() => setAttendanceLogs([]), TWO_MINUTES);
  };

  const resetAccessClearTimer = () => {
    if (accessClearTimerRef.current) clearTimeout(accessClearTimerRef.current);
    accessClearTimerRef.current = setTimeout(() => setAccessAllDetections([]), TWO_MINUTES);
  };

  useEffect(() => {
    if (!socket || !user?.adminId) return;

    const normalizeDetectionPayload = (...args) => (
      args.find((arg) => arg && typeof arg === 'object' && !Array.isArray(arg) && (arg.incidentType || arg.detectionType || arg.incidentName || arg.displayName))
      || args.find((arg) => Array.isArray(arg))?.find((item) => item && typeof item === 'object' && (item.incidentType || item.detectionType || item.incidentName || item.displayName))
      || args[0]
    );

    const handleDetection = (...args) => {
      const data = normalizeDetectionPayload(...args);
      if (!data || typeof data !== 'object') return;
      setAllDetections((prev) => {
        const cameraId = cleanId(
          data?.cameraId ||
          data?.channelData?._id ||
          data?.channelId ||
          data?.channel
        );
        const incidentType = data?.incidentType || data?.incidentName || data?.displayName || 'detection';
        const key = `${cameraId}_${incidentType}`;
        const filtered = prev.filter((item) => item.key !== key);
        return [{ ...data, key }, ...filtered].slice(0, 100);
      });
    };

    const handleAttendanceLog = (data) => {
      resetAttendanceClearTimer();
      setAttendanceLogs((prev) => {
        const updated = [{ ...data }, ...prev];
        return updated.filter((item, index, self) =>
          index === self.findIndex((t) =>
            t.attendance?.employee?._id === item.attendance?.employee?._id &&
            t.attendance?.event?.cameraType === item.attendance?.event?.cameraType
          )
        );
      });
    };

    const handleAccessLogs = (data) => {
      resetAccessClearTimer();
      setAccessAllDetections((prev) => [{ ...data }, ...prev]);
    };

    const handleCameraLimit = (data) => {
      setCameraLimit({
        purchasedCameras: Number(data?.purchasedCameras) || 0,
        added: Number(data?.added) || 0,
        remaining: data?.remaining ?? null,
      });
    };

    socket.on(`cameradetection_${user.adminId}`, handleDetection);
    socket.on(`accessLogs_${user.adminId}`, handleAccessLogs);
    socket.on(`attendanceLog_${user.adminId}`, handleAttendanceLog);
    socket.on(`purchasedCameras_${user.adminId}`, handleCameraLimit);
    return () => {
      socket.off(`cameradetection_${user.adminId}`, handleDetection);
      socket.off(`accessLogs_${user.adminId}`, handleAccessLogs);
      socket.off(`attendanceLog_${user.adminId}`, handleAttendanceLog);
      socket.off(`purchasedCameras_${user.adminId}`, handleCameraLimit);
      if (accessClearTimerRef.current) clearTimeout(accessClearTimerRef.current);
      if (attendanceClearTimerRef.current) clearTimeout(attendanceClearTimerRef.current);
    };
  }, [socket, user]);

  return (
    <AttendanceSocketContext.Provider
      value={{
        allDetections,
        attendanceLogs,
        accessAllDetections,
        cameraLimit,
        isMuted,
        audioEnabled: !isMuted,
        audioLoading,
        audioSaving,
        setAudioEnabled,
        refreshAudioPreference,
        toggleMute,
      }}
    >
      {children}
    </AttendanceSocketContext.Provider>
  );
}
