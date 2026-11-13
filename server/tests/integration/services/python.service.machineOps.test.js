import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../../core/v1/NVR/nvr.model.js', () => ({ default: { findById: vi.fn().mockResolvedValue({ _id: 'n1', userId: 'u1' }) } }));
vi.mock('../../../utils/rtspStream.js', () => ({ default: vi.fn(), buildRTSPUrl: vi.fn(() => 'rtsp://test/main'),
  buildStreamingUrl: vi.fn().mockResolvedValue('stream/n1-c1/playlist.m3u8'), resolveHost: vi.fn().mockResolvedValue('https://stream.test') }));
vi.mock('../../../utils/adminEndpoints.js', () => ({ resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: 'http://ds.test' }) }));
const axios = (await import('axios')).default;
const { default: PythonService } = await import('../../../services/python.service.js');
const machines = [1, 2].map(i => ({ machineId: `cutter-${i}`, name: `Cutter ${i}`, profileId: 'green-indicator',
  machineZone: [[.1, .1], [.9, .1], [.9, .9], [.1, .9]], indicatorZone: [[.2, .2], [.3, .2], [.3, .3], [.2, .3]] }));
beforeEach(() => vi.clearAllMocks());

describe('Machine Ops Node-to-Python bridge', () => {
  it('starts one camera detector containing all machine groups', async () => {
    axios.post.mockResolvedValueOnce({ data: { status: 'ok' } });
    await PythonService.startNewDetection({ camera_id: 'c1', nvr_id: 'n1', admin_id: 'a1', stream_url: 'https://stream.test/cam.m3u8',
      detection_modes: ['machineOpsDetectionSettings'], confidence_thresholds: { machines, trigger_notification: false }, severity: 'low' });
    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toBe('http://ds.test/stream');
    expect(payload.detectors).toHaveLength(1);
    expect(payload.detectors[0]).toMatchObject({ name: 'machineOpsDetectionSettings', trigger_notification: false,
      machines: [{ machine_id: 'cutter-1', machine_profile_id: 'green-indicator' }, { machine_id: 'cutter-2' }] });
    expect(payload.detectors[0].machines[1].indicator_zone).toEqual(machines[1].indicatorZone);
  });
  it('stops only machine ops without stopping other camera detectors', async () => {
    axios.post.mockResolvedValueOnce({ data: { status: 'ok' } });
    await PythonService.stopNewDetection('c1', 'n1', ['machineOpsDetectionSettings'], 'a1');
    expect(axios.post.mock.calls[0][1].detectors).toEqual(['machineOpsDetectionSettings']);
  });
  it('rejects duplicate machine identities before calling DS', async () => {
    await expect(PythonService.startNewDetection({ camera_id: 'c1', nvr_id: 'n1', admin_id: 'a1', stream_url: 'https://stream.test/cam.m3u8',
      detection_modes: ['machineOpsDetectionSettings'], confidence_thresholds: { machines: [machines[0], machines[0]] } })).rejects.toThrow(/unique/);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
