import getAccessToken from './getAccessToken';
import { ensureAccessToken, refreshAccessToken, isBackendRequest, installAuthenticatedFetch, tokenClaims } from './refreshAuth';
import axios from 'axios';
import { sessionHeaders } from './sessionIdentity';
import { logout } from '@/hooks/logout';
import { isMobileEmbedded, clearMobileEmbed } from './mobileEmbed';

installAuthenticatedFetch();

function requestUrl(config) {
  if (!config?.url) return '';
  if (/^https?:\/\//i.test(config.url) || !config.baseURL) return config.url;
  return `${config.baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`;
}

export function installAxiosSession(instance) {
  instance.interceptors.request.use(async (config) => {
    if (!isBackendRequest(requestUrl(config))) return config;
    config.headers = config.headers || {};
    Object.assign(config.headers, await sessionHeaders());
    config.headers['x-auth-refresh'] = '1';
    config.withCredentials = true;
    if (!config.skipAuthRefresh && (config.requiresAuth || config.headers['x-access-token'] || getAccessToken()) && !/\/auth\/(?:by-|refresh|logout)|\/users\/(?:login|forgot-password|reset-password)/.test(config.url)) {
      try { config.headers['x-access-token'] = await ensureAccessToken(); }
      catch (error) {
        // Preserve network/upstream errors without clearing a valid session.
        if (error.status === 401 || error.status === 403) {
          await logout({ clearSession: true });
          window.location.replace('/admin-login');
        }
        throw error;
      }
    }
    return config;
  });

  // A blocked/logged-out session usually surfaces on several in-flight requests
  // at once (a busy dashboard page has many concurrent API calls) — without this
  // guard, every one of them independently called logout()+replace(), racing
  // several overlapping logouts and navigations against each other while the
  // page was mid-unload. That's consistent with a dashboard that goes blank and
  // never actually reaches /admin-login: the first replace() starts tearing the
  // page down while later ticks are still running JS against it.
  let sessionRedirectStarted = false;

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (!isBackendRequest(requestUrl(error?.config))) return Promise.reject(error);
      const code = error?.response?.data?.code || error?.response?.data?.body?.code;
      if (code === 'ACCESS_TOKEN_EXPIRED' && tokenClaims(error.config?.headers?.['x-access-token'])?.tokenType === 'browser-access' && !error.config._authRetried && !error.config.skipAuthRefresh && !isMobileEmbedded()) {
        error.config._authRetried = true;
        try {
          // A concurrent response may already have renewed the cookie.
          const current = getAccessToken();
          const old = error.config.headers?.['x-access-token'];
          const token = current && current !== old ? current : await refreshAccessToken();
          error.config.headers['x-access-token'] = token;
          return instance(error.config);
        } catch (refreshError) {
          if (refreshError.status === 401 || refreshError.status === 403) {
            await logout({ clearSession: true });
            window.location.replace('/admin-login');
          }
          return Promise.reject(refreshError);
        }
      }
      const body = error?.response?.data?.body || error?.response?.data;
      if (
        !sessionRedirectStarted &&
        !error?.config?.skipSessionRedirect &&
        ['SUBSCRIPTION_EXPIRED', 'SESSION_BLOCKED', 'SESSION_LOGGED_OUT', 'SESSION_INVALID', 'DEVICE_BLOCKED'].includes(body?.code)
      ) {
        sessionRedirectStarted = true;
        if (isMobileEmbedded()) {
          clearMobileEmbed();
          window.location.replace('/mobile-sso');
          return Promise.reject(error);
        }
        // clearSession: true — a blocked/logged-out sessionId must never survive
        // into the next login attempt. Left false previously, a re-login could
        // immediately re-trip the same revoked session via the leftover cookie.
        await logout({ clearSession: true, syncServer: false });
        window.location.replace('/admin-login');
      }
      return Promise.reject(error);
    }
  );

}

installAxiosSession(axios);
