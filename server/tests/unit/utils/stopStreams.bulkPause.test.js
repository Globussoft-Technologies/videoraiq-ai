import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ post: vi.fn(), cameras: [] }));
vi.mock('axios', () => ({ default: { post: mocks.post } }));
vi.mock('../../../utils/logger.js', () => ({ default: { error: vi.fn() } }));
vi.mock('../../../utils/adminEndpoints.js', () => ({
  resolveAdminEndpoints: vi.fn(async () => ({ detectionUrl: 'http://detection', attendanceUrl: 'http://attendance/face-auth' })),
}));
vi.mock('../../../core/v1/admin/admin.model.js', () => ({ default: {
  findById: () => ({ select: () => ({ lean: async () => ({ user_id: 'owner' }) }) }),
} }));
vi.mock('../../../core/v1/channels/channels.model.js', () => ({ default: {
  find: () => ({ setOptions: () => ({ select: () => ({ lean: async () => mocks.cameras }) }) }),
} }));
const { resumeAllStreams } = await import('../../../utils/stopStreams.js');
beforeEach(() => { mocks.post.mockReset().mockResolvedValue({}); });

it('does not undo a manual pause when a subscription resumes', async () => {
  mocks.cameras = [{ _id: 'paused', detectionBulkPaused: true }];
  resumeAllStreams('admin');
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  expect(mocks.post.mock.calls[0][0]).toContain('/face-auth/api/v1/cameras/resume-all');
});

it('limits automatic resume to cameras that are not manually paused', async () => {
  mocks.cameras = [{ _id: 'paused', detectionBulkPaused: true }, { _id: 'running', detectionBulkPaused: false }];
  resumeAllStreams('admin');
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
  expect(mocks.post).toHaveBeenCalledWith('http://detection/stream/resume-all',
    { admin_id: 'admin', camera_id: ['running'] }, expect.any(Object));
});
