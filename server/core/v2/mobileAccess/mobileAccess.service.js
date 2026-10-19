import config from 'config';
import { redis } from '../../../utils/database.js';
import admins from '../admin/admin.model.js';
import permissions from '../permission/permissions.utility.js';
import logsService from '../logsConfiguration/logsConfiguration.service.js';
import sessions from '../sessions/sessions.service.js';
import { normalizePermissionConfig } from '../../../constants/tourModules.js';
import { permittedWebScreens } from '../../../constants/mobileWebScreens.js';

export function mobileFrontendUrl() {
  const configured = process.env.MOBILE_FRONTEND_URL || (config.has('frontend.baseUrl') ? config.get('frontend.baseUrl') : config.get('webUrl'));
  const url = new URL(configured);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Mobile frontend URL requires HTTPS');
  return url.origin;
}

export async function resolveMobileAccess(identity, { includeDetectionDetails = true } = {}) {
  if (!identity?.adminId || identity.system || identity.tokenType === 'api-key' || identity.registrationLinkId) throw new Error('A user login is required');
  const { adminId, memberId, user_id: userId } = identity;
  const [admin, roleResult, logs] = await Promise.all([
    admins.findById(adminId).select('moduleConfig').lean(),
    permissions.resolveRolePermission({ adminId, memberId }),
    logsService.resolveLogsForAdmin({ adminId, userId }),
  ]);
  const role = roleResult.roles?.[0];
  if (!admin || roleResult.error || !role?.permissionConfig || !logs) throw new Error('Unable to resolve current screen access');
  const permissionConfig = normalizePermissionConfig(role.permissionConfig, role.roleName);
  // Lazy import: the socket subscriber already imports logs services lazily.
  const { getCameraLimitSnapshot, getDetectionLicenseSnapshot } = await import('../../../socket.js');
  const [purchasedCameras, detectionLicense] = await Promise.all([
    getCameraLimitSnapshot({ adminId, userId }), includeDetectionDetails ? getDetectionLicenseSnapshot({ adminId, userId }) : Promise.resolve(null),
  ]);
  if (includeDetectionDetails && !detectionLicense) throw new Error('Unable to resolve detection licence');
  const moduleConfig = { modules: admin.moduleConfig || {} };
  return { schemaVersion: 1, frontendUrl: mobileFrontendUrl(), purchasedCameras, detectionLicense,
    logsConfiguration: { logs, timestamp: new Date().toISOString() }, moduleConfig,
    permissions: permissionConfig,
    socketEvents: Object.fromEntries(['purchasedCameras', 'detectionLicense', 'logsConfiguration', 'moduleConfig'].map(name => [name, `${name}_${adminId}`])),
    screens: purchasedCameras.licensed ? permittedWebScreens({ permissions: permissionConfig, logs, modules: moduleConfig.modules }) : [],
  };
}

export async function checkParentSession(req, grant) {
  const scopedReq = Object.create(req);
  scopedReq.headers = { ...req.headers };
  if (grant.parentSessionId) scopedReq.headers['x-session-id'] = grant.parentSessionId;
  else delete scopedReq.headers['x-session-id'];
  if (grant.parentDeviceId) scopedReq.headers['x-device-id'] = grant.parentDeviceId;
  else delete scopedReq.headers['x-device-id'];
  return (await sessions.enforceRequestSession(scopedReq, grant.claims)).allowed;
}

export async function enforceEmbeddedAccess(req, claims) {
  const grant = JSON.parse(await redis.get(`mobile:sso:session:${claims.mobileEmbedId}`) || 'null');
  if (!grant || grant.claims.exp * 1000 <= Date.now() ||
      await redis.get(`mobile:sso:revoked:${grant.parentHash}`) || !await checkParentSession(req, grant)) return false;
  if (String(claims.adminId) !== String(grant.claims.adminId) || String(claims.memberId || '') !== String(grant.claims.memberId || '')) return false;
  const access = await resolveMobileAccess(grant.claims, { includeDetectionDetails: false });
  const screen = access.screens.find(screen => screen.id === grant.screenId);
  if (!screen) return false;
  req.mobileEmbeddedScreen = screen;
  if (grant.parentSessionId) req.headers['x-session-id'] = grant.parentSessionId;
  else delete req.headers['x-session-id'];
  if (grant.parentDeviceId) req.headers['x-device-id'] = grant.parentDeviceId;
  else delete req.headers['x-device-id'];
  return true;
}
