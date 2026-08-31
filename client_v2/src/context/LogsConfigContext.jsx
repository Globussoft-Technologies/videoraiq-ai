import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getLogsConfiguration, IS_LICENSING_ENABLED } from '../helpers/license';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

/**
 * Which log & record pages this client should see.
 *
 * The server owns this decision — GET /logs-configuration folds together three
 * things the sidebar has no business re-deriving:
 *
 *   1. the admin's stored preference (PATCH /logs-configuration),
 *   2. auto-enable — a log switches on once its detection is running,
 *   3. the detection licence — an unlicensed detection's log is forced off
 *      (LOG_REQUIRED_DETECTIONS in the backend service).
 *
 * So the sidebar renders what it is told rather than carrying its own copy of
 * the detection→log mapping, which would inevitably drift from the backend's.
 *
 * Kept live by the `logsConfiguration_<adminId>` socket event the backend
 * already emits whenever detections or camera check-types change.
 */
const LogsConfigContext = createContext({ logs: null, loading: true, refresh: () => {} });

export const LogsConfigProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket() || {};
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  // Out-of-order guard, same as the permission and licence providers.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    // Licensing off: no licence gates the log pages, and `logs: null` is the
    // fail-open value the sidebar filter already understands as "show all".
    if (!IS_LICENSING_ENABLED) {
      setLogs(null);
      setLoading(false);
      return;
    }
    if (!user) {
      if (requestId === requestIdRef.current) {
        setLogs(null);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const data = await getLogsConfiguration();
      if (requestId === requestIdRef.current) setLogs(data && typeof data === 'object' ? data : null);
    } catch (error) {
      // Fail open: a failed fetch must not blank the sidebar. `logs` stays null
      // and the filter shows everything the role permits.
      if (requestId === requestIdRef.current) setLogs(null);
      // eslint-disable-next-line no-console
      console.error('[LogsConfigContext]', error?.message || error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: the backend re-broadcasts the whole map whenever it changes.
  useEffect(() => {
    const adminId = user?.adminId;
    if (!IS_LICENSING_ENABLED || !socket || !adminId) return;

    const handler = (payload) => {
      const next = payload?.logs;
      if (next && typeof next === 'object') setLogs(next);
    };

    socket.on(`logsConfiguration_${adminId}`, handler);
    return () => socket.off(`logsConfiguration_${adminId}`, handler);
  }, [socket, user?.adminId]);

  // Enabling or disabling a detection can change which log pages apply, and
  // toggleChannelDetection already broadcasts this event.
  useEffect(() => {
    const onToggle = () => refresh();
    window.addEventListener('vq-detection-toggle-change', onToggle);
    return () => window.removeEventListener('vq-detection-toggle-change', onToggle);
  }, [refresh]);

  return (
    <LogsConfigContext.Provider value={{ logs, loading, refresh }}>
      {children}
    </LogsConfigContext.Provider>
  );
};

export const useLogsConfig = () => useContext(LogsConfigContext);

export default LogsConfigContext;
