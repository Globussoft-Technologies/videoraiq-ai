import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../utils/cryptoUtils.js', () => ({ decrypt: vi.fn(value => value) }));
vi.mock('../../../core/v2/NVR/playbackPreview.js', () => ({ buildNvrPreviewSource: vi.fn(() => 'rtsp://archive/recording') }));
vi.mock('../../../core/v2/NVR/securusDvrip.js', () => ({ searchSecurusRecordings: vi.fn(), toCompactDeviceTime: vi.fn(d => d.toISOString()) }));
vi.mock('../../../core/v2/NVR/securusPlayback.js', () => ({ captureSecurusPlaybackSnapshot: vi.fn(), securusPreviewWindow: vi.fn((r, p) => ({ start: p, end: r.end, offsetSeconds: 0 })) }));
import { buildNvrPreviewSource } from '../../../core/v2/NVR/playbackPreview.js';
import { searchSecurusRecordings } from '../../../core/v2/NVR/securusDvrip.js';
import { captureSecurusPlaybackSnapshot } from '../../../core/v2/NVR/securusPlayback.js';
import { capturePlaybackSnapshot, snapshotDeviceTime } from '../../../services/cameraPlaybackSnapshot.service.js';

const now = new Date('2026-10-21T12:00:00Z');
const nvr = { brand: 'hikvision', ip: 'device', password: 'password', username: 'user' };
const camera = { channelId: '1' };
beforeEach(() => {
  vi.clearAllMocks();
  buildNvrPreviewSource.mockReturnValue('rtsp://archive/recording');
});
describe('independent playback snapshots', () => {
  it('rejects a recording archive belonging to another camera owner', async () => {
    await expect(capturePlaybackSnapshot({ camera: { ...camera, userId: '13' }, nvr: { ...nvr, userId: 'other' } })).rejects.toThrow('owners do not match');
    expect(buildNvrPreviewSource).not.toHaveBeenCalled();
  });
  it.each(['hikvision', 'prama', 'dahua', 'cpplus', 'tiandy'])('captures full-size archive frames for %s', async brand => {
    const decode = vi.fn().mockResolvedValue(Buffer.from('jpeg'));
    const result = await capturePlaybackSnapshot({ camera, nvr: { ...nvr, brand }, now, timezone: 'Asia/Kolkata', decode });
    expect(result).toMatchObject({ buffer: Buffer.from('jpeg'), recordedAt: new Date('2026-10-21T11:58:00Z'), recordingTimeEstimated: true });
    expect(decode).toHaveBeenCalledWith('rtsp://archive/recording');
    const start = buildNvrPreviewSource.mock.calls[0][0].start;
    expect([start.getHours(), start.getMinutes()]).toEqual([17, 28]);
  });
  it('tries older recent recording points when the newest point has a gap', async () => {
    const decode = vi.fn().mockRejectedValueOnce(new Error('no recording')).mockResolvedValue(Buffer.from('jpeg'));
    const result = await capturePlaybackSnapshot({ camera, nvr, now, decode });
    expect(result.recordedAt).toEqual(new Date('2026-10-21T11:50:00Z'));
    expect(decode).toHaveBeenCalledTimes(2);
  });
  it('bounds retries when all archive points fail', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(capturePlaybackSnapshot({ camera, nvr, now, decode })).rejects.toThrow('No frame');
    expect(decode).toHaveBeenCalledTimes(3);
  });
  it.each(['honeywell', 'hanwha', 'camera'])('does not open unsupported or exclusive playback sessions for %s', async brand => {
    const decode = vi.fn();
    await expect(capturePlaybackSnapshot({ camera, nvr: { ...nvr, brand }, now, decode })).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('does not invent an archive URL for a direct RTSP camera', async () => {
    await expect(capturePlaybackSnapshot({ camera, nvr: { ...nvr, connectionMode: 'direct' }, now })).rejects.toThrow('no configured recording archive');
  });
  it('selects the most recent Securus recording in the bounded search window', async () => {
    const start = new Date(2026, 9, 21, 17, 20, 0);
    const end = new Date(2026, 9, 21, 17, 29, 0);
    searchSecurusRecordings.mockResolvedValue([{ start, end, path: 'archive' }]);
    captureSecurusPlaybackSnapshot.mockResolvedValue(Buffer.from('jpeg'));
    const result = await capturePlaybackSnapshot({ camera, nvr: { ...nvr, brand: 'securus' }, now, timezone: 'Asia/Kolkata' });
    expect(result.recordedAt).toEqual(new Date('2026-10-21T11:58:00Z'));
    expect(captureSecurusPlaybackSnapshot).toHaveBeenCalledWith(expect.objectContaining({ recordings: [expect.objectContaining({ path: 'archive' })] }));
  });
  it('preserves the requested device wall clock regardless of host timezone', () => {
    const d = snapshotDeviceTime(now, 'Asia/Kolkata');
    expect([d.getHours(), d.getMinutes()]).toEqual([17, 30]);
  });
});
