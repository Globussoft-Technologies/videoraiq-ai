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
const { default: controller } = await import('../../../core/v2/incidents/incidents.controller.js');
const { default: Admin } = await import('../../../core/v1/admin/admin.model.js');
const { default: NVR } = await import('../../../core/v1/NVR/nvr.model.js');
const { default: Channel } = await import('../../../core/v1/channels/channels.model.js');
const { default: Allocation } = await import('../../../core/v2/clientConfig/clientDetectionAllocation.model.js');
const { default: LogsConfigService } = await import('../../../core/v2/logsConfiguration/logsConfiguration.service.js');
const { MachineOpsDetectionIncident } = await import('../../../core/v1/incidents/incidents.model.js');
const { MachineOpsDetectionSetting } = await import('../../../core/v1/detectionSettings/detectionSettings.model.js');
let admin, nvr, camera;
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({ user_id: 'machine-client', login: 'machine-client', email: 'machine@test.test' });
  nvr = await NVR.create({ userId: admin.user_id, nvrName: 'Factory NVR', brand: 'hikvision', location: 'factory' });
  const setting = await MachineOpsDetectionSetting.create({ name: 'Machines', userId: admin.user_id, enabled: true, settings: {
    machines: [{ machine_id: 'laser-cutter-1', name: 'Laser Cutter 1', machine_zone: [[0, 0], [1, 0], [1, 1]], indicator_zone: [[0, 0], [0.1, 0], [0.1, 0.1]] }],
  } });
  camera = await Channel.create({ userId: admin.user_id, nvrId: nvr._id, name: 'Factory Camera', isAdded: true,
    detections: { machineOpsDetectionSettings: { id: setting._id, enabled: true } } });
  await Allocation.create({ adminId: admin._id, settingType: 'machineOpsDetectionSettings', cameraAllocation: 1, enabled: true });
});
const ctx = overrides => {
  const context = serviceCtx({ user_id: admin.user_id, adminId: admin._id, ...overrides });
  context.next = vi.fn(context.next);
  return context;
};
function event(fields = {}) {
  return { incidentType: 'machineOpsDetection', eventId: 'event-1', machineId: 'laser-cutter-1', machineName: 'Laser Cutter 1',
    machineState: 'OFF', incidentName: 'Machine OFF', description: 'Laser Cutter 1 is OFF.',
    timeOfIncident: '2026-11-13T08:00:10.000Z', adminId: String(admin._id), cameraId: String(camera._id),
    channelId: String(camera._id), nvrId: String(nvr._id), Image: '', videoLink: '', severity: 'low',
    type: 'gauge', triggerNotification: true, ...fields };
}
async function create(fields) {
  const c = ctx({ body: event(fields) });
  await service.createIncidents(c.req, c.res, c.next);
  expect(c.next).not.toHaveBeenCalled();
  expect(c.res.statusCode).toBe(200);
  return c;
}
describe('Machine Operations incident logs and access', () => {
  it('accepts the DS event with empty images, deduplicates retries, and joins camera and NVR names', async () => {
    await create();
    await create();
    expect(await MachineOpsDetectionIncident.countDocuments()).toBe(1);
    const other = await Admin.create({ user_id: 'other-machine-client', login: 'other-machine-client', email: 'other@test.test' });
    await MachineOpsDetectionIncident.create({ ...event({ eventId: 'other-event', machineName: 'Other machine' }), userId: other.user_id });
    const c = ctx({ query: { startDate: '2026-11-13', endDate: '2026-11-13' } });
    await controller.getMachineOpsDetectionLogs(c.req, c.res, c.next);
    expect(c.next).not.toHaveBeenCalled();
    const result = payload(c.res).data;
    expect(result.totalCount).toBe(1);
    expect(result.data[0]).toMatchObject({ machineState: 'OFF', machineName: 'Laser Cutter 1', incidentName: 'Machine OFF',
      description: 'Laser Cutter 1 is OFF.', nvrData: { nvrName: 'Factory NVR' }, channelData: { name: 'Factory Camera' } });
  });
  it('sorts and searches machine states and names', async () => {
    await create();
    await create({ eventId: 'event-2', machineName: 'Cutter 2', machineState: 'ON', incidentName: 'Machine ON' });
    const c = ctx({ query: { sortField: 'machineState', sortOrder: 'desc', search: 'Cutter' } });
    await service.getMachineOpsDetectionLogs(c.req, c.res, c.next);
    expect(c.next).not.toHaveBeenCalled();
    expect(payload(c.res).data.data.map(row => row.machineState)).toEqual(['ON', 'OFF']);
  });
  it('denies logs after license revocation and for members without log permission', async () => {
    const enabled = ctx();
    await LogsConfigService.getLogsConfiguration(enabled.req, enabled.res, enabled.next);
    expect(payload(enabled.res).data.machineOpsLogs).toBe(true);
    const member = ctx({ memberId: 'member', permissionConfig: [{ permissionConfig: { logs: { machineOpsLogs: { view: false } } } }] });
    await service.getMachineOpsDetectionLogs(member.req, member.res, member.next);
    expect(member.res.statusCode).toBe(403);
    await Allocation.updateOne({ adminId: admin._id }, { $set: { enabled: false } });
    const c = ctx();
    await service.getMachineOpsDetectionLogs(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
    const disabled = ctx();
    await LogsConfigService.getLogsConfiguration(disabled.req, disabled.res, disabled.next);
    expect(payload(disabled.res).data.machineOpsLogs).toBe(false);
  });
  it('rejects events naming a camera from a different account', async () => {
    await Channel.updateOne({ _id: camera._id }, { $set: { userId: 'other-client' } });
    const c = ctx({ body: event() });
    await service.createIncidents(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(400);
    expect(await MachineOpsDetectionIncident.countDocuments()).toBe(0);
  });
});
