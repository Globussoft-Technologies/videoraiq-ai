import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';
import { serviceCtx, payload } from '../../helpers/service.js';

vi.mock('../../../core/v2/jobs/utils/deletionQueue.js', () => ({ deletionQueue: { add: vi.fn() } }));
vi.mock('../../../core/v2/jobs/jobs.service.js', () => ({ default: {} }));
vi.mock('../../../utils/database.js', () => ({ redis: { publish: vi.fn().mockResolvedValue(1), get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } }));
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../core/v2/alerts/alert.events.js', () => ({ triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../services/push.service.js', () => ({ sendIncidentPush: vi.fn() }));
const { default: service } = await import('../../../core/v2/incidents/incidents.service.js');
const { default: settingsService } = await import('../../../core/v2/detectionSettings/detectionSettings.service.js');
const { getSackLoadingLogs, getSackVehicleNumbers } = await import('../../../core/v2/incidents/sackLoadingLogs.js');
const { default: LogsConfig } = await import('../../../core/v2/logsConfiguration/logsConfiguration.model.js');
const { default: Admin } = await import('../../../core/v1/admin/admin.model.js');
const { default: NVR } = await import('../../../core/v1/NVR/nvr.model.js');
const { default: Channel } = await import('../../../core/v1/channels/channels.model.js');
const { default: Allocation } = await import('../../../core/v2/clientConfig/clientDetectionAllocation.model.js');
const { default: LogsConfigService } = await import('../../../core/v2/logsConfiguration/logsConfiguration.service.js');
const { SackLoadingUnloadingIncident } = await import('../../../core/v1/incidents/incidents.model.js');
const { SackLoadingUnloadingSetting } = await import('../../../core/v1/detectionSettings/detectionSettings.model.js');
let admin, nvr, camera;
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({ user_id: 'sack-client', login: 'sack-client', email: 'sack@test.test' });
  nvr = await NVR.create({ userId: admin.user_id, nvrName: 'Factory NVR', brand: 'hikvision', location: 'factory' });
  const setting = await SackLoadingUnloadingSetting.create({ name: 'Sack bays', userId: admin.user_id, enabled: true, settings: {
    mode: 'both', zone_configs: [{ name: 'Loading Bay', activity_mode: 'loading' }, { name: 'Unloading Bay', activity_mode: 'unloading' }],
  } });
  camera = await Channel.create({ userId: admin.user_id, nvrId: nvr._id, name: 'Factory Camera', isAdded: true,
    detections: { sackLoadingUnloadingSettings: { id: setting._id, enabled: true } } });
  await Allocation.create({ adminId: admin._id, settingType: 'sackLoadingUnloadingSettings', cameraAllocation: 1, enabled: true });
});
const ctx = overrides => {
  const context = serviceCtx({ user_id: admin.user_id, adminId: admin._id, ...overrides });
  context.next = vi.fn(context.next);
  return context;
};
function event(fields = {}) {
  return { incidentType: 'sackLoadingUnloadingDetection', schemaVersion: '1.0', eventId: 'sack-1', vehicleSessionId: 'visit-1',
    incidentName: 'Sack Unloading Detected', description: '2 white sacks, 1 box unloaded.', direction: 'unloading',
    sackCount: 2, whiteSackCount: 2, brownSackCount: 0, otherSackCount: 0, cottonBoxCount: 1, totalCount: 3,
    vehicleNumber: 'KA01AB1234', truckPresent: true, zone: 'Unloading Bay',
    timeOfIncident: '2026-11-16T05:31:09Z', adminId: String(admin._id), cameraId: String(camera._id),
    channelId: String(camera._id), nvrId: String(nvr._id), Image: '/uploads/images/sack.jpg', severity: 'moderate',
    triggerNotification: false, ...fields };
}
async function create(fields) {
  const c = ctx({ body: event(fields) });
  await service.createIncidents(c.req, c.res, c.next);
  expect(c.next).not.toHaveBeenCalled();
  expect(c.res.statusCode).toBe(200);
  return c;
}
describe('Sack loading/unloading ingestion and grouped logs', () => {
  it('toggles the canonical detector and refuses enabling it after license revocation', async () => {
    const { default: channels } = await import('../../../core/v2/channels/channels.service.js');
    const { default: python } = await import('../../../services/python.service.js');
    const startStop = vi.spyOn(python, 'handleDetectionStartStop').mockResolvedValue({});
    try {
      const off = ctx({ body: { channelId: String(camera._id), detectionType: 'sackLoadingUnloadingSettings', enable: false } });
      await channels.toggleDetection(off.req, off.res, off.next);
      expect(off.res.statusCode).toBe(200);
      expect(startStop.mock.calls[0][2]).toBe(false);
      expect(startStop.mock.calls[0][3]).toBe('sackLoadingUnloadingSettings');
      const on = ctx({ body: { channelId: String(camera._id), detectionType: 'sackLoadingUnloadingSettings', enable: true } });
      await channels.toggleDetection(on.req, on.res, on.next);
      expect(on.res.statusCode).toBe(200);
      await channels.toggleDetection(off.req, off.res, off.next);
      await Allocation.updateOne({ adminId: admin._id }, { enabled: false });
      const revoked = ctx({ body: on.req.body });
      await channels.toggleDetection(revoked.req, revoked.res, revoked.next);
      expect(revoked.res.statusCode).toBe(403);
    } finally { startStop.mockRestore(); }
  });

  it('creates and edits settings through the API with Both as a per-zone mode', async () => {
    await Allocation.updateOne({ adminId: admin._id }, { cameraAllocation: 2 });
    const second = await Channel.create({ userId: admin.user_id, nvrId: nvr._id, name: 'Second camera', isAdded: true });
    const settings = { mode: 'both', trigger_notification: true,
      referencePoints: { [second._id]: [[[100,100],[800,100],[800,700],[100,700]]] },
      zone_configs: [{ name: 'Combined Bay', activity_mode: 'both' }],
    };
    const c = ctx({ body: { name: 'Sack Bay Config', settingType: 'sackLoadingUnloadingSettings', enabled: true,
      channelId: [String(second._id)], NVRId: String(nvr._id), settings, alerts: [] } });
    await settingsService.createDetectionSettings(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(201);
    const stored = await SackLoadingUnloadingSetting.findOne({ name: 'Sack Bay Config' });
    expect(stored.settings.zone_configs[0].activity_mode).toBe('both');
    const edit = ctx({ params: { id: String(stored._id) }, body: { settings: { ...settings, zone_configs: [{ name: 'Loading Only', activity_mode: 'loading' }] } } });
    await settingsService.updateDetectionSettings(edit.req, edit.res, edit.next);
    expect(edit.res.statusCode).toBe(200);
    expect((await SackLoadingUnloadingSetting.findById(stored._id)).settings.zone_configs[0].activity_mode).toBe('loading');
  });

  it('accepts the DS incident, deduplicates retries, and groups visits for one vehicle with every event', async () => {
    await create(); await create();
    await create({ eventId: 'sack-2', vehicleSessionId: 'visit-2', direction: 'loading' });
    expect(await SackLoadingUnloadingIncident.countDocuments()).toBe(2);
    const c = ctx({ query: { startDate: '2026-11-16', endDate: '2026-11-16' } });
    await getSackLoadingLogs(c.req, c.res, c.next);
    expect(c.next).not.toHaveBeenCalled();
    const result = payload(c.res).data;
    expect(result.totalCount).toBe(1);
    expect(result.data[0]).toMatchObject({ vehicleNumber: 'KA01AB1234', sackCount: 4, whiteSackCount: 4, cottonBoxCount: 2,
      totalCount: 6, boxCount: 6, loadedBoxCount: 3, unloadedBoxCount: 3, direction: 'both', eventCount: 2, sessionCount: 2,
      nvrData: { nvrName: 'Factory NVR' }, channelData: { name: 'Factory Camera' } });
    expect(result.data[0].events).toHaveLength(2);
    expect(result.data[0].events[0]).toMatchObject({ sackCount: 2, whiteSackCount: 2, cottonBoxCount: 1, totalCount: 3 });
    expect(result.data[0].nvrData).not.toHaveProperty('password');
    expect(result.summary).toMatchObject({ vehicles: 1, events: 2, totalBoxes: 6 });
  });
  it('keeps other tenants and dates out, paginates vehicles, and filters movement and vehicle numbers', async () => {
    await create();
    await create({ eventId: 'sack-2', vehicleNumber: 'KA02ZZ0001', direction: 'loading' });
    await create({ eventId: 'sack-old', timeOfIncident: '2026-11-01T05:00:00Z' });
    await SackLoadingUnloadingIncident.create({ ...event({ eventId: 'other-event' }), userId: 'different-account' });
    const c = ctx({ query: { startDate: '2026-11-16', endDate: '2026-11-16', limit: 1 } });
    await getSackLoadingLogs(c.req, c.res, c.next);
    expect(payload(c.res).data.totalCount).toBe(2);
    expect(payload(c.res).data.data).toHaveLength(1);
    const filtered = ctx({ query: { direction: 'loading', vehicleNumber: 'ka02zz0001' } });
    await getSackLoadingLogs(filtered.req, filtered.res, filtered.next);
    expect(payload(filtered.res).data.data[0].loadedBoxCount).toBe(3);
    const numbers = ctx({ query: { search: 'KA02' } });
    await getSackVehicleNumbers(numbers.req, numbers.res, numbers.next);
    expect(payload(numbers.res).data.vehicleNumbers).toEqual(['KA02ZZ0001']);
  });
  it('keeps unrelated unreadable vehicles separate', async () => {
    await create({ vehicleNumber: '' }); await create({ eventId: 'unknown-2', vehicleNumber: '' });
    const c = ctx(); await getSackLoadingLogs(c.req, c.res, c.next);
    expect(payload(c.res).data.totalCount).toBe(2);
  });
  it('enforces the license, logs toggle and member access', async () => {
    const enabled = ctx(); await LogsConfigService.getLogsConfiguration(enabled.req, enabled.res, enabled.next);
    expect(payload(enabled.res).data.sackLoadingLogs).toBe(true);
    const member = ctx({ memberId: 'staff', permissionConfig: [{ permissionConfig: { logs: { sackLoadingLogs: { view: false } } } }] });
    await getSackLoadingLogs(member.req, member.res, member.next); expect(member.res.statusCode).toBe(403);
    await LogsConfig.updateOne({ adminId: admin._id }, { $set: { 'logs.sackLoadingLogs': false } }, { upsert: true });
    const hidden = ctx(); await getSackLoadingLogs(hidden.req, hidden.res, hidden.next); expect(hidden.res.statusCode).toBe(403);
    await LogsConfig.deleteMany({}); await Allocation.updateOne({ adminId: admin._id }, { enabled: false });
    const revoked = ctx(); await getSackLoadingLogs(revoked.req, revoked.res, revoked.next); expect(revoked.res.statusCode).toBe(403);
    const disabled = ctx(); await LogsConfigService.getLogsConfiguration(disabled.req, disabled.res, disabled.next);
    expect(payload(disabled.res).data.sackLoadingLogs).toBe(false);
  });
  it('rejects invalid counts and cameras owned by another account', async () => {
    const invalid = ctx({ body: event({ totalCount: 99 }) });
    await service.createIncidents(invalid.req, invalid.res, invalid.next); expect(invalid.res.statusCode).toBe(400);
    await Channel.updateOne({ _id: camera._id }, { userId: 'another-account' });
    const other = ctx({ body: event() }); await service.createIncidents(other.req, other.res, other.next);
    expect(other.res.statusCode).toBe(400); expect(await SackLoadingUnloadingIncident.countDocuments()).toBe(0);
  });
});
