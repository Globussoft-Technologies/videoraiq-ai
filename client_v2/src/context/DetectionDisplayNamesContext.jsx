import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '@/helpers/client';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { detectionLabel } from '@/lib/format';

const empty = { names: {}, settingTypeByLogKey: {}, settingTypeByIncidentType: {}, settingTypeByLogPermission: {} };
const DetectionDisplayNamesContext = createContext(empty);
const endpoint = '/client-config/detection-display-names';

export function DetectionDisplayNamesProvider({ children }) {
  const { user } = useAuth();
  const { socket, connected } = useSocket() || {};
  const adminId = user?.adminId;
  const [snapshot, setSnapshot] = useState(null);
  const current = snapshot?.adminId === adminId && snapshot ? snapshot : empty;

  useEffect(() => {
    if (!adminId) {
      setSnapshot(null);
      return undefined;
    }
    let pending;
    const refresh = () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      api.get(endpoint, { signal: controller.signal }).then(({ data }) => {
        if (!controller.signal.aborted) setSnapshot({ ...empty, ...data, adminId });
      }).catch(() => { /* Keep the last known names if refresh fails. */ });
    };
    const event = `detectionDisplayNames_${adminId}`;
    socket?.on(event, refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return () => {
      pending?.abort();
      socket?.off(event, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [adminId, socket, connected]);

  return (
    <DetectionDisplayNamesContext.Provider value={current}>
      {children}
    </DetectionDisplayNamesContext.Provider>
  );
}

export function useDetectionDisplayNames() {
  return useContext(DetectionDisplayNamesContext);
}

export function detectionLogLabel({ names, settingTypeByLogKey }, logsConfigKey, fallback) {
  return names[settingTypeByLogKey[logsConfigKey]] || fallback;
}

export function useDetectionLabels() {
  const { names, settingTypeByIncidentType, settingTypeByLogPermission } = useDetectionDisplayNames();
  return useMemo(() => {
    const override = (type) => {
      const key = Object.hasOwn(settingTypeByIncidentType, type) ? settingTypeByIncidentType[type] : type;
      return Object.hasOwn(names, key) ? names[key] : undefined;
    };
    const label = (type, fallback) => override(type) || fallback || detectionLabel(type);
    const event = (type, outcome, fallback) => override(type) || outcome || fallback || detectionLabel(type);
    const logPermission = (key, fallback) => names[settingTypeByLogPermission[key]] || fallback;
    return { override, label, event, logPermission };
  }, [names, settingTypeByIncidentType, settingTypeByLogPermission]);
}
