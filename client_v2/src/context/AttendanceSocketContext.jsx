import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { fetchLogsSound, updateLogsSound } from '../helpers/admin';

const AttendanceSocketContext = createContext();
export const useAttendanceSocket = () => useContext(AttendanceSocketContext);

const TWO_MINUTES = 2 * 60 * 1000;

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
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [accessAllDetections, setAccessAllDetections] = useState([]);
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef(true);
  const attendanceClearTimerRef = useRef(null);
  const accessClearTimerRef = useRef(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchLogsSound().then((res) => {
      const logsSound = res?.data?.body?.data?.logsSound;
      if (!cancelled && typeof logsSound === 'boolean') setIsMuted(!logsSound);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const toggleMute = async () => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    try {
      await updateLogsSound(!next);
    } catch {
      toast.error('Could not update audio alarm preference');
    }
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

    socket.on(`accessLogs_${user.adminId}`, handleAccessLogs);
    socket.on(`attendanceLog_${user.adminId}`, handleAttendanceLog);
    return () => {
      socket.off(`accessLogs_${user.adminId}`, handleAccessLogs);
      socket.off(`attendanceLog_${user.adminId}`, handleAttendanceLog);
      if (accessClearTimerRef.current) clearTimeout(accessClearTimerRef.current);
      if (attendanceClearTimerRef.current) clearTimeout(attendanceClearTimerRef.current);
    };
  }, [socket, user]);

  return (
    <AttendanceSocketContext.Provider value={{ attendanceLogs, accessAllDetections, isMuted, toggleMute }}>
      {children}
    </AttendanceSocketContext.Provider>
  );
}
