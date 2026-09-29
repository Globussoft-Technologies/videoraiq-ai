import axios from 'axios';
import { initializeApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';

/**
 * Web push for incident alerts (Firebase Cloud Messaging). Complements the
 * `cameradetection_${adminId}` socket: the socket covers an open tab, push
 * covers a closed or backgrounded one. All of it is a no-op until the
 * VITE_FIREBASE_* env vars are set, so the app runs unchanged without them.
 *
 * Keep FIREBASE_VERSION in public/firebase-messaging-sw.js equal to the
 * `firebase` version in package.json.
 */

const env = (key) => String(import.meta.env[key] || '').trim();
const apiUrl = import.meta.env.VITE_BACKEND;

const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
};
const vapidKey = env('VITE_FIREBASE_VAPID_KEY');

// The token this browser registered, so logout can remove exactly that one.
// Not in logout.js's PRESERVED_STORAGE_KEYS — logout reads it first, then clears it.
export const WEB_PUSH_TOKEN_KEY = 'vq_web_push_token';

const configured = () => Object.values(firebaseConfig).every(Boolean) && Boolean(vapidKey);

let messagingPromise;
function messagingOrNull() {
  if (!configured()) return Promise.resolve(null);
  messagingPromise ??= isSupported()
    .then((ok) => (ok ? getMessaging(initializeApp(firebaseConfig, 'push')) : null))
    .catch(() => null);
  return messagingPromise;
}

/** True when this browser currently receives incident pushes (so the socket shouldn't also pop a desktop notification). */
export const webPushActive = () => Boolean(localStorage.getItem(WEB_PUSH_TOKEN_KEY));

/**
 * Subscribe this browser and register its token with the backend. Safe to call
 * repeatedly (e.g. on every app load) — FCM returns the same token and the
 * backend upserts it.
 */
export async function registerWebPush(accessToken) {
  try {
    if (!accessToken || !('Notification' in window) || !('serviceWorker' in navigator)) return;
    const messaging = await messagingOrNull();
    if (!messaging) return;

    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return;

    // A service worker can't read Vite env vars, so it gets the (public) web
    // config through its own URL. The dedicated scope keeps it from ever
    // controlling app pages.
    const registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${new URLSearchParams(firebaseConfig)}`,
      { scope: '/firebase-cloud-messaging-push-scope' },
    );
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return;

    await axios.post(
      `${apiUrl}/push-tokens/register`,
      { token, platform: 'web' },
      { headers: { 'x-access-token': accessToken } },
    );
    localStorage.setItem(WEB_PUSH_TOKEN_KEY, token);
  } catch (error) {
    console.warn('[push] web push registration failed:', error?.message || error);
  }
}

/** Stop pushes to this browser — on logout, or when desktop notifications are turned off. */
export async function unregisterWebPush(accessToken) {
  const token = localStorage.getItem(WEB_PUSH_TOKEN_KEY);
  if (!token) return;
  localStorage.removeItem(WEB_PUSH_TOKEN_KEY);

  try {
    await axios.post(
      `${apiUrl}/push-tokens/unregister`,
      { token },
      { headers: { 'x-access-token': accessToken }, skipSessionRedirect: true },
    );
  } catch {
    // The deleteToken below still stops delivery even if this call failed.
  }
  try {
    const messaging = await messagingOrNull();
    if (messaging) await deleteToken(messaging);
  } catch {
    // Already invalid / unsupported browser — nothing left to stop.
  }
}
