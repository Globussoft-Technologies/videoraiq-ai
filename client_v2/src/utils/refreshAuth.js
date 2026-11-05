import Cookies from 'js-cookie';
import getAccessToken from './getAccessToken';
import { sessionHeaders, setSessionId } from './sessionIdentity';
import { isMobileEmbedded } from './mobileEmbed';
import { decodeJwtPayload } from './jwt';

const HOST = import.meta.env.VITE_BACKEND;
let pendingRefresh = null;
let signingOut = false;
export const accessCookieName = () => import.meta.env.VITE_ENV === 'dev' ? 'dev-access-token'
  : import.meta.env.VITE_ENV === 'prod' ? 'prod-access-token' : 'access-token';

export function tokenClaims(token = getAccessToken()) {
  return decodeJwtPayload(token);
}

export function saveAccessToken(token, sessionId) {
  signingOut = false;
  Cookies.set(accessCookieName(), token, { expires: 1, secure: location.protocol === 'https:', path: '/' });
  if (sessionId) setSessionId(sessionId);
  window.dispatchEvent(new Event('vq-access-token'));
}

export function isBackendRequest(url) {
  try {
    const base = new URL(HOST, location.origin);
    const target = new URL(url, location.origin);
    return target.origin === base.origin && (target.pathname === base.pathname || target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`));
  } catch { return false; }
}

export function refreshAccessToken() {
  if (isMobileEmbedded() || signingOut) return Promise.reject(new Error('Session is ending'));
  if (pendingRefresh) return pendingRefresh;
  const before = getAccessToken();
  const renew = async () => {
    const current = getAccessToken();
    // Another tab may have refreshed while this tab waited for the lock.
    if (current && current !== before && tokenClaims(current)?.exp * 1000 > Date.now() + 30000) return current;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (signingOut) throw new Error('Session is ending');
      const response = await fetch(`${HOST}/auth/refresh`, {
        method: 'POST', credentials: 'include',
        headers: { ...(await sessionHeaders()), 'x-auth-refresh': '1' },
      });
      const body = await response.json();
      if (response.status === 409 && body.code === 'REFRESH_RETRY' && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 300));
        continue;
      }
      if (!response.ok || !body.token) {
        const error = new Error(body.message || 'Unable to renew session');
        error.status = response.status;
        error.code = body.code;
        throw error;
      }
      if (signingOut) throw new Error('Session is ending');
      saveAccessToken(body.token, body.sessionId);
      return body.token;
    }
  };
  pendingRefresh = (navigator.locks
    ? navigator.locks.request('vq-auth-refresh', renew)
    : renew()).finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}

export async function ensureAccessToken() {
  const token = getAccessToken();
  if (isMobileEmbedded()) return token;
  const claims = tokenClaims(token);
  if (!token || (claims?.tokenType === 'browser-access' && claims.exp * 1000 < Date.now() + 30000)) {
    return refreshAccessToken();
  }
  return token;
}

export async function authFetch(url, options = {}) {
  let token = await ensureAccessToken();
  const send = () => fetch(url, {
    ...options, credentials: 'include',
    headers: { ...options.headers, 'x-access-token': token },
    // by-login-token historically accepts the token in the body as well.
    ...(url.endsWith('/auth/by-login-token') ? { body: JSON.stringify({ token }) } : {}),
  });
  let response = await send();
  if (response.status === 401) {
    const body = await response.clone().json().catch(() => ({}));
    if ((body.code || body.body?.code) === 'ACCESS_TOKEN_EXPIRED' && tokenClaims(token)?.tokenType === 'browser-access') {
      token = await refreshAccessToken();
      response = await send();
    }
  }
  return response;
}

export async function endRefreshSession() {
  signingOut = true;
  // Let an in-flight rotation settle before clearing the server cookie.
  try { await pendingRefresh; } catch { /* local logout still proceeds */ }
  await fetch(`${HOST}/auth/logout`, {
    method: 'POST', credentials: 'include', keepalive: true, headers: { 'x-auth-refresh': '1' },
  }).catch(() => {});
}

// Native fetch users (exports, media and station tools) share renewal too.
// Scope interception to authenticated requests to this V2 backend only.
export function installAuthenticatedFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    const target = new URL(url, location.origin);
    const hasQueryToken = target.searchParams.has('token');
    if (!isBackendRequest(url) || isMobileEmbedded() || (!headers.has('x-access-token') && !hasQueryToken)
      || /\/auth\/|\/mobile-access\//.test(target.pathname)) return nativeFetch(input, options);
    const template = input instanceof Request ? input.clone() : null;
    let token = await ensureAccessToken();
    const send = () => {
      if (headers.has('x-access-token')) headers.set('x-access-token', token);
      if (hasQueryToken) target.searchParams.set('token', token);
      const nextOptions = { ...options, headers, credentials: 'include' };
      return nativeFetch(template ? new Request(target, template.clone()) : target, nextOptions);
    };
    let response = await send();
    if (response.status === 401) {
      const body = await response.clone().json().catch(() => ({}));
      if ((body.code || body.body?.code) === 'ACCESS_TOKEN_EXPIRED' && tokenClaims(token)?.tokenType === 'browser-access') {
        token = await refreshAccessToken();
        response = await send();
      }
    }
    return response;
  };
}
