import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import getAccessToken from '@/utils/getAccessToken';
import { useAuth } from '@/context/AuthContext';
import { logout } from '@/hooks/logout';

const HOST = import.meta.env.VITE_BACKEND;

/**
 * Route guard for the V2 app — same method as the V1 IsAuth
 * (client/src/components/Auth/IsAuth.jsx): it does not just check that a cookie
 * exists, it VALIDATES the access token against the backend
 * (POST /api/v1/auth/by-login-token). Only a token the server confirms renders
 * the protected tree; anything else is cleared and bounced to /admin-login.
 *
 * (V1 also resolves an aMember redirect + permission routing; the standalone V2
 * has neither, so this is the token-validation core of that flow.)
 */
export default function IsAuth({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  const toLogin = () =>
    navigate('/admin-login', { replace: true, state: { from: location } });

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      toLogin();
      return;
    }

    async function checkAccess() {
      try {
        const response = await fetch(`${HOST}/api/v1/auth/by-login-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const result = await response.json();

        if (!result?.success) {
          logout();
          setIsLoading(false);
          toLogin();
          return;
        }
        setUser(result.data); // hydrate user context from the validated token
        setIsLoading(false);
      } catch {
        // Couldn't validate (network/invalid) → treat as unauthenticated.
        logout();
        setIsLoading(false);
        toLogin();
      }
    }

    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <div />;
  if (getAccessToken()) return <>{children}</>;
  return null;
}
