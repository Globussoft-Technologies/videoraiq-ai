import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';
import { payload, serviceCtx } from '../../helpers/service.js';

vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../services/python.service.js', () => ({ default: { stopAdminPipelines: vi.fn() } }));
vi.mock('../../../utils/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { default: service } = await import('../../../core/v2/detectionSettings/detectionSettings.service.js');
const { default: router } = await import('../../../core/v2/detectionSettings/detectionSettings.routes.js');
const { default: python } = await import('../../../services/python.service.js');
const { default: Admin } = await import('../../../core/v2/admin/admin.model.js');
const { default: Channel } = await import('../../../core/v2/channels/channels.model.js');
const { DetectionSetting, MobilePhoneDetectionSetting, attendanceDetectionSetting } = await import('../../../core/v2/detectionSettings/detectionSettings.model.js');

let owner, other, setting, otherSetting, faceSetting;
beforeAll(connectMongo);
afterAll(disconnectMongo);
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  python.stopAdminPipelines.mockResolvedValue({ status: 'ok' });
  owner = await Admin.create({ user_id: 'reset-owner', email: 'owner@reset.test', login: 'reset-owner' });
  other = await Admin.create({ user_id: 'other-owner', email: 'other@reset.test', login: 'other-owner' });
  async function seedSetting(userId) {
    return MobilePhoneDetectionSetting.create({
      userId, settingType: 'mobilePhoneDetectionSettings', name: 'Zone', enabled: true,
      settings: { referencePoints: {}, metricType: 'gauge', mobile_phone_confidence: 0.5 },
    });
  }
  setting = await seedSetting(owner.user_id);
  otherSetting = await seedSetting(other.user_id);
  faceSetting = await attendanceDetectionSetting.create({
    userId: owner.user_id, settingType: 'faceAuthenticationSettings', name: 'Face zone', enabled: true,
    settings: { referencePoints: { camera: [[0, 0], [10, 0], [10, 10]] } },
  });
  // One shared setting, three owned cameras, including an inactive one.
  await Channel.create([true, true, false].map((isAdded, index) => ({
    userId: owner.user_id, nvrId: new mongoose.Types.ObjectId(), name: `Camera ${index}`, isAdded,
    checkType: 'checkin', detections: { mobilePhoneDetectionSettings: {
      id: setting._id, enabled: true, schedule: { mode: 'always' }, overrideState: true,
    }, faceAuthenticationSettings: { id: faceSetting._id, enabled: true } },
  })));
  await Channel.create({
    userId: other.user_id, nvrId: new mongoose.Types.ObjectId(), name: 'Other camera', isAdded: true,
    checkType: 'checkout', detections: { mobilePhoneDetectionSettings: { id: otherSetting._id, enabled: true } },
  });
});

async function reset({ user = owner, body = { confirm: true }, memberId, target = 'detections' } = {}) {
  const ctx = serviceCtx({ adminId: user._id, user_id: user.user_id, memberId, body });
  await (target === 'camera-types' ? service.resetAllCameraTypes(ctx.req, ctx.res, ctx.next) : service.resetAllDetections(ctx.req, ctx.res, ctx.next));
  return ctx.res;
}
async function expectSettingsRetained() {
  expect(await DetectionSetting.countDocuments({ userId: owner.user_id })).toBe(2);
  const cameras = await Channel.find({ userId: owner.user_id }).setOptions({ includeInactive: true }).lean();
  expect(cameras).toHaveLength(3);
  expect(cameras.every(camera => camera.detections.mobilePhoneDetectionSettings.enabled === true)).toBe(true);
}

describe('admin-wide detection reset', () => {
  it('requires explicit confirmation before calling DS or clearing data', async () => {
    expect((await reset({ body: {} })).statusCode).toBe(400);
    expect(python.stopAdminPipelines).not.toHaveBeenCalled();
    await expectSettingsRetained();
  });

  it('rejects members even if they have individual camera edit access', async () => {
    expect((await reset({ memberId: new mongoose.Types.ObjectId().toString() })).statusCode).toBe(403);
    expect(python.stopAdminPipelines).not.toHaveBeenCalled();
    await expectSettingsRetained();
  });

  it('rejects an authentication identity that does not match the admin', async () => {
    expect((await reset({ user: { _id: owner._id, user_id: other.user_id } })).statusCode).toBe(403);
    expect(python.stopAdminPipelines).not.toHaveBeenCalled();
  });

  it.each(['detections', 'camera-types'])('retains settings and types when DS cannot stop %s', async target => {
    python.stopAdminPipelines.mockRejectedValueOnce(new Error('DS unavailable'));
    const res = await reset({ target });
    expect(res.statusCode).toBe(502);
    expect(payload(res).status).toBe('failed');
    await expectSettingsRetained();
    expect((await Channel.findOne({ userId: owner.user_id }).lean()).checkType).toBe('checkin');
  });

  it('stops the authenticated admin first, clears all owned cameras and zones, and preserves other tenants', async () => {
    python.stopAdminPipelines.mockImplementationOnce(async (adminId, target) => {
      expect(adminId).toBe(String(owner._id));
      expect(target).toBe('detections');
      await expectSettingsRetained();
      return { status: 'ok' };
    });
    const res = await reset({ body: { confirm: true, admin_id: String(other._id), userId: other.user_id, channelId: 'ignored-filter' } });
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe('success');
    expect(payload(res).data).toBeUndefined();
    const cameras = await Channel.find({ userId: owner.user_id }).setOptions({ includeInactive: true }).lean();
    expect(cameras).toHaveLength(3);
    for (const camera of cameras) {
      expect(camera.control).toBe(1);
      expect(camera.checkType).toBe('checkin');
      expect(camera.detections.mobilePhoneDetectionSettings).toBeUndefined();
      expect(String(camera.detections.faceAuthenticationSettings.id)).toBe(String(faceSetting._id));
    }
    expect(await DetectionSetting.countDocuments({ userId: owner.user_id })).toBe(1);
    expect(await DetectionSetting.findById(otherSetting._id)).not.toBeNull();
    expect(await DetectionSetting.findById(faceSetting._id)).not.toBeNull();
    const untouched = await Channel.findOne({ userId: other.user_id }).lean();
    expect(untouched.checkType).toBe('checkout');
    expect(untouched.detections.mobilePhoneDetectionSettings.enabled).toBe(true);
  });

  it('resets only camera types, preserving every object detection and face zone', async () => {
    const res = await reset({ target: 'camera-types' });
    expect(res.statusCode).toBe(200);
    expect(python.stopAdminPipelines).toHaveBeenCalledWith(String(owner._id), 'camera-types');
    expect(payload(res).status).toBe('success');
    expect(payload(res).data).toBeUndefined();
    const cameras = await Channel.find({ userId: owner.user_id }).setOptions({ includeInactive: true }).lean();
    expect(cameras.every(camera => camera.checkType === 'none')).toBe(true);
    expect(cameras.every(camera => camera.detections.mobilePhoneDetectionSettings.enabled === true)).toBe(true);
    expect(cameras.every(camera => camera.control === 1)).toBe(true);
    expect(await DetectionSetting.countDocuments({ userId: owner.user_id })).toBe(2);
    expect((await Channel.findOne({ userId: other.user_id }).lean()).checkType).toBe('checkout');
  });

  it('can be retried after a database failure and after a completed reset', async () => {
    vi.spyOn(DetectionSetting, 'deleteMany').mockRejectedValueOnce(new Error('temporary database failure'));
    const failure = await reset();
    expect(failure.statusCode).toBe(500);
    expect(payload(failure).message).toContain('Detections were stopped');
    expect(await DetectionSetting.findById(setting._id)).not.toBeNull();
    expect((await reset()).statusCode).toBe(200);
    const again = await reset();
    expect(again.statusCode).toBe(200);
    expect(payload(again).status).toBe('success');
    expect(await DetectionSetting.countDocuments({ userId: owner.user_id, settingType: { $ne: 'faceAuthenticationSettings' } })).toBe(0);
  });

  it.each([['reset-all', 'detections'], ['reset-camera-types', 'camera-types']])('exposes POST /%s through the real v2 router', async (path, target) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.verified = { userData: { adminId: String(owner._id), user_id: owner.user_id } };
      next();
    });
    app.use('/api/v2/detection-settings', router);
    const resetToken = 'verified-reset-token';
    await Admin.updateOne({ _id: owner._id }, { $set: { detectionResetApproval: {
      hash: createHash('sha256').update(resetToken).digest('hex'), expiresAt: new Date(Date.now() + 60000),
    } } });
    const res = await request(app).post(`/api/v2/detection-settings/${path}`).send({ confirm: true, resetToken });
    expect(res.status).toBe(200);
    expect(res.body.body.status).toBe('success');
    expect(res.body.body).not.toHaveProperty('data');
    expect(python.stopAdminPipelines).toHaveBeenCalledWith(String(owner._id), target);
  });
});
