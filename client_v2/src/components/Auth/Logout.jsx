import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '@/hooks/logout';
import { useAuth } from '@/context/AuthContext';

const envValue = (key) => String(import.meta.env[key] || '').trim();
const isLocalSetup = () => envValue('VITE_LOCAL_SETUP').toLowerCase() === 'true';

const logoutRedirectUrl = () => {
  const loginUrl = envValue('VITE_AMEMBER_LOGIN_URL');
  const memberUrl = envValue('VITE_AMEMBER_MEMBER_URL');
  const amemberUrl = memberUrl || loginUrl;
  const frontendUrl = envValue('VITE_FRONTEND').replace(/\/+$/, '');

  if (frontendUrl === 'https://pridehonda.videoraiq.com') {
    return `${frontendUrl}/admin-login`;
  }

  if (amemberUrl) {
    const logoutUrl = new URL(
      amemberUrl.replace(/\/(?:member|login)\/?$/, '/logout'),
      window.location.href
    );
    const destination = loginUrl || amemberUrl.replace(/\/member\/?$/, '/login');
    logoutUrl.searchParams.set('amember_redirect_url', destination);
    return logoutUrl.toString();
  }

  return frontendUrl ? `${frontendUrl}/logout` : '/admin-login';
};

/**
 * Clears the session and returns to the login page. Mirrors V1's Logout
 * component; the sidebar "Sign Out" button routes here (/logout).
 */
export default function Logout() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    logout();
    setUser(null);
    if (isLocalSetup() && !envValue('VITE_AMEMBER_LOGIN_URL')) {
      navigate('/admin-login', { replace: true });
    } else {
      window.location.replace(logoutRedirectUrl());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
