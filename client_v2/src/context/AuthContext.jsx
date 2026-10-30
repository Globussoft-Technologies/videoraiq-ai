import { createContext, useContext, useEffect, useState } from 'react';
import { dropdownCache } from '@/utils/dropdownCache';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const accountScope = JSON.stringify([user?.adminId, user?.memberId, user?.user_id]);
  useEffect(() => { dropdownCache.clear(Boolean(user)); }, [accountScope]);
   const [triggerFlag, setTriggerFlag] = useState(false);
   const triggerUpdate = () => setTriggerFlag(prev => !prev);
  return (
    <AuthContext.Provider value={{ user, setUser, triggerFlag, triggerUpdate }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
