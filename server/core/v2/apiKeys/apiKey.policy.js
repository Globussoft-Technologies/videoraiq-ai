import { createHash } from 'node:crypto';
import moment from 'moment';

export const KEY_PATTERN = /^vrq_[A-Za-z0-9_-]{43}$/;
export const hashKey = value => createHash('sha256').update(value).digest('hex');
export const API_SCOPES = [
  { id: 'cameras', label: 'Cameras and NVRs', routes: ['nvr', 'channel', 'client-config'] },
  { id: 'incidents', label: 'Incidents and alerts', routes: ['incidents', 'alert', 'alerts'] },
  { id: 'people', label: 'Users, roles and departments', routes: ['profiles', 'authorizedUsers', 'users', 'departments', 'roles', 'permissions', 'authorizedChannels', 'locations', 'shifts'] },
  { id: 'detections', label: 'Detections and schedules', routes: ['detection-settings', 'global-schedules', 'detection-objects', 'authorizedObjects'] },
  { id: 'logs', label: 'Logs, attendance and measurements', routes: ['attendance', 'accessLogs', 'entry', 'vehicle', 'measurement-logs', 'measurements', 'measurement-incidents', 'video-records'] },
  { id: 'reports', label: 'Reports and auto-email reports', routes: ['auto-email-report', 'attendance-auto-email-reports', 'measurement-auto-email-reports', 'solder-auto-email-reports'] },
  { id: 'analytics', label: 'Dashboard and analytics', routes: ['dashboard', 'analytics'] },
  { id: 'media', label: 'Files, uploads and snapshots', routes: ['uploads', 'files', 'faceImages', 'measurement-media'] },
  { id: 'settings', label: 'Account and service settings', routes: ['admin', 'logs-configuration', 'telegram', 'push-tokens', 'admin-storage', 'measurement-calibration', 'recipients'] },
];
// POST query endpoints need an explicit allowlist: HTTP method alone is not enough.
const READ_POSTS = new Set([
  '/incidents', '/incidents/getIncidentsDetails', '/incidents/deskAbsenceData', '/incidents/guardAbsenceData',
  '/attendance/get', '/attendance/export', '/attendance/user-logs', '/users/fetch', '/users/allOrgEmployee',
  '/authorizedUsers/fetch', '/authorizedUsers/fetch-unique-locations', '/roles/get', '/departments/get',
  '/locations/fetch', '/locations/fetch-by-id', '/locations/employee-location', '/authorizedObjects/fetch',
  '/authorizedChannels/locations', '/authorizedChannels/departments', '/authorizedChannels/getNVRS', '/authorizedChannels/getChannels',
  '/permissions/roles_permissions', '/profiles/bulk-export', '/shifts/schedule', '/shifts/assignments/preview',
  '/accessLogs/getAccessLogs', '/accessLogs/get', '/accessLogs/getUserSessionReport',
  '/dashboard/headerStats', '/dashboard/criticalityStats', '/dashboard/detectionChart', '/dashboard/dashboardWeeklyComparisonChart', '/dashboard/getDetections',
  '/channel/playback-url', '/channel/playback-timeline', '/channel/playback-thumbnail', '/channel/playBackFilters',
]);
const CREDENTIAL_PATH = /(?:^|\/)(?:login|forgot-password|reset-password|change-password|[^/]*token[^/]*|registration-link|signUp|webhook|link-code)(?:\/|$)/i;
const MUTATING_GET = /(?:^|\/)(?:delete[^/]*|logout|revoke[^/]*|reset[^/]*|edit|start|stop|enable|disable|activate|deactivate)(?:\/|$)/i;

export function keyAllows(key, method, originalUrl) {
  let path;
  try { path = decodeURIComponent(new URL(originalUrl, 'https://api.local').pathname).replace(/\/+$/, ''); }
  catch { return false; }
  const match = /^\/api\/v[12](\/([^/]+)(?:\/.*)?)$/.exec(path);
  if (!match || CREDENTIAL_PATH.test(match[1])) return false;
  // Licensing grants and admin permission rewrites are not integration APIs.
  if (method !== 'GET' && method !== 'HEAD' && ['/admin/allowed-detections', '/permissions/update-admin-permissions'].includes(match[1])) return false;
  const scope = API_SCOPES.find(item => item.routes.includes(match[2]));
  if (!scope || (!key.scopes.includes('*') && !key.scopes.includes(scope.id))) return false;
  if (key.access === 'full') return ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  return (['GET', 'HEAD'].includes(method) && !MUTATING_GET.test(match[1])) || (method === 'POST' && READ_POSTS.has(match[1]));
}

export function expiryFromDuration(duration, unit, now = new Date()) {
  if (!Number.isSafeInteger(duration) || duration < 1 || !['days', 'years'].includes(unit)) return null;
  const expires = moment.utc(now).add(duration, unit);
  return expires.isValid() && expires.valueOf() > +now ? expires.toDate() : null;
}

export function activeSubscriptions(subscriptions, now = Date.now()) {
  const values = subscriptions instanceof Map ? [...subscriptions.values()] : Object.values(subscriptions || {});
  return values.some(value => {
    if (!value) return false;
    const date = new Date(value);
    return Number.isFinite(+date) && Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999) > now;
  });
}
