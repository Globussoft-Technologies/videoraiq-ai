import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../utils/adminEndpoints.js', () => ({
  resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: 'http://ds.test' }),
}));

const axios = (await import('axios')).default;
const python = (await import('../../../services/python.service.js')).default;
const zones = [
  [[100, 100], [500, 100], [500, 500], [100, 500]],
  [[600, 100], [900, 100], [900, 500], [600, 500]],
];
const payload = {
  camera_id: 'cam', nvr_id: 'nvr', admin_id: 'admin',
  stream_url: 'http://stream.test/live.m3u8',
  detection_modes: ['emotionDetection'], zones,
  zone_configs: [{ name: 'Lobby', telegramChatIds: ['private'] }, { name: 'Reception' }],
  videoResolution: [1000, 1000],
};

beforeEach(() => {
  vi.clearAllMocks();
  axios.post.mockResolvedValue({ data: { status: 'ok' } });
});

describe('Emotion Detection requests to DS', () => {
  it.each([['startNewDetection', '/stream'], ['updateNewDetection', '/detectors/update']])(
    '%s sends one emotion detector with multiple named zones', async (method, endpoint) => {
      await python[method](payload);
      expect(axios.post.mock.calls[0][0]).toBe(`http://ds.test${endpoint}`);
      expect(axios.post.mock.calls[0][1].detectors).toEqual([{
        name: 'emotionDetection',
        zones,
        zone_configs: [{ name: 'Lobby' }, { name: 'Reception' }],
      }]);
    },
  );

  it('stops only the emotion detector', async () => {
    await python.stopNewDetection('cam', 'nvr', ['emotionDetection'], 'admin');
    expect(axios.post.mock.calls[0][0]).toBe('http://ds.test/stream/stop');
    expect(axios.post.mock.calls[0][1]).toEqual({ camera_id: 'cam', nvr_id: 'nvr', detectors: ['emotionDetection'] });
  });
});
