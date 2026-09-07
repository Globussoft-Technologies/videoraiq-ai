import axios from 'axios';
import { sessionHeaders } from './sessionIdentity';
import { logout } from '@/hooks/logout';

axios.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};
  Object.assign(config.headers, await sessionHeaders());
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

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const body = error?.response?.data?.body || error?.response?.data;
    if (
      !sessionRedirectStarted &&
      !error?.config?.skipSessionRedirect &&
      ['SESSION_BLOCKED', 'SESSION_LOGGED_OUT', 'SESSION_INVALID', 'DEVICE_BLOCKED'].includes(body?.code)
    ) {
      sessionRedirectStarted = true;
      // clearSession: true — a blocked/logged-out sessionId must never survive
      // into the next login attempt. Left false previously, a re-login could
      // immediately re-trip the same revoked session via the leftover cookie.
      logout({ clearSession: true, syncServer: false });
      window.location.replace('/admin-login');
    }
    return Promise.reject(error);
  }
);
