import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

/**
 * Whether Super Admin licensing applies to this deployment.
 *
 * Mirrors `LICENSING_ENABLED` in the backend config, and is deliberately its
 * own variable rather than piggy-backing on VITE_LOCAL_SETUP: that flag already
 * drives stream URLs, auth and the NVR screens, so reusing it would tie
 * licensing to unrelated behaviour and make the two impossible to vary
 * independently.
 *
 * The backend is the real enforcement boundary — it refuses unlicensed writes
 * whatever the UI believes. This flag only stops the app asking for, and
 * reacting to, a licence that does not exist:
 *
 *   false → no camera cap, no per-detection cap, every detection visible,
 *           no licence fetches, no licence blocks.
 *
 * Unset means enabled. A browser build cannot fail loudly the way the backend
 * does, and cloud — where licensing matters — is the case a missing value
 * should fall into. On-premise builds already customise this .env, so setting
 * one more line there is the deliberate act.
 */
export const IS_LICENSING_ENABLED =
  import.meta.env.VITE_LICENSING_ENABLED !== 'false';

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

/**
 * Licensing codes the backend returns with a 403 when a detection cannot be
 * enabled. Mirrors LICENSE_ERRORS in
 * server/core/v2/clientConfig/detectionLicense.service.js.
 */
export const LICENSE_ERRORS = {
  NO_CAMERA_LICENSE: 'NO_CAMERA_LICENSE',
  DETECTION_NOT_LICENSED: 'DETECTION_NOT_LICENSED',
  CAMERA_LICENSE_EXCEEDED: 'CAMERA_LICENSE_EXCEEDED',
  DETECTION_CAMERA_LIMIT_REACHED: 'DETECTION_CAMERA_LIMIT_REACHED',
};

/**
 * The client's own licensing snapshot: purchased camera count, what is in use,
 * and per detection the allocation plus the cameras currently holding a slot.
 * Read-only — the superadmin owns these numbers.
 */
export const getLicense = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/client-config/license`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res) || {};
};

/**
 * Pull the licensing refusal out of an axios error, or return null when the
 * failure was something else (network, validation, permissions) so callers fall
 * back to their normal error toast.
 *
 * The backend answers 403 with Response.accessDeniedResp(message, details), so
 * the message lives at body.message and the machine-readable part at body.error.
 */
export const licenseErrorFrom = (err) => {
  const body = err?.response?.data?.body;
  const details = body?.error;
  if (!details?.code || !LICENSE_ERRORS[details.code]) return null;
  return {
    code: details.code,
    message: body.message || 'This detection cannot be enabled.',
    limit: Number(details.limit) || 0,
    inUse: Number(details.inUse) || 0,
    cameras: Array.isArray(details.cameras) ? details.cameras : [],
  };
};

/**
 * Which log/record pages this client should see.
 *
 * The server is the single source of truth here: GET /logs-configuration
 * already folds together the admin's stored preference, the auto-enable rules
 * (a log switches on when its detection starts running) and the detection
 * licence, so the sidebar just renders what it is told.
 *
 * Returns a { logKey: boolean } map.
 */
export const getLogsConfiguration = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/logs-configuration/`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res) || {};
};
