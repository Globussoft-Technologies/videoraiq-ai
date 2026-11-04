import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCollections, connectMongo, disconnectMongo } from '../dbSetup.js';
import { payload, serviceCtx } from '../../helpers/service.js';
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../core/v2/alerts/alert.events.js', () => ({ triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../services/push.service.js', () => ({ sendIncidentPush: vi.fn() }));
const { default: service } = await import('../../../core/v2/incidents/incidents.service.js');
const { default: Admin } = await import('../../../core/v2/admin/admin.model.js');
const { default: NVR } = await import('../../../core/v2/NVR/nvr.model.js');
const { default: Channel } = await import('../../../core/v2/channels/channels.model.js');
const { default: Allocation } = await import('../../../core/v2/clientConfig/clientDetectionAllocation.model.js');
const { GenderAgeCountIncident, GenderAgeDetectionIncident } = await import('../../../core/v2/incidents/incidents.model.js');
const { triggerAlertOnIncident } = await import('../../../core/v2/alerts/alert.events.js');
const { sendPayloadToUser } = await import('../../../socket.js');
const { ALERT_FEED_EXCLUDED_TYPES } = await import('../../../constants/detectionTypes.js');
let admin, nvr, cameras;
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  vi.clearAllMocks();
  await clearCollections();
  admin = await Admin.create({ user_id: 'gender-client', login: 'gender-client', email: 'gender@test.com' });
  nvr = await NVR.create({ userId: admin.user_id, nvrName: 'Office', brand: 'hikvision', domain: 'http://nvr.test', location: 'Office', localNvrId: 'gender-nvr' });
  cameras = await Channel.create([1, 2].map(index => ({ userId: admin.user_id, nvrId: nvr._id, localChannelId: String(index), streamingPath: `/stream/${index}`, name: `Camera ${index}`, isAdded: true })));
  await Allocation.create({ adminId: admin._id, settingType: 'genderAgeDetectionSettings', cameraAllocation: 2, enabled: true });
});
const readLogs = async (options = {}) => {
  const context = serviceCtx({ user_id: admin.user_id, adminId: admin._id, query: { startDate: '2026-11-04', endDate: '2026-11-04', limit: '1' }, ...options });
  await service.getGenderAgeDetectionLogs(context.req, context.res, context.next);
  return context;
};

describe('Gender & Age logs and count snapshots', () => {
  it('filters gender before pagination and exports while retaining both summary totals', async () => {
    const common = { userId: admin.user_id, channelId: cameras[0]._id, nvrId: nvr._id, timeOfIncident: '2026-11-04T10:00:00Z', Image: 'https://nas.test/gender.jpg' };
    await GenderAgeDetectionIncident.create(['Male', 'Male', 'Male', 'Female', 'Female'].map(targetGender => ({
      ...common, targetGender, incidentName: `${targetGender} Detected`,
    })));
    await GenderAgeDetectionIncident.create({ ...common, userId: 'another-client', targetGender: 'Male', incidentName: 'Male Detected' });
    await GenderAgeCountIncident.create({ ...common, femaleCount: 2, maleCount: 3 });
    for (const [gender, count] of [['Male', 3], ['Female', 2]]) {
      const query = { startDate: '2026-11-04', endDate: '2026-11-04', gender, skip: '1', limit: '1' };
      const page = payload((await readLogs({ query })).res).data;
      expect(page.totalCount).toBe(count);
      expect(page.data).toHaveLength(1);
      expect(page.data[0].targetGender).toBe(gender);
      expect(page.genderAgeSummary).toMatchObject({ femaleCount: 2, maleCount: 3, totalCount: 5 });
      const exported = payload((await readLogs({ query: { ...query, skip: '0', limit: '10000' } })).res).data;
      expect(exported.data).toHaveLength(count);
      expect(exported.data.every(row => row.targetGender === gender)).toBe(true);
    }
    const all = payload((await readLogs({ query: { gender: '', limit: '100' } })).res).data;
    expect(all.totalCount).toBe(5);
    const denied = payload((await readLogs({ query: { gender: 'Male' }, authorizedChannel: { channels: [] } })).res).data;
    expect(denied.totalCount).toBe(0);
  });

  it.each(['Unknown', ['Male'], { $ne: 'Female' }])('rejects an invalid gender filter: %j', async gender => {
    const context = await readLogs({ query: { gender } });
    expect(context.res.statusCode).toBe(400);
  });

  it('accepts the minimal count post using cameraId and never raises an alert', async () => {
    const body = { incidentType: 'genderAgeCount', cameraId: String(cameras[0]._id), nvrId: String(nvr._id), adminId: String(admin._id), femaleCount: 3, maleCount: 1, zones: [{ zone_idx: 0, zone: 'Reception', female_count: 3, male_count: 1 }], triggerNotification: false };
    const context = serviceCtx({ body });
    await service.createIncidents(context.req, context.res, context.next);
    expect(context.res.statusCode).toBe(200);
    const saved = await GenderAgeCountIncident.findOne().lean();
    expect(saved).toMatchObject({ femaleCount: 3, maleCount: 1, triggerNotification: false, channelId: cameras[0]._id });
    expect(saved.timeOfIncident).toBeInstanceOf(Date);
    expect(saved.Image).toBeNull();
    expect(triggerAlertOnIncident).not.toHaveBeenCalled();
    expect(sendPayloadToUser).toHaveBeenCalledWith(null, `genderAgeCounts_${admin._id}`, { updatedAt: expect.any(Date) });
    expect(ALERT_FEED_EXCLUDED_TYPES).toContain('genderAgeCount');
  });

  it('sums date-range totals while showing latest live zone counts within the authorized camera scope', async () => {
    const snapshot = (camera, femaleCount, maleCount, timeOfIncident, userId = admin.user_id) => ({ userId, channelId: camera._id, nvrId: nvr._id, femaleCount, maleCount, timeOfIncident, zones: [{ zone_idx: 0, zone: 'Reception', female_count: femaleCount, male_count: maleCount }] });
    await GenderAgeCountIncident.create([
      snapshot(cameras[0], 100, 100, '2026-11-04T09:00:00Z'),
      snapshot(cameras[0], 3, 1, '2026-11-04T10:00:00Z'),
      snapshot(cameras[1], 0, 2, '2026-11-04T10:00:00Z'),
      snapshot(cameras[0], 99, 99, '2026-11-04T12:00:00Z', 'another-tenant'),
      snapshot(cameras[0], 50, 50, '2026-11-03T10:00:00Z'),
    ]);
    await GenderAgeDetectionIncident.create([1, 2].map(() => ({ userId: admin.user_id, channelId: cameras[0]._id, nvrId: nvr._id, timeOfIncident: '2026-11-04T10:00:00Z', incidentName: 'Female Detected', description: 'Female detected in Reception', Image: 'https://nas.test/frame.jpg', targetGender: 'Female' })));
    const all = payload((await readLogs()).res).data;
    expect(all.totalCount).toBe(2);
    expect(all.data).toHaveLength(1);
    expect(all.genderAgeSummary).toMatchObject({ femaleCount: 103, maleCount: 103, totalCount: 206 });
    expect(all.genderAgeSummary.zones).toHaveLength(2);
    expect(all.genderAgeSummary.zones).toContainEqual(expect.objectContaining({ cameraName: 'Camera 2', femaleCount: 0, maleCount: 2 }));
    const scoped = payload((await readLogs({ authorizedChannel: { channels: [cameras[0]._id] } })).res).data;
    expect(scoped.genderAgeSummary).toMatchObject({ femaleCount: 103, maleCount: 101, totalCount: 204 });
    expect(scoped.genderAgeSummary.zones[0]).toMatchObject({ femaleCount: 3, maleCount: 1, totalCount: 4 });
    const historical = payload((await readLogs({ query: { startDate: '2026-11-03', endDate: '2026-11-03' } })).res).data;
    expect(historical.genderAgeSummary).toMatchObject({ femaleCount: 50, maleCount: 50, totalCount: 100 });
    expect(historical.genderAgeSummary.zones).toEqual(all.genderAgeSummary.zones);
    await GenderAgeCountIncident.create(snapshot(cameras[0], 0, 0, '2026-11-04T11:00:00Z'));
    const live = payload((await readLogs({ query: { startDate: '2026-11-03', endDate: '2026-11-03' } })).res).data;
    expect(live.genderAgeSummary.totalCount).toBe(100);
    expect(live.genderAgeSummary.zones).toContainEqual(expect.objectContaining({ cameraName: 'Camera 1', femaleCount: 0, maleCount: 0 }));
    const denied = payload((await readLogs({ authorizedChannel: { channels: [] } })).res).data;
    expect(denied.genderAgeSummary).toEqual({ femaleCount: 0, maleCount: 0, totalCount: 0, zones: [] });
    expect(denied.totalCount).toBe(0);
  });

  it('blocks both logs and summaries after license revocation or member log denial', async () => {
    const member = await readLogs({ memberId: 'member-1', permissionConfig: [{ permissionConfig: { logs: { genderAgeLogs: { view: false } } } }] });
    expect(member.res.statusCode).toBe(403);
    await Allocation.updateOne({ adminId: admin._id }, { $set: { enabled: false } });
    expect((await readLogs()).res.statusCode).toBe(403);
  });

  it('rejects a count post whose camera belongs to another client', async () => {
    await Channel.updateOne({ _id: cameras[0]._id }, { $set: { userId: 'another-tenant' } });
    const context = serviceCtx({ body: { incidentType: 'genderAgeCount', cameraId: String(cameras[0]._id), nvrId: String(nvr._id), adminId: String(admin._id), femaleCount: 0, maleCount: 0 } });
    await service.createIncidents(context.req, context.res, context.next);
    expect(context.res.statusCode).toBe(400);
    expect(await GenderAgeCountIncident.countDocuments()).toBe(0);
  });
});
