import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import getAccessToken from '@/utils/getAccessToken';

const ModuleConfigContext = createContext({ modules: null, loading: true });

export function ModuleConfigProvider({ children }) {
  const { user } = useAuth();
  const [modules, setModules] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setModules(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    axios.get(`${import.meta.env.VITE_BACKEND}/client-config`, {
      headers: { 'x-access-token': getAccessToken() },
    }).then((response) => {
      if (!cancelled) setModules(response?.data?.body?.data?.modules || null);
    }).catch(() => {
      if (!cancelled) setModules(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.adminId, user?.memberId]);

  return <ModuleConfigContext.Provider value={{ modules, loading }}>{children}</ModuleConfigContext.Provider>;
}

export const useModuleConfig = () => useContext(ModuleConfigContext);
