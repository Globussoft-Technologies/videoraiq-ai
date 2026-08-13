import Cookies from 'js-cookie';

const url = import.meta.env.VITE_ENV;

const cookieName = () =>
  url === 'dev' ? 'dev-access-token' : url === 'prod' ? 'prod-access-token' : 'access-token';

const PRESERVED_COOKIES = ['admin_remember_me', 'user_remember_me'];
const PRESERVED_STORAGE_KEYS = [
  'vq-theme',
  'attendance_auto_refresh_enabled',
  'attendance_auto_refresh_interval',
  'access_auto_refresh_enabled',
  'access_auto_refresh_interval',
  'incidents_auto_refresh',
  'incidents_refresh_interval',
  'selectedGrid',
];

const shouldPreserveStorageKey = (key) =>
  PRESERVED_STORAGE_KEYS.includes(key) ||
  key.endsWith('_auto_refresh_enabled') ||
  key.endsWith('_auto_refresh_interval') ||
  key.endsWith('_refresh_interval') ||
  key.endsWith('_view_mode');

/**
 * Clears the session, mirroring the V1 logout hook (client/src/hooks/logout.js):
 * access-token cookies are removed, remember-me cookies are preserved, and
 * local/session storage is cleared while keeping V2 display/refresh preferences.
 */
export function logout() {
  const name = cookieName();

  const preservedStorage = {};
  Object.keys(localStorage).forEach((key) => {
    if (shouldPreserveStorageKey(key)) {
      preservedStorage[key] = localStorage.getItem(key);
    }
  });

  Cookies.remove(name, { path: '/' });
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;

  document.cookie.split(';').forEach((cookie) => {
    const key = cookie.split('=')[0].trim();
    if (key && !PRESERVED_COOKIES.includes(key)) {
      document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    }
  });

  localStorage.clear();
  Object.entries(preservedStorage).forEach(([key, value]) => {
    if (value !== null) localStorage.setItem(key, value);
  });

  sessionStorage.clear();
}
