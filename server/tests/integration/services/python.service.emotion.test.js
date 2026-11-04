import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../utils/adminEndpoints.js', () => ({
  resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: 'http://ds.test' }),
}));

const axios = (await import('axios')).default;
const python = (await import('../../../services/python.service.js')).default;
const { EMOTION_ALERT_GROUPS } = await import('../../../constants/emotionDetection.js');
const { EmotionDetectionSetting } = await import('../../../core/v1/detectionSettings/detectionSettings.model.js');
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
        zone_configs: [
          { name: 'Lobby', emotion_alert_groups: [...EMOTION_ALERT_GROUPS] },
          { name: 'Reception', emotion_alert_groups: [...EMOTION_ALERT_GROUPS] },
        ],
      }]);
    },
  );

  it.each(['startNewDetection', 'updateNewDetection'])('%s preserves each zone selection from stored subdocuments', async method => {
    const setting = new EmotionDetectionSetting({ settings: { zone_configs: [
      { name: 'Lobby', emotion_alert_groups: ['negative'], telegramChatIds: ['private'] },
      { name: 'Reception', emotion_alert_groups: [...EMOTION_ALERT_GROUPS] },
    ] } });
    await python[method]({ ...payload, zone_configs: setting.settings.zone_configs });
    expect(axios.post.mock.calls[0][1].detectors[0].zone_configs).toEqual([
      { name: 'Lobby', emotion_alert_groups: ['negative'] },
      { name: 'Reception', emotion_alert_groups: [...EMOTION_ALERT_GROUPS] },
    ]);
  });

  it('stops only the emotion detector', async () => {
    await python.stopNewDetection('cam', 'nvr', ['emotionDetection'], 'admin');
    expect(axios.post.mock.calls[0][0]).toBe('http://ds.test/stream/stop');
    expect(axios.post.mock.calls[0][1]).toEqual({ camera_id: 'cam', nvr_id: 'nvr', detectors: ['emotionDetection'] });
  });
});
