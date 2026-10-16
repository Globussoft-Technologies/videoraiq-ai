import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

import { createMobileScreensRouter } from '../../core/v2/mobileScreens/mobileScreens.router.js';
import { MOBILE_SCREENS, buildMobileCatalogue } from '../../constants/mobileScreens.js';

function setup({ permissionConfig = { logs: { global: { view: true } } }, moduleConfig = {}, effectiveLogs, identity = { adminId: 'tenant-a', memberId: 'member-a', user_id: 'owner-a' }, roleError = false } = {}) {
  const permissions = { resolveRolePermission: vi.fn().mockResolvedValue(roleError ? { error: 'UNAVAILABLE' } : { roles: [{ roleName: 'custom', permissionConfig }] }) };
  const logs = { resolveLogsForAdmin: vi.fn().mockResolvedValue(effectiveLogs ?? Object.fromEntries(MOBILE_SCREENS.filter((s) => s.logsConfigKey).map((s) => [s.logsConfigKey, true]))) };
  const admins = { findById: vi.fn(() => ({ select: () => ({ lean: async () => ({ moduleConfig }) }) })) };
  const incidents = { getConveyorDetectionLogs: vi.fn((req, res) => res.json({ query: req.query, tenant: req.verified.userData.adminId })) };
  const app = express();
  app.use((req, res, next) => { req.verified = { userData: identity }; next(); });
  app.use('/mobile-screens', createMobileScreensRouter({ admins, permissions, logs, incidents }));
  app.use((err, req, res, next) => res.status(500).json({ message: err.message }));
  return { app, permissions, logs, incidents };
}

describe('mobile screen catalogue', () => {
  it('describes supported native lists without exposing executable or web routing details', async () => {
    const { app } = setup();
    const response = await request(app).get('/mobile-screens');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    const catalogue = response.body.body.data;
    expect(catalogue.schemaVersion).toBe(1);
    const conveyor = catalogue.screens.find((s) => s.id === 'conveyorLogs');
    expect(conveyor.request.endpoint).toBe('/mobile-screens/conveyorLogs/records');
    expect(conveyor.fields).toContainEqual(expect.objectContaining({ path: 'currentStatus', type: 'enum' }));
    expect(conveyor).not.toHaveProperty('handler');
    expect(conveyor).not.toHaveProperty('path');
    expect(new Set(catalogue.screens.map((s) => s.id)).size).toBe(catalogue.screens.length);
    expect(catalogue.screens.find((s) => s.id === 'attendanceLogs').renderer).toBe('native');
  });

  it('filters individual role grants and disabled logs', async () => {
    const { app } = setup({ permissionConfig: { logs: { conveyorLogs: { view: true }, crusherLogs: { view: false } } } });
    const response = await request(app).get('/mobile-screens');
    expect(response.body.body.data.screens.map((s) => s.id)).toEqual(['conveyorLogs']);
    const disabled = setup({ effectiveLogs: { conveyorLogs: false } });
    expect((await request(disabled.app).get('/mobile-screens')).body.body.data.screens).toEqual([]);
  });

  it('honours page-level grants for all three specialised modules', () => {
    const context = { permissions: { logs: { global: { view: true } }, settings: { view: true } }, logs: { measurementLogs: true, deskSolarShoulderLogs: true, boxPackingLogs: true }, modules: {
      mattressMeasurement: { measurementLogs: true, measurementCalibration: false },
      solarLineQc: { solderLine: false, solderAlertLogs: true, operatorReports: false },
      boxPackingQc: { boxPacking: false, packingAlertLogs: true, boxPackingReports: false },
    } };
    const screens = buildMobileCatalogue(context).screens;
    expect(screens.filter((s) => s.moduleId !== 'core').map((s) => s.id)).toEqual([
      'mattressMeasurement.measurement', 'boxPackingQc.box-packing-alerts', 'solarLineQc.solder-line-logs',
    ]);
    expect(screens.every((s) => s.renderer === 'native')).toBe(true);
    expect(buildMobileCatalogue({ ...context, permissions: {} }).screens).toEqual([]);
  });

  it('fails closed when authentication or role resolution is unavailable', async () => {
    expect((await request(setup({ identity: {} }).app).get('/mobile-screens')).status).toBe(401);
    expect((await request(setup({ roleError: true }).app).get('/mobile-screens')).status).toBe(403);
  });
});

describe('mobile records', () => {
  it('rechecks access and dispatches only to a registered handler with tenant context', async () => {
    const { app, permissions, incidents } = setup();
    const recorderId = '123456789012345678901234';
    const response = await request(app).get(`/mobile-screens/conveyorLogs/records?limit=10&nvrIds=${recorderId}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ query: { skip: '0', limit: '10', nvrIds: recorderId }, tenant: 'tenant-a' });
    expect(permissions.resolveRolePermission).toHaveBeenCalledWith({ adminId: 'tenant-a', memberId: 'member-a' });
    permissions.resolveRolePermission.mockResolvedValue({ roles: [{ permissionConfig: { logs: { conveyorLogs: { view: false } } } }] });
    expect((await request(app).get('/mobile-screens/conveyorLogs/records')).status).toBe(404);
    expect(incidents.getConveyorDetectionLogs).toHaveBeenCalledTimes(1);
  });

  it.each(['limit=0', 'limit=101', 'skip=-1', 'skip=1.5', 'limit=no', 'all=true', 'endpoint=https://example.com', 'search[x]=y', 'severity=unknown', 'status=unknown', 'nvrIds=bad', 'channelIds=bad', 'startDate=2026-10-01', 'startDate=bad&endDate=bad', 'startDate=2026-10-16&endDate=2026-10-01'])('rejects invalid queries: %s', async (query) => {
    const { app, incidents } = setup();
    expect((await request(app).get(`/mobile-screens/conveyorLogs/records?${query}`)).status).toBe(400);
    expect(incidents.getConveyorDetectionLogs).not.toHaveBeenCalled();
  });

  it('does not dispatch native-only or unknown screens', async () => {
    const { app } = setup();
    expect((await request(app).get('/mobile-screens/attendanceLogs/records')).status).toBe(409);
    expect((await request(app).get('/mobile-screens/unknown/records')).status).toBe(404);
  });
});
