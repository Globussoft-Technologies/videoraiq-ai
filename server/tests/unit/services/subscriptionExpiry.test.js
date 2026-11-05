import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), stop: vi.fn(), barrier: vi.fn() }));
vi.mock('../../../core/v1/admin/admin.model.js', () => ({ default: {
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
import { expireSubscription } from '../../../services/subscriptionExpiry.js';

describe('subscription expiry', () => {
  it('pauses only the owner cameras, removes owner schedules, and disables reports', async () => {
    await expireSubscription('admin-a');
    expect(mocks.barrier).toHaveBeenCalledWith({ userId: '42' }, { $set: { subscriptionPaused: true, detectionBulkPaused: true } });
    expect(mocks.remove).toHaveBeenCalledWith({ $or: [{ adminId: 'admin-a' }, { userId: '42' }] });
    expect(mocks.update).toHaveBeenCalledWith({ adminId: 'admin-a' }, { $set: { enabled: false } });
    expect(mocks.stop).toHaveBeenCalledWith('admin-a');
  });
  it('still stops streams when schedule deletion fails and exposes cleanup failure for retry', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(expireSubscription('admin-b')).rejects.toThrow('database unavailable');
    expect(mocks.stop).toHaveBeenCalledWith('admin-b');
  });
});
