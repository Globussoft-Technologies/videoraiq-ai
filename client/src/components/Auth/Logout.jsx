import React, { useEffect } from 'react';
import { logout } from '@/hooks/logout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const REDIRECT_MEMBER_PAGE = import.meta.env.VITE_FRONTEND + '/member/index';
const LOCAL_SETUP = import.meta.env.VITE_LOCAL_SETUP === 'true';
const LOGIN_REDIRECT = LOCAL_SETUP ? '/admin-login' : REDIRECT_MEMBER_PAGE;

const Logout = ({ targetUrl }) => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  useEffect(() => {
    const performLogout = async () => {
      await logout(); // Ensure logout is completed before redirecting
      setUser(null); // Clear user context
      if (LOCAL_SETUP) {
        navigate(LOGIN_REDIRECT);
      } else {
        window.location.href = REDIRECT_MEMBER_PAGE;
      }
        };

    performLogout();
  }, []);

  return null; // No need to return an empty fragment
};

export default Logout;
