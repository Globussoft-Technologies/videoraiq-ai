/* global importScripts, firebase, clients */
// Background incident notifications (Firebase Cloud Messaging) for the web app.
// Registered by src/utils/webPush.js, which passes the public Firebase web
// config in this script's query string — a service worker can't read Vite env.
//
// Keep FIREBASE_VERSION equal to the `firebase` version in package.json.
const FIREBASE_VERSION = '12.19.0';
importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`);
importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`);

firebase.initializeApp(Object.fromEntries(new URL(self.location.href).searchParams));

// The backend sends web pushes data-only, so the SDK never auto-displays one
// and this is the single place a background notification is created. Firebase
// only calls this when no tab of the app is visible; a visible tab already
// shows the in-app alert from the socket.
firebase.messaging().onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  if (data.type !== 'incident') return undefined;

  return self.registration.showNotification(data.title || 'Detection', {
    body: data.body || '',
    // Incident snapshot, as a large image under the text (Chrome/Edge).
    ...(data.image ? { image: data.image } : {}),
    // Same tag the socket-driven desktop notification uses, so the two can
    // never stack for one incident.
    tag: `incident-${data.incidentId}-${data.timeOfIncident}`,
    silent: false, // browsers play the OS notification sound; web can't choose a custom one
    data: { url: '/incidents' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      return open ? open.focus() : clients.openWindow(url);
    }),
  );
});
