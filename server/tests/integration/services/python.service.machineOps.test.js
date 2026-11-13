import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../utils/adminEndpoints.js', () => ({ resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: 'http://ds.test' }) }));
const axios = (await import('axios')).default;
const python = (await import('../../../services/python.service.js')).default;
const machines = [1, 2].map(index => ({ machine_id: `laser-cutter-${index}`, name: `Laser Cutter ${index}`,
  machine_zone: [[0, 0], [0.5, 0], [0.5, 1]], indicator_zone: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
}));
beforeEach(() => { vi.clearAllMocks(); axios.post.mockResolvedValue({ data: { status: 'ok' } }); });
describe('Machine Operations DS requests', () => {
  it.each(['startNewDetection', 'updateNewDetection'])('%s sends the exact machines contract', async method => {
    await python[method]({ camera_id: 'camera', nvr_id: 'nvr', admin_id: 'admin', stream_url: 'https://stream.test/camera/playlist.m3u8',
      detection_modes: ['machineOpsDetectionSettings'], severity: 'low',
      zones: [[[1, 2], [3, 4], [5, 6]]], zone_configs: [{ name: 'Internal zone' }],
      confidence_thresholds: { machines },
    });
    expect(axios.post.mock.calls[0][1]).toEqual({ camera_id: 'camera', nvr_id: 'nvr', admin_id: 'admin',
      stream_url: 'https://stream.test/camera/playlist.m3u8',
      detectors: [{ name: 'machineOpsDetectionSettings', severity: 'low', trigger_notification: true, machines }],
    });
  });
  it('stops the machine detector by its canonical key', async () => {
    await python.stopNewDetection('camera', 'nvr', ['machineOpsDetectionSettings'], 'admin');
    expect(axios.post.mock.calls[0][1].detectors).toEqual(['machineOpsDetectionSettings']);
  });
});
