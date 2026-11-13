import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCollections, connectMongo, disconnectMongo } from '../dbSetup.js';
import { payload, serviceCtx } from '../../helpers/service.js';
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../core/v2/alerts/alert.events.js', () => ({ triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../core/v1/alerts/alert.events.js', () => ({ triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../services/push.service.js', () => ({ sendIncidentPush: vi.fn() }));
const { default: service } = await import('../../../core/v2/incidents/incidents.service.js');
const { default: v1 } = await import('../../../core/v1/incidents/incidents.service.js');
const { default: Admin } = await import('../../../core/v2/admin/admin.model.js');
const { default: NVR } = await import('../../../core/v2/NVR/nvr.model.js');
const { default: Channel } = await import('../../../core/v2/channels/channels.model.js');
const { MachineOpsIncident } = await import('../../../core/v2/incidents/incidents.model.js');
const { MachineOpsDetectionSetting } = await import('../../../core/v2/detectionSettings/detectionSettings.model.js');
const { triggerAlertOnIncident } = await import('../../../core/v2/alerts/alert.events.js');
let admin, nvr, camera;
beforeAll(async () => { await connectMongo(); await MachineOpsIncident.init(); });
afterAll(disconnectMongo);
beforeEach(async () => {
  vi.clearAllMocks(); await clearCollections();
  admin = await Admin.create({ user_id: 'machine-client', login: 'machine-client', email: 'machine@test.com' });
  nvr = await NVR.create({ userId: admin.user_id, nvrName: 'Factory', brand: 'hikvision', domain: 'http://nvr.test', location: 'Factory', localNvrId: 'machine-nvr' });
  const setting = await MachineOpsDetectionSetting.create({ userId: admin.user_id, name: 'Machine Operations', enabled: true,
    settings: { machines: [1, 2].map(i => ({ machineId: `laser-${i}`, name: `Laser ${i}`,
      machineZone: [[.1, .1], [.9, .1], [.9, .9], [.1, .9]], indicatorZone: [[.2, .2], [.3, .2], [.3, .3], [.2, .3]] })) } });
  camera = await Channel.create({ userId: admin.user_id, nvrId: nvr._id, localChannelId: '1', streamingPath: '/stream/1', name: 'Factory Cam', isAdded: true,
    detections: { machineOpsDetectionSettings: { id: setting._id, enabled: true } } });
});
const post = (extra = {}) => ({ incidentType: 'machineOpsDetection', eventId: 'event-1', machineId: 'laser-1', machineName: 'Laser 1',
  machineState: 'ON', timeOfIncident: '2026-11-13T08:00:00Z', adminId: String(admin._id), cameraId: String(camera._id),
  channelId: String(camera._id), nvrId: String(nvr._id), triggerNotification: true, severity: 'low', Image: '', ...extra });
const send = async (body, target = service) => {
  const context = serviceCtx({ body }); await target.createIncidents(context.req, context.res, context.next); return context;
};

describe('machine operation incidents and logs', () => {
  it('stores the first state and transitions with exactly the same fields', async () => {
    await send(post());
    await send(post({ eventId: 'event-2', machineState: 'OFF', timeOfIncident: '2026-11-13T09:00:10Z' }));
    const rows = await MachineOpsIncident.find().sort({ timeOfIncident: 1 }).lean();
    expect(rows.map(r => r.machineState)).toEqual(['ON', 'OFF']);
    expect(rows[0].timeOfIncident.toISOString()).toBe('2026-11-13T08:00:00.000Z');
    expect(rows[1].incidentName).toBe('Machine OFF');
    expect(rows[0]).not.toHaveProperty('eventType');
    expect(rows[1]).not.toHaveProperty('previousState');
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(2);
  });
  it('deduplicates retries without merging two machines on the same camera', async () => {
    await send(post());
    const retry = await send(post());
    expect(payload(retry.res).data.duplicate).toBe(true);
    await send(post({ machineId: 'laser-2', machineName: 'Laser 2' }));
    expect(await MachineOpsIncident.countDocuments()).toBe(2);
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(2);
  });
  it('protects concurrent retries with a unique index', async () => {
    const results = await Promise.all([send(post()), send(post())]);
    expect(await MachineOpsIncident.countDocuments()).toBe(1);
    expect(results.every(c => c.res.statusCode === 200)).toBe(true);
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(1);
  });
  it('accepts OFF as the first report on the v1 endpoint too', async () => {
    await send(post({ machineState: 'OFF', triggerNotification: false }), v1);
    expect((await MachineOpsIncident.findOne().lean()).machineState).toBe('OFF');
  });
  it('rejects UNKNOWN and cross-tenant/cross-NVR associations', async () => {
    expect((await send(post({ machineState: 'UNKNOWN' }))).res.statusCode).toBe(400);
    const foreign = await Admin.create({ user_id: 'foreign', login: 'foreign', email: 'foreign@test.com' });
    expect((await send(post({ adminId: String(foreign._id) }))).res.statusCode).toBe(400);
    expect((await send(post({ nvrId: '0123456789abcdef01234567' }))).res.statusCode).toBe(400);
    expect(await MachineOpsIncident.countDocuments()).toBe(0);
  });
  it('filters machines before pagination and keeps tenant isolation', async () => {
    await send(post()); await send(post({ machineId: 'laser-2', machineName: 'Laser 2', eventId: 'event-2' }));
    await MachineOpsIncident.create({ ...post({ machineId: 'laser-2', eventId: 'foreign' }), userId: 'foreign' });
    const context = serviceCtx({ user_id: admin.user_id, adminId: admin._id, query: { machineId: 'laser-2', machineState: 'ON', limit: '1', startDate: '2026-11-13', endDate: '2026-11-13' } });
    await service.getMachineOpsLogs(context.req, context.res, context.next);
    const result = payload(context.res).data;
    expect(result.totalCount).toBe(1);
    expect(result.data[0].machineName).toBe('Laser 2');
  });
});
