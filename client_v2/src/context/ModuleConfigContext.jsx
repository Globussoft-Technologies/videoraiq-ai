import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import getAccessToken from '@/utils/getAccessToken';

const ModuleConfigContext = createContext({ modules: null, loading: true });

export function ModuleConfigProvider({ children }) {
  const { user } = useAuth();
  const { socket, connected } = useSocket() || {};
  const adminId = user?.adminId;
  const [modules, setModules] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let receivedLiveUpdate = false;
    if (!user) {
      setModules(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const eventName = `moduleConfig_${adminId}`;
    const handleUpdate = (payload) => {
      if (cancelled || !payload?.modules || typeof payload.modules !== 'object') return;
      receivedLiveUpdate = true;
      setModules(payload.modules);
      setLoading(false);
    };
    if (socket && adminId) socket.on(eventName, handleUpdate);

    // Fetch on connection/reconnection too: Redis events sent while this tab
    // was offline are not replayed. A live event wins over an older HTTP read.
    axios.get(`${import.meta.env.VITE_BACKEND}/client-config`, {
      headers: { 'x-access-token': getAccessToken() },
    }).then((response) => {
      if (!cancelled && !receivedLiveUpdate) setModules(response?.data?.body?.data?.modules || null);
    }).catch(() => {
      if (!cancelled && !receivedLiveUpdate) setModules(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      if (socket && adminId) socket.off(eventName, handleUpdate);
    };
  }, [adminId, user?.memberId, socket, connected]);

  return <ModuleConfigContext.Provider value={{ modules, loading }}>{children}</ModuleConfigContext.Provider>;
}

export const useModuleConfig = () => useContext(ModuleConfigContext);
