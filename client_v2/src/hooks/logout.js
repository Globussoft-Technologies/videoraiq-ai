import Cookies from 'js-cookie';

const url = import.meta.env.VITE_ENV;

const cookieName = () =>
  url === 'dev' ? 'dev-access-token' : url === 'prod' ? 'prod-access-token' : 'access-token';

/**
 * Clears the session, mirroring the V1 logout hook (client/src/hooks/logout.js):
 * the access-token cookie is removed but the per-portal "remember-me" cookies
 * (admin-remember-me / user-remember-me) and the V2 theme preference are
 * preserved so the login form can still prefill.
 */
export function logout() {
  const name = cookieName();
  Cookies.remove(name, { path: '/' });
  // Belt-and-suspenders: clear regardless of how the attribute set was written.
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
}
