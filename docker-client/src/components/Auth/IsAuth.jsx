import React, { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import getAccessToken from '@/utils/getAccessToken';
import { useAuth } from '@/context/AuthContext'; // import context
import { useNavigate, useLocation } from 'react-router-dom';
import { usePermissions } from '@/context/Permission/PermissionContext';

// Maps each protected route prefix to its permission key
const ROUTE_PERMISSION_MAP = [
  { match: (p) => p === '/dashboard', permissionKey: 'dashboard' },
  { match: (p) => ['/incidents', '/critical-incidents', '/total-incidents', '/incidents-resolved', '/active-cameras'].some(r => p.startsWith(r)), permissionKey: 'incidents' },
  { match: (p) => p.startsWith('/nvr-settings') || p.startsWith('/streams'), permissionKey: 'NVR' },
  { match: (p) => p.startsWith('/cameraview'), permissionKey: 'LIVE' },
  { match: (p) => p.startsWith('/playback') || p.startsWith('/Playback'), permissionKey: 'playbacks' },
  { match: (p) => ['/detection-settings', '/profile', '/notification-recipients', '/storage-settings', '/settings'].some(r => p.startsWith(r)), permissionKey: 'settings', settingsGroup: true },
  { match: (p) => p.startsWith('/logs'), permissionKey: 'logs' },
  { match: (p) => ['/user-details', '/roles-permissions', '/register-users', '/departments', '/locations'].some(r => p.startsWith(r)), permissionKey: 'Users' },
];

const FALLBACK_ROUTES = [
  { to: '/dashboard', permissionKey: 'dashboard' },
  { to: '/incidents', permissionKey: 'incidents' },
  { to: '/nvr-settings', permissionKey: 'NVR' },
  { to: '/cameraview', permissionKey: 'LIVE' },
  { to: '/Playback', permissionKey: 'playbacks' },
  { to: '/profile', permissionKey: 'settings', settingsGroup: true },
  { to: '/logs/attendance', permissionKey: 'logs' },
  { to: '/user-details', permissionKey: 'Users' },
];

function hasPermission(perms, permissionKey, settingsGroup) {
  if (settingsGroup) {
    return (
      perms?.detectionSettings?.view === true ||
      perms?.profiles?.view === true ||
      perms?.recipients?.view === true ||
      perms?.storageSettings?.view === true
    );
  }
  // Logs may be returned as a flat {view,...} object or nested by sub-section
  // (global, accessLogs, attendanceLogs, ...). Grant access if any sub has view.
  if (permissionKey === 'logs') {
    const logs = perms?.logs;
    if (!logs) return false;
    if (typeof logs.view === 'boolean') return logs.view === true;
    return Object.values(logs).some((v) => v?.view === true);
  }
  return perms?.[permissionKey]?.view === true;
}

function getFirstAccessibleRoute(perms) {
  for (const link of FALLBACK_ROUTES) {
    if (hasPermission(perms, link.permissionKey, link.settingsGroup)) return link.to;
  }
  return null;
}

const HOST = import.meta.env.VITE_BACKEND;
const REDIRECT_LOGIN = import.meta.env.VITE_FRONTEND;
const REDIRECT_MEMBER_PAGE = import.meta.env.VITE_FRONTEND + '/member/index';
const url=import.meta.env.VITE_ENV;
const LOCAL_SETUP = import.meta.env.VITE_LOCAL_SETUP === 'true';
const LOGIN_REDIRECT = LOCAL_SETUP ? '/admin-login' : REDIRECT_MEMBER_PAGE;
export function deleteCookie(name, path = '/') {
  const domain = `.${window.location.hostname.split('.').slice(-2).join('.')}`;
  document.cookie = `${name}=; domain=${domain}; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
}

function IsAuth({ children }) {
  const queryKey = 'savedQuery';
  const savedQuery = Cookies.get(queryKey);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { permissions, loading: permissionsLoading } = usePermissions();

  if (savedQuery) {
    const currentPath = window.location.pathname;
    const updatedUrl = `${currentPath}${savedQuery}`;
    document.cookie = `${queryKey}=; path=${'/'}; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    window.location.href = updatedUrl;
  }

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Once permissions are loaded, check if the current route is accessible.
  // If not, redirect to the first route the user has permission for.
  useEffect(() => {
    if (isLoading || permissionsLoading) return;
    if (!permissions || Object.keys(permissions).length === 0) return;

    const pathname = location.pathname;
    const routeEntry = ROUTE_PERMISSION_MAP.find(({ match }) => match(pathname));

    // If current path is not a known protected route, leave it alone
    if (!routeEntry) return;

    const allowed = hasPermission(permissions, routeEntry.permissionKey, routeEntry.settingsGroup);
    if (!allowed) {
      const firstRoute = getFirstAccessibleRoute(permissions);
      if (firstRoute && firstRoute !== pathname) {
        navigate(firstRoute, { replace: true });
      }
    }
  }, [isLoading, permissionsLoading, permissions, location.pathname, navigate]);

  useEffect(() => {
    const userName = Cookies.get('amember_login')|| "";
    const password = Cookies.get('amember_pass')|| "";

    if (!(userName && password) && !getAccessToken()) {
      if (LOCAL_SETUP) {
        navigate(LOGIN_REDIRECT);
      } else {
        window.location.href = REDIRECT_MEMBER_PAGE;
      }
      return;
    }

    async function checkAccess() {
      try {
        if (userName && password) {
          const fields = { login: userName, pass: password };
          const response = await fetch(`${HOST}/api/v1/auth/by-login-pass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(fields),
          });

          const result = await response.json();
          if (!result?.ok) {
            if (LOCAL_SETUP) {
              return navigate(LOGIN_REDIRECT);
            } else {
              return window.location.href = REDIRECT_MEMBER_PAGE;
            }
          }
          if (result?.expired)
            return (window.location.href = `${REDIRECT_MEMBER_PAGE}`);

          const token = result?.token;
          // const domain = `.${window.location.hostname.split('.').slice(-2).join('.')}`;
           // Cookies.set('access-token', token, {
            //   expires: 1,
            //   path: '/',
            //   secure: true,
            //   domain: domain,
            // });

            // =======================
          // const domain = window.location.hostname;
          // let cookieName;
          // await new Promise(resolve => {
          //   if (domain.includes("dev"))
          //   {
          //     cookieName="dev-access-token"
          //   }else if(domain.includes("app")){
          //    cookieName = "prod-access-token"           
          //   }else{
          //     cookieName="local-access-token"
          //   }
          // Cookies.set(cookieName, token, {
          //   expires: 1,
          //   secure: true,
          //   path: "/",
          //   domain: domain,  // exact domain
          // });
           let cookieName;
      await new Promise(resolve=>{
          if(url=="dev")
          {
            cookieName="dev-access-token"
          }else if(url=="prod")
          {
             cookieName = "prod-access-token"           
          }else{
              cookieName = "access-token" 
          }
          
          Cookies.set(cookieName, token, {
            expires: 1,
            secure: true,
            path: "/",              
          });
            resolve();
          });

          deleteCookie('amember_login');
          deleteCookie('amember_pass');
          setUser(result.user); // set user data
        } else if (getAccessToken()) {
          const response = await fetch(`${HOST}/api/v1/auth/by-login-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAccessToken() }),
          });

          const result = await response.json();
          if (!result?.success) {
            if (LOCAL_SETUP) {
              navigate(LOGIN_REDIRECT);
            } else {
              window.location.href = REDIRECT_MEMBER_PAGE;
            }
          }
          setUser(result.data); // set user data from token
        }
        setIsLoading(false);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    }

    checkAccess();
  }, []);

  if (isLoading) return <div></div>;
  if (error) return <div>Error: {error}</div>;
  if (getAccessToken()) return <>{children}</>;

  return null;
}

export default IsAuth;
