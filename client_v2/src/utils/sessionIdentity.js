import Cookies from 'js-cookie';
import CryptoJS from 'crypto-js';

const SESSION_ID_KEY = 'vq_session_id';
const CLIENT_ID_KEY = 'vq_client_id';

// A persisted random ID, unique per browser install (localStorage doesn't sync across
// machines/profiles, and survives reloads/tab-closes unlike the fingerprint below).
// Without this, two desktops with the same OS/browser/screen-resolution/locale produce
// an IDENTICAL fingerprint hash — logging in on the second machine then looks like the
// same device re-logging in and incorrectly logs the first one out. Falls back to a
// non-persisted random value if localStorage is unavailable (e.g. disabled/private
// contexts on some browsers) — device-scoped behavior degrades gracefully there rather
// than throwing.
function getClientId() {
  try {
    let clientId = window.localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
      window.localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
  } catch {
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  }
}

export function getDeviceId() {
  const nav = window.navigator || {};
  const screenInfo = window.screen || {};
  // navigator.hardwareConcurrency/deviceMemory are intentionally excluded:
  // browsers (esp. on mobile) clamp or omit these in private/incognito tabs,
  // which changed the hash and let blocked devices bypass the block there.
  const fingerprintParts = [
    getClientId(),
    nav.platform || '',
    nav.maxTouchPoints || '',
    Array.isArray(nav.languages) ? nav.languages.join(',') : nav.language || '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    Math.max(screenInfo.width || 0, screenInfo.height || 0),
    Math.min(screenInfo.width || 0, screenInfo.height || 0),
    screenInfo.colorDepth || '',
  ];

  return CryptoJS.SHA256(fingerprintParts.join('|')).toString();
}

export function getSessionId() {
  return Cookies.get(SESSION_ID_KEY) || null;
}

export function setSessionId(sessionId) {
  if (!sessionId) return;
  Cookies.set(SESSION_ID_KEY, sessionId, {
    expires: 1,
    secure: window.location.protocol === 'https:',
    path: '/',
  });
}

export function clearSessionId() {
  Cookies.remove(SESSION_ID_KEY, { path: '/' });
  document.cookie = `${SESSION_ID_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
}

export async function getBrowserName() {
  try {
    if (navigator.brave && await navigator.brave.isBrave()) {
      return 'Brave';
    }
  } catch (e) {
    // ignore
  }

  const ua = window.navigator.userAgent || '';
  if (/PowerBrowser|Power Browser/i.test(ua)) return "PowerBrowser";
  if (/EdgiOS\//.test(ua) || /Edg\//.test(ua)) return "Microsoft Edge";
  if (/OPiOS\//.test(ua) || /OPR\//.test(ua) || /Opera\//.test(ua)) return "Opera";
  if (/CriOS\//.test(ua) || (/Chrome\//.test(ua) && !/Chromium\//.test(ua))) return "Chrome";
  if (/FxiOS\//.test(ua) || /Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  
  return "";
}

export async function sessionHeaders() {
  const headers = { 'x-device-id': getDeviceId() };
  const sessionId = getSessionId();
  if (sessionId) headers['x-session-id'] = sessionId;
  
  const browser = await getBrowserName();
  if (browser) headers['x-browser'] = browser;
  
  return headers;
}
