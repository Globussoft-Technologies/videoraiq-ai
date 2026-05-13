// contexts/AllDetectionContext.js
import React, { createContext, useContext, useState, useEffect,useRef } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from '../AuthContext';
import checkinSound from '../../assets/audio/checkin.mp3';
import checkoutSound from '../../assets/audio/checkout.mp3';
import { fetchLogsSound } from '../Api/get';
import { updateLogsSound } from '../Api/put';

const AllDetectionContext = createContext();

export const AllDetectionProvider = ({ children }) => {
  const { socket } = useSocket();

  const [allDetections, setAllDetections] = useState([]);
  const [accessAllDetections, setAccessAllDetections] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  // Mute maps inversely to backend's logsSound flag: logsSound=true -> unmuted.
  // Start muted until the first fetch resolves so we don't play audio with
  // a wrong default while the preference is still loading.
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef(true);
  const { user } = useAuth();
  const TWO_MINUTES = 2 * 60 * 1000;
  const accessTimerRef = useRef(null);
  const attendanceTimerRef = useRef(null);

  // Keep the ref in sync so the socket handler (registered once) always
  // reads the latest mute state without re-subscribing.
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Hydrate from server once the user is authenticated.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchLogsSound();
        const logsSound = res?.data?.body?.data?.logsSound;
        if (!cancelled && typeof logsSound === 'boolean') {
          setIsMuted(!logsSound);
        }
      } catch (err) {
        console.log('Failed to fetch logsSound preference:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleMute = async () => {
    const nextMuted = !isMutedRef.current;
    const prevMuted = isMutedRef.current;
    // Optimistic local flip so the icon responds instantly.
    setIsMuted(nextMuted);
    try {
      await updateLogsSound(!nextMuted);
    } catch (err) {
      console.log('Failed to persist logsSound preference:', err);
      // Revert on failure so UI stays consistent with the server.
      setIsMuted(prevMuted);
    }
  };

  /** Reset Access Log Timer **/
  const resetAccessTimer = () => {
    if (accessTimerRef.current) clearTimeout(accessTimerRef.current);
    accessTimerRef.current = setTimeout(() => {
      console.log("No access logs for 2 minutes — clearing accessAllDetections...");
      setAccessAllDetections([]);
    }, TWO_MINUTES);
  };

  /** Reset Attendance Log Timer **/
  const resetAttendanceTimer = () => {
    if (attendanceTimerRef.current) clearTimeout(attendanceTimerRef.current);
    attendanceTimerRef.current = setTimeout(() => {
      console.log("No attendance logs for 2 minutes — clearing attendanceLogs...");
      setAttendanceLogs([]);
    }, TWO_MINUTES);
  };

  useEffect(() => {
    if (!socket || !user?.adminId) {
      console.warn("⚠️ Cannot setup detection listeners - missing socket or user.adminId");
      return;
    }


   

    const handleDetection = (data) => {
      // each detection comes with nvrId, cameraId, incidentType, timestamp etc.
      setAllDetections((prev) => {
        const key = `${data.nvrId}_${data.cameraId}_${data.incidentType}`;

        // Remove existing entry with same camera + incidentType
        const filtered = prev.filter(item => `${item.nvrId}_${item.cameraId}_${item.incidentType}` !== key);

        // Add new detection first (latest on top)
        return [{ ...data, key }, ...filtered];
      });
    };
    const handleAccessLogs = (data) => {
      resetAccessTimer(); 
      setAccessAllDetections((prev) => [{ ...data }, ...prev]);
    };

    const handleAttendanceLog = (data) => {
      resetAttendanceTimer();
      const eventType = data?.attendance?.event?.cameraType;
      if (!isMutedRef.current) {
        if (eventType === "checkin") {
          const audio = new Audio(checkinSound);
          audio.play().catch(() => {});
        } else if (eventType === "checkout") {
          const audio = new Audio(checkoutSound);
          audio.play().catch(() => {});
        }
      }
      setAttendanceLogs((prev) => {
     // Add the new log to the start
     const updated = [{ ...data }, ...prev];

    // Removing duplicates: keeping only the latest entry for each employee
    return updated.filter(
        (item, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.attendance?.employee?._id === item.attendance?.employee?._id &&
              t.attendance?.event?.cameraType === item.attendance?.event?.cameraType
          )
      );
     });
 };


    socket.on(`cameradetection_${user.adminId}`, handleDetection);
    socket.on(`accessLogs_${user.adminId}`, handleAccessLogs); 
    socket.on(`attendanceLog_${user.adminId}`,handleAttendanceLog);

    return () => {
      socket.off(`cameradetection_${user.adminId}`, handleDetection);
      socket.off(`accessLogs_${user.adminId}`, handleAccessLogs);
      socket.off(`attendanceLog_${user.adminId}`,handleAttendanceLog);
      if (accessTimerRef.current) clearTimeout(accessTimerRef.current);
      if (attendanceTimerRef.current) clearTimeout(attendanceTimerRef.current);
    };
  }, [socket, user]);

  const resetAllDetections = () => {
    setAllDetections([]);
  };

  const value = {
    allDetections,
    accessAllDetections,
    attendanceLogs,
    resetAllDetections,
    isMuted,
    setIsMuted,
    toggleMute,
  };

  return (
    <AllDetectionContext.Provider value={value}>
      {children}
    </AllDetectionContext.Provider>
  );
};

export const useAllDetections = () => useContext(AllDetectionContext);
