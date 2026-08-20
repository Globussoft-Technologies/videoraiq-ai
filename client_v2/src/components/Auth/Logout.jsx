import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '@/hooks/logout';
import { useAuth } from '@/context/AuthContext';

const envValue = (key) => String(import.meta.env[key] || '').trim();
const useAdminLogin = () => ['true', 'false'].includes(envValue('VITE_LOCAL_SETUP').toLowerCase());
const logoutRedirectUrl = () => {
  const memberUrl = envValue('VITE_AMEMBER_MEMBER_URL');
  if (memberUrl) return memberUrl.replace(/\/login\/?$/, '/member');

  const frontendUrl = envValue('VITE_FRONTEND');
  return frontendUrl ? `${frontendUrl.replace(/\/$/, '')}/member` : '/admin-login';
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
    if (useAdminLogin()) {
      navigate('/admin-login', { replace: true });
    } else {
      window.location.href = logoutRedirectUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
