import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '@/hooks/logout';
import { useAuth } from '@/context/AuthContext';

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
    navigate('/admin-login', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
