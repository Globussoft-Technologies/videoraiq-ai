import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../utils/adminEndpoints.js', () => ({ resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: 'http://ds.test' }) }));
const axios = (await import('axios')).default;
const python = (await import('../../../services/python.service.js')).default;
const zones = [ [[120, 80], [900, 80], [900, 700], [120, 700]], [[950, 80], [1850, 80], [1850, 700], [950, 700]] ];
const payload = { camera_id: 'camera', nvr_id: 'nvr', admin_id: 'admin', stream_url: 'http://stream.test/live.m3u8', detection_modes: ['genderAgeDetectionSettings'], zones, zone_configs: [{ name: 'Reception', target_gender: 'Female', telegramChatIds: ['private'] }, { name: 'Shop Floor', target_gender: 'Male' }], videoResolution: [1920, 1080] };
beforeEach(() => { vi.clearAllMocks(); axios.post.mockResolvedValue({ data: { status: 'ok' } }); });
describe('Gender & Age detector requests', () => {
  it.each(['startNewDetection', 'updateNewDetection'])('%s preserves different per-zone target genders', async method => {
    await python[method](payload);
    expect(axios.post.mock.calls[0][1].detectors).toEqual([{
      name: 'genderAgeDetectionSettings', zones, zone_configs: [
        { name: 'Reception', target_gender: 'Female' }, { name: 'Shop Floor', target_gender: 'Male' },
      ],
      target_gender: 'Female', gender_confidence_threshold: 0.6,
      gender_age_min_confirmation_frames: 2, face_crop_padding: 0.15, severity: 'high', trigger_notification: true,
    }]);
  });
  it('sends full-frame monitoring without zone arrays and preserves tuning', async () => {
    await python.startNewDetection({ ...payload, zones: [], zone_configs: [], severity: 'moderate', confidence_thresholds: { target_gender: 'Male', gender_confidence_threshold: 0.8, gender_age_min_confirmation_frames: 3, face_crop_padding: 0.2, trigger_notification: false } });
    expect(axios.post.mock.calls[0][1].detectors).toEqual([{
      name: 'genderAgeDetectionSettings', target_gender: 'Male', gender_confidence_threshold: 0.8,
      gender_age_min_confirmation_frames: 3, face_crop_padding: 0.2, severity: 'moderate', trigger_notification: false,
    }]);
  });
  it('stops only the new detector', async () => {
    await python.stopNewDetection('camera', 'nvr', ['genderAgeDetectionSettings'], 'admin');
    expect(axios.post.mock.calls[0][1].detectors).toEqual(['genderAgeDetectionSettings']);
  });
});
