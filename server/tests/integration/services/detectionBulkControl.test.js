import { createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';
import { serviceCtx, payload } from '../../helpers/service.js';

vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../services/python.service.js', () => ({ default: {
  stopAdminPipelines: vi.fn(), handleDetectionStartStop: vi.fn(),
} }));
vi.mock('../../../core/v2/clientConfig/detectionLicense.service.js', () => ({
  assertCanEnableDetection: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../../core/v2/Auth/auth.service.js', () => ({ default: {
  _getBypassUser: vi.fn(), fetchUserDataByName: vi.fn(),
} }));

const { bulkDetectionControl, consumeResetApproval, verifyResetPassword, getBulkDetectionState } = await import('../../../services/detectionBulkControl.js');
const { resolveDesiredDetectionState } = await import('../../../services/detectionSchedule.resolver.js');
const { default: Admin } = await import('../../../core/v1/admin/admin.model.js');
const { default: Channel } = await import('../../../core/v1/channels/channels.model.js');
const { MobilePhoneDetectionSetting, DetectionSetting } = await import('../../../core/v2/detectionSettings/detectionSettings.model.js');
const { default: python } = await import('../../../services/python.service.js');
const { default: auth } = await import('../../../core/v2/Auth/auth.service.js');
let owner, setting;
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  vi.resetAllMocks();
  const { assertCanEnableDetection } = await import('../../../core/v2/clientConfig/detectionLicense.service.js');
  assertCanEnableDetection.mockResolvedValue({ ok: true });
  python.stopAdminPipelines.mockResolvedValue({ success: true });
  python.handleDetectionStartStop.mockResolvedValue({ success: true });
  owner = await Admin.create({ user_id: 'bulk-owner', email: 'bulk@test.test', login: 'bulk-owner' });
  setting = await MobilePhoneDetectionSetting.create({ userId: owner.user_id,
    settingType: 'mobilePhoneDetectionSettings', name: 'Saved zone', enabled: true, settings: {
      referencePoints: { camera: [[1, 2], [3, 4], [5, 6]] },
    } });
  await Channel.create([true, false].map(isAdded => ({
    userId: owner.user_id, nvrId: new mongoose.Types.ObjectId(), isAdded,
    detections: { mobilePhoneDetectionSettings: { id: setting._id, enabled: true },
      faceAuthenticationSettings: { id: new mongoose.Types.ObjectId(), enabled: true } },
  })));
  await Channel.create({ userId: 'other', nvrId: new mongoose.Types.ObjectId(), isAdded: true,
    detections: { mobilePhoneDetectionSettings: { id: setting._id, enabled: true } } });
});
const ctx = body => serviceCtx({ adminId: owner._id, user_id: owner.user_id, body });
const cameras = () => Channel.find({ userId: owner.user_id }).setOptions({ includeInactive: true });
async function control(action) {
  const c = ctx({ action, confirm: true });
  await bulkDetectionControl(c.req, c.res);
  expect(c.res.statusCode).toBe(202);
  const jobId = payload(c.res).data.job.id;
  await vi.waitFor(async () => {
    const admin = await Admin.findById(owner._id);
    expect(admin.detectionBulkJob.id).toBe(jobId);
    expect(admin.detectionBulkJob.status).not.toBe('running');
    expect(admin.detectionControlLock?.token).toBeUndefined();
    c.res.job = admin.detectionBulkJob;
  }, { timeout: 25000, interval: 25 });
  return c.res;
}

describe('bulk detection pause and resume', () => {
  it('returns account-wide toggle state, including inactive cameras', async () => {
    const state = async () => {
      const c = ctx({});
      await getBulkDetectionState(c.req, c.res);
      return payload(c.res).data;
    };
    expect(await state()).toMatchObject({ paused: false, pausedCount: 0, cameraCount: 2 });
    await control('pause');
    expect(await state()).toMatchObject({ paused: true, pausedCount: 2, cameraCount: 2 });
    await control('resume');
    expect(await state()).toMatchObject({ paused: false, pausedCount: 0, cameraCount: 2 });
  });
  it('requires confirmation and rejects members', async () => {
    const c = ctx({ action: 'pause' });
    await bulkDetectionControl(c.req, c.res);
    expect(c.res.statusCode).toBe(400);
    c.req.verified.userData.memberId = 'member';
    await bulkDetectionControl(c.req, c.res);
    expect(c.res.statusCode).toBe(403);
    expect(python.stopAdminPipelines).not.toHaveBeenCalled();
  });
  it('pauses every owned camera while preserving settings, face authentication and other tenants', async () => {
    expect(payload(await control('pause')).status).toBe('success');
    const paused = await cameras();
    expect(paused).toHaveLength(2);
    for (const camera of paused) {
      expect(camera.detectionBulkPaused).toBe(true);
      expect(camera.detectionResumeTypes).toEqual(['mobilePhoneDetectionSettings']);
      expect(camera.detections.mobilePhoneDetectionSettings.enabled).toBe(false);
      expect(camera.detections.faceAuthenticationSettings.enabled).toBe(true);
      expect((await resolveDesiredDetectionState(camera, 'mobilePhoneDetectionSettings')).active).toBe(false);
    }
    expect(await DetectionSetting.findById(setting._id)).toBeTruthy();
    expect((await Channel.findOne({ userId: 'other' })).detections.mobilePhoneDetectionSettings.enabled).toBe(true);
    await control('pause');
    expect((await cameras())[0].detectionResumeTypes).toEqual(['mobilePhoneDetectionSettings']);
  });
  it('resumes with saved configuration and leaves previously disabled detectors disabled', async () => {
    const before = await cameras();
    before[1].detections.mobilePhoneDetectionSettings.enabled = false;
    await before[1].save();
    await control('pause');
    expect(payload(await control('resume')).status).toBe('success');
    expect(python.handleDetectionStartStop).toHaveBeenCalledTimes(1);
    const after = await cameras();
    expect(after.every(camera => !camera.detectionBulkPaused)).toBe(true);
    expect(after.filter(camera => camera.detections.mobilePhoneDetectionSettings.enabled)).toHaveLength(1);
  });
  it('retries only the failed camera three times, preserves DS errors, and supports an explicit retry', async () => {
    const [first, second] = await cameras();
    python.stopAdminPipelines.mockImplementation(async (_admin, _target, ids) => String(ids[0]) === String(second._id)
      ? { status: 'partial', failed: [{ error: 'GPU memory capacity exceeded' }] }
      : { status: 'ok', failed: [] });
    const response = await control('pause');
    expect(response.job.status).toBe('failed');
    expect(response.job.items.find(item => item.cameraId === String(first._id)).status).toBe('success');
    expect(response.job.events).toHaveLength(3);
    expect(response.job.events.every(event => event.error === 'GPU memory capacity exceeded')).toBe(true);
    const callCount = id => python.stopAdminPipelines.mock.calls.filter(call => String(call[2][0]) === String(id)).length;
    expect(callCount(first._id)).toBe(1);
    expect(callCount(second._id)).toBe(3);
    expect((await cameras()).every(camera => camera.detectionBulkPaused)).toBe(true);
    python.stopAdminPipelines.mockResolvedValue({ success: true });
    const retry = await control('pause');
    expect(retry.job.total).toBe(1);
    expect(retry.job.status).toBe('success');
    expect(callCount(first._id)).toBe(1);
    expect(callCount(second._id)).toBe(4);
  });
  it('automatically retries a failed resume while leaving successful cameras alone', async () => {
    await control('pause');
    python.handleDetectionStartStop.mockRejectedValueOnce(new Error('DS temporarily offline'));
    const response = await control('resume');
    expect(response.job.status).toBe('success');
    expect(response.job.attempt).toBe(2);
    expect(response.job.events).toHaveLength(1);
    expect(response.job.events[0].error).toBe('DS temporarily offline');
    expect(python.handleDetectionStartStop).toHaveBeenCalledTimes(3);
    expect((await cameras()).every(camera => !camera.detectionBulkPaused)).toBe(true);
  });
  it('keeps scheduled detections off outside their window when resuming', async () => {
    for (const camera of await cameras()) {
      camera.detections.mobilePhoneDetectionSettings.schedule = { mode: 'custom', timezone: 'Asia/Kolkata', days: {} };
      await camera.save();
    }
    await control('pause');
    expect(payload(await control('resume')).status).toBe('success');
    expect(python.handleDetectionStartStop).not.toHaveBeenCalled();
    expect((await cameras()).every(camera => !camera.detections.mobilePhoneDetectionSettings.enabled)).toBe(true);
  });
});

describe('reset password approval', () => {
  it('verifies the authenticated owner and issues a single-use approval', async () => {
    auth.fetchUserDataByName.mockResolvedValue({ ok: true, user_id: owner.user_id });
    const c = ctx({ password: 'correct-password' });
    await verifyResetPassword(c.req, c.res);
    const token = payload(c.res).data.token;
    expect(token).toBeTruthy();
    const stored = await Admin.findById(owner._id);
    expect(stored.detectionResetApproval.hash).toBe(createHash('sha256').update(token).digest('hex'));
    const approved = ctx({ resetToken: token });
    await consumeResetApproval(approved.req, approved.res, approved.next);
    expect(approved.next.calls).toHaveLength(1);
    const replay = ctx({ resetToken: token });
    await consumeResetApproval(replay.req, replay.res, replay.next);
    expect(replay.res.statusCode).toBe(403);
    expect(replay.next.calls).toHaveLength(0);
  });
  it('rejects incorrect passwords, another account and expired approvals', async () => {
    for (const account of [{ ok: false }, { ok: true, user_id: 'other' }]) {
      auth.fetchUserDataByName.mockResolvedValueOnce(account);
      const c = ctx({ password: 'wrong' });
      await verifyResetPassword(c.req, c.res);
      expect(c.res.statusCode).toBe(403);
    }
    await Admin.updateOne({ _id: owner._id }, { $set: { detectionResetApproval: {
      hash: createHash('sha256').update('expired').digest('hex'), expiresAt: new Date(0),
    } } });
    const expired = ctx({ resetToken: 'expired' });
    await consumeResetApproval(expired.req, expired.res, expired.next);
    expect(expired.res.statusCode).toBe(403);
  });
});
