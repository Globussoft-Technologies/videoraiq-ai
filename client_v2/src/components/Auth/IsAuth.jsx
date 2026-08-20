import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Cookies from 'js-cookie';
import getAccessToken from '@/utils/getAccessToken';
import { useAuth } from '@/context/AuthContext';
import { logout } from '@/hooks/logout';

const HOST = import.meta.env.VITE_BACKEND;
const envValue = (key) => String(import.meta.env[key] || '').trim();
const useAdminLogin = () => ['true', 'false'].includes(envValue('VITE_LOCAL_SETUP').toLowerCase());

const accessCookieName = () => {
  const env = envValue('VITE_ENV');
  if (env === 'dev') return 'dev-access-token';
  if (env === 'prod') return 'prod-access-token';
  return 'access-token';
};

const loginRedirectUrl = () => {
  const loginUrl = envValue('VITE_AMEMBER_LOGIN_URL');
  if (loginUrl) return loginUrl;

  const memberUrl = envValue('VITE_AMEMBER_MEMBER_URL');
  if (memberUrl) return memberUrl.replace(/\/member\/?$/, '/login');

  return '/admin-login';
};

function deleteCookie(name, path = '/') {
  document.cookie = `${name}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
  const parts = window.location.hostname.split('.');
  if (parts.length > 1) {
    const domain = `.${parts.slice(-2).join('.')}`;
    document.cookie = `${name}=; domain=${domain}; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
  }
}

/**
 * Route guard for the V2 app — same method as the V1 IsAuth
 * (client/src/components/Auth/IsAuth.jsx): it does not just check that a cookie
 * exists, it VALIDATES the access token against the backend
 * (POST /auth/by-login-token). Only a token the server confirms renders
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

  const toLogin = () => {
    if (useAdminLogin()) {
      navigate('/admin-login', { replace: true, state: { from: location } });
      return;
    }
    window.location.replace(loginRedirectUrl());
  };

  useEffect(() => {
    const amemberLogin = Cookies.get('amember_login');
    const amemberPass = Cookies.get('amember_pass');
    const token = getAccessToken();

    if (!token && !(amemberLogin && amemberPass)) {
      setIsLoading(false);
      toLogin();
      return;
    }

    async function checkAccess() {
      try {
        if (amemberLogin && amemberPass) {
          const response = await fetch(`${HOST}/auth/by-login-pass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ login: amemberLogin, pass: amemberPass }),
          });
          const result = await response.json();

          if (!result?.ok || !result?.token) {
            logout();
            setIsLoading(false);
            toLogin();
            return;
          }

          Cookies.set(accessCookieName(), result.token, {
            expires: 1,
            secure: window.location.protocol === 'https:',
            path: '/',
          });
          deleteCookie('amember_login');
          deleteCookie('amember_pass');
          setUser(result.user);
          setIsLoading(false);
          return;
        }

        const response = await fetch(`${HOST}/auth/by-login-token`, {
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
