import { beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), stop: vi.fn(), barrier: vi.fn(), owners: vi.fn(), subscriptions: vi.fn() }));
vi.mock('../../../services/amemberSubscriptionAccess.js', () => ({ loadAmemberSubscriptions: (...args) => mocks.subscriptions(...args) }));
vi.mock('../../../core/v1/admin/admin.model.js', () => ({ default: {
  find: (...args) => ({ select: () => ({ lean: () => mocks.owners(...args) }) }),
  findById: () => ({ select: () => ({ lean: async () => ({ user_id: '42' }) }) }),
  updateOne: (...args) => mocks.update(...args),
} }));
vi.mock('../../../core/v1/channels/channels.model.js', () => ({ default: {
  updateMany: (...args) => { mocks.barrier(...args); return { setOptions: async () => {} }; },
} }));
vi.mock('../../../core/v1/globalSchedule/globalSchedule.model.js', () => ({ default: { deleteMany: (...args) => mocks.remove(...args) } }));
vi.mock('../../../core/v1/users/users.model.js', () => ({ default: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }));
vi.mock('../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.model.js', () => ({ default: { updateMany: (...args) => mocks.update(...args) } }));
vi.mock('../../../core/v2/measurementAutoEmailReport/measurementAutoEmailReport.model.js', () => ({ default: { updateMany: (...args) => mocks.update(...args) } }));
vi.mock('../../../core/v2/solderAutoEmailReport/solderAutoEmailReport.model.js', () => ({ default: { updateMany: (...args) => mocks.update(...args) } }));
vi.mock('../../../core/v1/autoEmailReport/autoEmailReport.model.js', () => ({ default: { updateMany: (...args) => mocks.update(...args) } }));
vi.mock('../../../utils/stopStreams.js', () => ({ stopAllStreams: (...args) => mocks.stop(...args) }));
import { activateSubscription, expireSubscription, runSubscriptionExpirySweep } from '../../../services/subscriptionExpiry.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owners.mockResolvedValue([]);
  mocks.subscriptions.mockResolvedValue({ 3: '2099-01-01' });
});

describe('subscription expiry', () => {
  it('pauses only the owner cameras, removes owner schedules, and disables reports', async () => {
    await expireSubscription('admin-a');
    expect(mocks.barrier).toHaveBeenCalledWith({ userId: '42' }, [
      { $set: expect.objectContaining({ subscriptionPaused: true, detectionBulkPaused: true, checkType: 'none', detections: expect.any(Object) }) },
    ]);
    expect(mocks.remove).toHaveBeenCalledWith({ $or: [{ adminId: 'admin-a' }, { userId: '42' }] });
    expect(mocks.update).toHaveBeenCalledWith({ adminId: 'admin-a' }, { $set: { enabled: false } });
    expect(mocks.stop).toHaveBeenCalledWith('admin-a');
  });
  it('still stops streams when schedule deletion fails and exposes cleanup failure for retry', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(expireSubscription('admin-b')).rejects.toThrow('database unavailable');
    expect(mocks.stop).toHaveBeenCalledWith('admin-b');
  });
  it('keeps camera barriers on renewal while allowing account access again', async () => {
    await activateSubscription({ _id: 'renewed', streamsStopped: true }, { 3: '2030-01-01' });
    expect(mocks.barrier).toHaveBeenCalledWith({ userId: '42' }, [
      { $set: expect.objectContaining({ subscriptionPaused: true, detectionBulkPaused: true }) },
    ]);
    expect(mocks.stop).toHaveBeenCalledWith('renewed');
    expect(mocks.update).toHaveBeenLastCalledWith({ _id: 'renewed' }, { $set: expect.objectContaining({
      streamsStopped: false,
      'subscriptionSnapshot.expiresAt': new Date('2030-01-01T23:59:59.999Z'),
    }) });
  });
  it('catches a missed expiry before accepting a renewed subscription', async () => {
    await activateSubscription({ _id: 'missed', subscriptionSnapshot: { expiresAt: new Date('2020-01-01') } }, { 3: '2030-01-01' });
    expect(mocks.stop).toHaveBeenCalledWith('missed');
    expect(mocks.barrier).toHaveBeenCalledTimes(1);
  });
  it('does not pause an account whose previous subscription is still active', async () => {
    await activateSubscription({ _id: 'active', subscriptionSnapshot: { expiresAt: new Date('2099-01-01') } }, { 3: '2099-01-01' });
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.barrier).not.toHaveBeenCalled();
  });
  it('stops expired accounts without requiring login and isolates cleanup failures', async () => {
    const now = new Date('2030-01-02');
    mocks.owners.mockResolvedValue([{ _id: 'failed', streamsStopped: true }, { _id: 'expired', subscriptionSnapshot: { expiresAt: new Date('2030-01-01') } }]);
    mocks.remove.mockRejectedValueOnce(new Error('cleanup failed'));
    await runSubscriptionExpirySweep(now);
    expect(mocks.owners).toHaveBeenCalledWith({});
    expect(mocks.stop).toHaveBeenCalledWith('failed');
    expect(mocks.stop).toHaveBeenCalledWith('expired');
  });
  it('detects an expiry edited in aMember despite a future cached expiry', async () => {
    mocks.owners.mockResolvedValue([{ _id: 'edited', user_id: '42', subscriptionSnapshot: { expiresAt: new Date('2099-01-01') } }]);
    mocks.subscriptions.mockResolvedValue({ 3: '2020-01-01' });
    await runSubscriptionExpirySweep(new Date('2030-01-02'));
    expect(mocks.subscriptions).toHaveBeenCalledWith('42', new Date('2030-01-02'));
    expect(mocks.barrier).toHaveBeenCalledTimes(1);
    expect(mocks.stop).toHaveBeenCalledWith('edited');
    expect(mocks.update).not.toHaveBeenCalledWith(expect.anything(), { $set: expect.objectContaining({ streamsStopped: false }) });
  });
  it('pauses removed access and accounts without an existing snapshot', async () => {
    mocks.owners.mockResolvedValue([{ _id: 'legacy', user_id: '42' }]);
    mocks.subscriptions.mockResolvedValue({});
    await runSubscriptionExpirySweep();
    expect(mocks.stop).toHaveBeenCalledWith('legacy');
  });
  it('keeps healthy accounts running and leaves them alone during upstream failures', async () => {
    mocks.owners.mockResolvedValue([{ _id: 'unavailable', user_id: '42' }, { _id: 'healthy', user_id: '43' }]);
    mocks.subscriptions.mockRejectedValueOnce(new Error('upstream unavailable'));
    await runSubscriptionExpirySweep();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ _id: 'healthy' }, { $set: expect.objectContaining({ 'subscriptionSnapshot.expiresAt': new Date('2099-01-01T23:59:59.999Z') }) });
  });
  it('does not look up bypass accounts in aMember', async () => {
    mocks.owners.mockResolvedValue([{ _id: 'bypass', user_id: '42', subscriptionSnapshot: { source: 'bypass_login' } }]);
    await runSubscriptionExpirySweep();
    expect(mocks.subscriptions).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });
});
