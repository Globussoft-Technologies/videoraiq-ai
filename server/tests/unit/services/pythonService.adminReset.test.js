import { beforeEach, describe, expect, it, vi } from 'vitest';
const { post, endpoints } = vi.hoisted(() => ({ post: vi.fn(), endpoints: vi.fn() }));
vi.mock('axios', () => ({ default: { post } }));
vi.mock('../../../utils/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('../../../core/v1/NVR/nvr.model.js', () => ({ default: {} }));
vi.mock('../../../utils/rtspStream.js', () => ({ default: vi.fn(), buildRTSPUrl: vi.fn(), buildStreamingUrl: vi.fn(), resolveHost: vi.fn() }));
vi.mock('../../../utils/adminEndpoints.js', () => ({ resolveAdminEndpoints: endpoints }));
const python = (await import('../../../services/python.service.js')).default;
const admin = '6aabbc3c2ab6df29dea96f53';
beforeEach(() => {
  vi.clearAllMocks();
  endpoints.mockResolvedValue({ detectionUrl: 'http://object.test/', attendanceUrl: 'http://face.test/face-auth/' });
  post.mockResolvedValue({ data: { status: 'ok' } });
});
describe('separate admin reset endpoints', () => {
  it.each([
    ['detections', 'http://object.test/stream/stop-all'],
    ['camera-types', 'http://face.test/face-auth/api/v1/cameras/stop-all'],
  ])('calls only the %s service with an admin-only payload', async (target, url) => {
    await python.stopAdminPipelines(admin, target);
    expect(endpoints).toHaveBeenCalledWith(admin);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(url, { admin_id: admin }, {
      headers: { 'Content-Type': 'application/json' }, timeout: 45000,
    });
  });
  it('adds /face-auth once when the configured endpoint contains only a host', async () => {
    endpoints.mockResolvedValue({ attendanceUrl: 'http://face.test/' });
    await python.stopAdminPipelines(admin, 'camera-types');
    expect(post.mock.calls[0][0]).toBe('http://face.test/face-auth/api/v1/cameras/stop-all');
  });
  it.each([{ status: 'failed', message: 'Cannot stop' }, { success: false }])('rejects an application failure in HTTP 200: %j', async data => {
    post.mockResolvedValueOnce({ data });
    await expect(python.stopAdminPipelines(admin, 'detections')).rejects.toThrow();
  });
  it('propagates DS network errors so settings are retained', async () => {
    post.mockRejectedValueOnce(new Error('DS timeout'));
    await expect(python.stopAdminPipelines(admin, 'camera-types')).rejects.toThrow('DS timeout');
  });
  it.each([[undefined, 'detections'], [admin, 'both']])('rejects invalid identity/target without an HTTP call', async (id, target) => {
    await expect(python.stopAdminPipelines(id, target)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
