import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../utils/adminEndpoints.js', () => ({ resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: 'http://ds.test' }) }));
const axios = (await import('axios')).default;
const python = (await import('../../../services/python.service.js')).default;
const zones = [[[100,100],[800,100],[800,700],[100,700]], [[950,100],[1800,100],[1800,700],[950,700]]];
const zone_configs = [{ name: 'Loading Bay', activity_mode: 'loading', telegramChatIds: ['private'] }, { name: 'Unloading Bay', activity_mode: 'unloading' }];
beforeEach(() => { vi.clearAllMocks(); axios.post.mockResolvedValue({ data: { status: 'ok' } }); });
describe('Sack Loading DS contract', () => {
  it.each(['startNewDetection', 'updateNewDetection'])('%s sends both zones together with the exact DS contract', async method => {
    await python[method]({ camera_id: 'camera', nvr_id: 'nvr', admin_id: 'admin', stream_url: 'rtsp://camera/stream',
      detection_modes: ['sackLoadingUnloadingSettings'], zones, zone_configs, confidence_thresholds: { mode: 'both', trigger_notification: true },
    });
    expect(axios.post.mock.calls[0][1]).toEqual({ camera_id: 'camera', nvr_id: 'nvr', admin_id: 'admin', stream_url: 'rtsp://camera/stream',
      detectors: [{ name: 'sackLoadingUnloadingSettings', mode: 'both', trigger_notification: true, zones,
        zone_configs: [{ name: 'Loading Bay', activity_mode: 'loading' }, { name: 'Unloading Bay', activity_mode: 'unloading' }] }],
    });
  });
  it('stops only the sack detector by its canonical key', async () => {
    await python.stopNewDetection('camera', 'nvr', ['sackLoadingUnloadingSettings'], 'admin');
    expect(axios.post.mock.calls[0][1].detectors).toEqual(['sackLoadingUnloadingSettings']);
  });
});
