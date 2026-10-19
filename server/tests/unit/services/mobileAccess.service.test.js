import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/database.js', () => ({ redis: { get: vi.fn() } }));
vi.mock('../../../core/v2/admin/admin.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../../core/v2/permission/permissions.utility.js', () => ({ default: { resolveRolePermission: vi.fn() } }));
vi.mock('../../../core/v2/logsConfiguration/logsConfiguration.service.js', () => ({ default: { resolveLogsForAdmin: vi.fn() } }));
vi.mock('../../../core/v2/sessions/sessions.service.js', () => ({ default: { enforceRequestSession: vi.fn() } }));
vi.mock('../../../socket.js', () => ({ getCameraLimitSnapshot: vi.fn(), getDetectionLicenseSnapshot: vi.fn() }));

import { redis } from '../../../utils/database.js';
import admins from '../../../core/v2/admin/admin.model.js';
import permissions from '../../../core/v2/permission/permissions.utility.js';
import logs from '../../../core/v2/logsConfiguration/logsConfiguration.service.js';
import sessions from '../../../core/v2/sessions/sessions.service.js';
import { getCameraLimitSnapshot, getDetectionLicenseSnapshot } from '../../../socket.js';
import { resolveMobileAccess, enforceEmbeddedAccess, checkParentSession } from '../../../core/v2/mobileAccess/mobileAccess.service.js';

const identity = { adminId: 'tenant', memberId: 'member', user_id: '13', exp: 9999999999 };
const grant = () => ({ claims: identity, screenId: 'stockCountingAnalytics', parentHash: 'parent-hash', parentSessionId: 'native-session', parentDeviceId: 'native-device' });
beforeEach(() => {
  vi.stubEnv('MOBILE_FRONTEND_URL', 'https://dev.example.com');
  vi.resetAllMocks();
  admins.findById.mockReturnValue({ select: () => ({ lean: async () => ({ moduleConfig: {} }) }) });
  permissions.resolveRolePermission.mockResolvedValue({ roles: [{ roleName: 'custom', permissionConfig: { logs: { stockCountingLogs: { view: true } } } }] });
  logs.resolveLogsForAdmin.mockResolvedValue({ stockCountingLogs: true });
  sessions.enforceRequestSession.mockResolvedValue({ allowed: true });
  getCameraLimitSnapshot.mockResolvedValue({ purchasedCameras: 100, added: 53, remaining: 47, licensed: true });
  getDetectionLicenseSnapshot.mockResolvedValue({ camerasInUse: 4, remaining: 96, detections: [], allowedDetections: [] });
  redis.get.mockImplementation(async key => key.startsWith('mobile:sso:session:') ? JSON.stringify(grant()) : null);
});
afterEach(() => vi.unstubAllEnvs());

describe('real mobile access resolution', () => {
  it('preserves real snapshots and filters pages by the current user', async () => {
    const result = await resolveMobileAccess(identity);
    expect(result.purchasedCameras.added).toBe(53);
    expect(result.detectionLicense.camerasInUse).toBe(4);
    expect(result.screens.map(s => s.webPath)).toEqual(['/logs/stock-counting', '/logs/stock-counting/analytics']);
    expect(result).not.toHaveProperty('pageAccess');
    expect(permissions.resolveRolePermission).toHaveBeenCalledWith({ adminId: 'tenant', memberId: 'member' });
    expect(logs.resolveLogsForAdmin).toHaveBeenCalledWith({ adminId: 'tenant', userId: '13' });
  });
  it('fails closed on missing role data and inactive camera licensing', async () => {
    permissions.resolveRolePermission.mockResolvedValue({ error: 'ROLE_MISSING' });
    await expect(resolveMobileAccess(identity)).rejects.toThrow();
    permissions.resolveRolePermission.mockResolvedValue({ roles: [{ permissionConfig: { logs: { global: { view: true } } } }] });
    getCameraLimitSnapshot.mockResolvedValue({ licensed: false });
    expect((await resolveMobileAccess(identity)).screens).toEqual([]);
  });
  it('forces the native session/device instead of browser headers', async () => {
    const req = { headers: { 'x-session-id': 'untrusted-session', 'x-device-id': 'browser-device' } };
    expect(await enforceEmbeddedAccess(req, { ...identity, mobileEmbedId: 'web-session' })).toBe(true);
    expect(req.headers['x-session-id']).toBe('native-session');
    expect(req.headers['x-device-id']).toBe('native-device');
    expect(sessions.enforceRequestSession.mock.calls[0][0].headers['x-session-id']).toBe('native-session');
    expect(getDetectionLicenseSnapshot).not.toHaveBeenCalled();
    expect(logs.resolveLogsForAdmin).toHaveBeenCalled();
    expect(req.mobileEmbeddedScreen.id).toBe('stockCountingAnalytics');
  });
  it('denies missing, revoked, expired or mismatched embedded sessions', async () => {
    const claims = { ...identity, mobileEmbedId: 'web' };
    redis.get.mockResolvedValue(null);
    expect(await enforceEmbeddedAccess({ headers: {} }, claims)).toBe(false);
    redis.get.mockImplementation(async key => key.startsWith('mobile:sso:session:') ? JSON.stringify(grant()) : 'revoked');
    expect(await enforceEmbeddedAccess({ headers: {} }, claims)).toBe(false);
    redis.get.mockResolvedValueOnce(JSON.stringify({ ...grant(), claims: { ...identity, exp: 1 } }));
    expect(await enforceEmbeddedAccess({ headers: {} }, claims)).toBe(false);
    redis.get.mockImplementation(async key => key.startsWith('mobile:sso:session:') ? JSON.stringify(grant()) : null);
    expect(await enforceEmbeddedAccess({ headers: {} }, { ...claims, adminId: 'other' })).toBe(false);
  });
  it('denies deleted/blocked parent sessions and newly revoked log access', async () => {
    sessions.enforceRequestSession.mockResolvedValue({ allowed: false });
    expect(await enforceEmbeddedAccess({ headers: {} }, { ...identity, mobileEmbedId: 'web' })).toBe(false);
    sessions.enforceRequestSession.mockResolvedValue({ allowed: true });
    logs.resolveLogsForAdmin.mockResolvedValue({ stockCountingLogs: false });
    expect(await enforceEmbeddedAccess({ headers: {} }, { ...identity, mobileEmbedId: 'web' })).toBe(false);
  });
  it('does not attach an unrelated browser session to a token-only mobile login', async () => {
    const req = { headers: { 'x-session-id': 'browser-session', 'x-device-id': 'browser-device' } };
    expect(await checkParentSession(req, { ...grant(), parentSessionId: null, parentDeviceId: '' })).toBe(true);
    expect(sessions.enforceRequestSession.mock.calls[0][0].headers).toEqual({});
    expect(req.headers['x-session-id']).toBe('browser-session');
  });
});
