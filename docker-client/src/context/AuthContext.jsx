import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
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
