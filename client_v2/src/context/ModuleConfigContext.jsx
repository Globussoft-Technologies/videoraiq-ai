import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import getAccessToken from '@/utils/getAccessToken';
import { IS_LICENSING_ENABLED } from '@/helpers/license';

const ModuleConfigContext = createContext({ modules: null, loading: true });

// Box Packing was added after some tenant module-config documents already
// existed. The server treats a missing boxPackingQc block as enabled, so keep
// the client-side navigation and route guard consistent with that default.
// Explicit false values are preserved for tenants that intentionally disabled
// a Box Packing page.
function normalizeModules(modules) {
  if (!modules || typeof modules !== 'object') return modules;
  const current = modules.boxPackingQc || {};
  return {
    ...modules,
    boxPackingQc: {
      boxPacking: current.boxPacking !== false,
      packingAlertLogs: current.packingAlertLogs !== false,
      boxPackingReports: current.boxPackingReports !== false,
    },
  };
}

export function ModuleConfigProvider({ children }) {
  const { user } = useAuth();
  const { socket, connected } = useSocket() || {};
  const adminId = user?.adminId;
  const [modules, setModules] = useState(null);
  const [loading, setLoading] = useState(IS_LICENSING_ENABLED);

  useEffect(() => {
    if (!IS_LICENSING_ENABLED) {
      setModules(null);
      setLoading(false);
      return undefined;
    }
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
      setModules(normalizeModules(payload.modules));
      setLoading(false);
    };
    if (socket && adminId) socket.on(eventName, handleUpdate);

    // Fetch on connection/reconnection too: Redis events sent while this tab
    // was offline are not replayed. A live event wins over an older HTTP read.
    axios.get(`${import.meta.env.VITE_BACKEND}/client-config`, {
      headers: { 'x-access-token': getAccessToken() },
    }).then((response) => {
      if (!cancelled && !receivedLiveUpdate) setModules(normalizeModules(response?.data?.body?.data?.modules || null));
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
