import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import axios from "axios";
import jwt from "jsonwebtoken";
import config from "config";
import { createServer } from "node:http";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { readFileSync } from "node:fs";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../../core/v1/channels/channels.model.js", () => ({ default: { updateOne: vi.fn(), findById: vi.fn(), findOne: vi.fn(), find: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../../../core/v1/admin/admin.model.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../utils/rtspStream.js", () => ({ resolveStream: vi.fn(), buildRTSPUrl: vi.fn() }));
vi.mock("../../../services/cameraPlaybackSnapshot.service.js", () => ({ capturePlaybackSnapshot: vi.fn() }));
vi.mock("../../../core/v2/adminStorage/mediaStorage.v2.js", () => ({ putMediaV2: vi.fn(), deleteMediaV2: vi.fn() }));
import { spawn } from "node:child_process";
import Channel from "../../../core/v1/channels/channels.model.js";
import NVR from "../../../core/v1/NVR/nvr.model.js";
import Admin from "../../../core/v1/admin/admin.model.js";
import { resolveStream, buildRTSPUrl } from "../../../utils/rtspStream.js";
import { capturePlaybackSnapshot } from "../../../services/cameraPlaybackSnapshot.service.js";
import { putMediaV2, deleteMediaV2 } from "../../../core/v2/adminStorage/mediaStorage.v2.js";
import { captureFrame, refreshCameraSnapshot, snapshotStreamUrl, loadSnapshotPlaylist, createSnapshotPlaybackToken, snapshotFailureReason, runCameraSnapshotSweep } from "../../../services/cameraSnapshots.service.js";

const camera = { _id: "camera", nvrId: "nvr", userId: "owner", latestSnapshot: { path: "/old.jpg" } };
let child;
let localPlaylist;
beforeEach(() => {
  vi.resetAllMocks();
  capturePlaybackSnapshot.mockRejectedValue(new Error('Playback unavailable'));
  child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = vi.fn();
  child.kill = vi.fn();
  spawn.mockImplementation((_binary, args) => {
    const input = args[args.indexOf('-i') + 1];
    localPlaylist = input === 'pipe:0' ? '' : readFileSync(input, 'utf8');
    setTimeout(() => { child.stdout.emit("data", Buffer.from("jpeg")); child.emit("close", 0); }, 0);
    return child;
  });
  NVR.findById.mockReturnValue({ lean: async () => ({ _id: "nvr" }) });
  Admin.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: "admin" }) }) });
  resolveStream.mockResolvedValue({ appEnv: "cloud", host: "https://stream.example", token: "service" });
  putMediaV2.mockResolvedValue("/new.jpg");
  deleteMediaV2.mockResolvedValue();
  Channel.updateOne.mockResolvedValue({ matchedCount: 1 });
  axios.get.mockImplementation(async (_url, options) => ({ data: options?.responseType === 'arraybuffer' ? Buffer.from('segment') : '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg_1.ts\n' }));
});

describe("camera snapshots", () => {
  it('recovers an explicitly missing cloud-camera registration and retries capture once', async () => {
    NVR.findById.mockReturnValue({ lean: async () => ({ _id: 'nvr', userId: 'owner', brand: 'hikvision' }) });
    axios.get.mockRejectedValueOnce({ response: { status: 404, data: { message: 'Camera not found in config' } } });
    axios.post.mockResolvedValue({ data: { status: 'success' } });
    buildRTSPUrl.mockReturnValue('rtsp://camera/main');
    expect(await refreshCameraSnapshot(camera, 'lease')).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith('https://stream.example/api/add-camera', {
      id: 'nvr-camera', rtsp_url: 'rtsp://camera/main', generate: 'true',
    }, expect.objectContaining({ timeout: 10000 }));
  });
  it('does not re-register on generic 404s or for another resource owner', async () => {
    NVR.findById.mockReturnValue({ lean: async () => ({ _id: 'nvr', userId: 'different' }) });
    axios.get.mockRejectedValueOnce({ response: { status: 404, data: { message: 'Camera not found in config' } } });
    await expect(refreshCameraSnapshot(camera, 'lease')).rejects.toBeDefined();
    expect(axios.post).not.toHaveBeenCalled();
    axios.get.mockRejectedValueOnce({ response: { status: 404, data: 'Segment not found' } });
    await expect(refreshCameraSnapshot(camera, 'lease')).rejects.toBeDefined();
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('does not loop registration if a retried camera is still missing', async () => {
    NVR.findById.mockReturnValue({ lean: async () => ({ _id: 'nvr', userId: 'owner' }) });
    axios.get.mockRejectedValue({ response: { status: 404, data: 'Camera not found in config' } });
    axios.post.mockResolvedValue({ data: { status: 'success' } });
    buildRTSPUrl.mockReturnValue('rtsp://camera/main');
    await expect(refreshCameraSnapshot(camera, 'lease')).rejects.toBeDefined();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(putMediaV2).not.toHaveBeenCalled();
  });
  it('uses the saved direct-RTSP configuration when recovering a direct camera', async () => {
    NVR.findById.mockReturnValue({ lean: async () => ({ _id: 'nvr', userId: 'owner', connectionMode: 'direct' }) });
    const direct = { ...camera, manualRtspUrl: 'encrypted' };
    Channel.findOne.mockReturnValue({ select: () => ({ lean: async () => direct }) });
    axios.get.mockRejectedValueOnce({ response: { status: 404, data: 'Camera not found in config' } });
    axios.post.mockResolvedValue({ data: { status: 'success' } });
    buildRTSPUrl.mockReturnValue('rtsp://camera/main');
    await refreshCameraSnapshot(camera, 'lease');
    expect(Channel.findOne).toHaveBeenCalledWith({ _id: 'camera', userId: 'owner' });
    expect(buildRTSPUrl).toHaveBeenCalledWith(expect.anything(), direct, 'main');
  });
  function sweepRows(rows, claimed) {
    Channel.find.mockReturnValue({ select: () => ({ lean: () => ({ cursor: () => (async function* () { yield* rows; })() }) }) });
    Channel.findOneAndUpdate.mockImplementation(() => ({ select: () => ({ lean: async () => claimed.shift() }) }));
  }
  it('forces one tenant sweep while respecting capture leases and continuing after upload failures', async () => {
    sweepRows([{ _id: 'first' }, { _id: 'second' }], [{ ...camera, _id: 'first' }, { ...camera, _id: 'second' }]);
    putMediaV2.mockRejectedValueOnce(new Error('storage unavailable'));
    const result = await runCameraSnapshotSweep({ force: true, userId: '13' });
    expect(result).toMatchObject({ attempted: 2, saved: 1, failed: 1 });
    expect(result.failures[0]).toMatchObject({ cameraId: 'first', stage: 'upload' });
    const filter = Channel.findOneAndUpdate.mock.calls[0][0];
    expect(filter.userId).toBe('13');
    expect(filter.$and).toHaveLength(1);
    expect(JSON.stringify(filter.$and)).toContain('snapshotLeaseUntil');
    expect(JSON.stringify(filter)).not.toContain('snapshotNextAttemptAt');
  });
  it('skips a camera claimed by another process during a forced sweep', async () => {
    sweepRows([{ _id: 'camera' }], [null]);
    expect(await runCameraSnapshotSweep({ force: true })).toMatchObject({ attempted: 0, saved: 0, skipped: 1 });
    expect(spawn).not.toHaveBeenCalled();
  });
  it('keeps due-time filtering for the automatic sweep', async () => {
    sweepRows([], []);
    await runCameraSnapshotSweep();
    expect(JSON.stringify(Channel.find.mock.calls[0][0])).toContain('snapshotNextAttemptAt');
  });
  const brands = ['hikvision', 'dahua', 'prama', 'cpplus', 'camera', 'tiandy', 'securus', 'hanwha', 'honeywell'];
  it.each(brands)('uses the common cloud HLS endpoint for %s device and direct connections', brand => {
    for (const connectionMode of ['device', 'direct']) {
      expect(snapshotStreamUrl({ _id: 'camera' }, { _id: 'nvr', brand, connectionMode }, { appEnv: 'cloud', host: 'https://tenant-stream.example/proxy/' }))
        .toBe('https://tenant-stream.example/proxy/stream/nvr-camera/playlist.m3u8');
    }
  });
  it.each(brands)('uses the appliance streaming path for %s local and onprem installations', brand => {
    for (const appEnv of ['local', 'onprem']) {
      expect(snapshotStreamUrl({ streamingPath: '/stream/appliance-channel/playlist.m3u8' }, { brand, domain: 'https://appliance.example/proxy/' }, { appEnv }))
        .toBe('https://appliance.example/proxy/stream/appliance-channel/playlist.m3u8');
    }
  });
  it('preserves absolute appliance URLs without requiring an NVR domain', () => {
    expect(snapshotStreamUrl({ streamingPath: 'https://appliance.example/hls/camera.m3u8' }, {}, { appEnv: 'local' }))
      .toBe('https://appliance.example/hls/camera.m3u8');
  });
  it('falls back to the local channel ID and configured stream host', () => {
    expect(snapshotStreamUrl({ localChannelId: 'local-camera' }, {}, { appEnv: 'onprem', host: 'http://appliance:8080' }))
      .toBe('http://appliance:8080/stream/local-camera/playlist.m3u8');
  });
  it('does not fabricate a stream URL when required connection details are missing', () => {
    expect(snapshotStreamUrl({}, {}, { appEnv: 'local' })).toBeNull();
    expect(snapshotStreamUrl({ _id: 'camera' }, { _id: 'nvr' }, { appEnv: 'cloud' })).toBeNull();
  });
  it("captures a real JPEG from HLS segments using existing query-token access", async () => {
    const actual = await vi.importActual('node:child_process');
    const actualAxios = (await vi.importActual('axios')).default;
    axios.get.mockImplementation((url, options) => options?.responseType === 'arraybuffer'
      ? actualAxios.get(url, options)
      : Promise.resolve({ data: '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg_1.ts\n' }));
    const { stdout: segment } = await promisify(actual.execFile)(ffmpegStatic, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=10',
      '-t', '1', '-c:v', 'libx264', '-f', 'mpegts', 'pipe:1',
    ], { encoding: 'buffer', windowsHide: true });
    const requests = [];
    const server = createServer((req, res) => {
      requests.push(req.url);
      if (new URL(req.url, 'http://localhost').searchParams.get('token') !== 'playback') { res.writeHead(401); res.end(); return; }
      res.setHeader('Content-Type', 'video/MP2T');
      res.end(segment);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      spawn.mockImplementation(actual.spawn);
      const jpeg = await captureFrame(`http://127.0.0.1:${server.address().port}/playlist.m3u8`, 'playback');
      expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
      expect(requests).toContain('/seg_1.ts?token=playback');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
  it("replaces the DB reference before deleting the previous image", async () => {
    await refreshCameraSnapshot(camera, "lease");
    expect(putMediaV2).toHaveBeenCalledWith(expect.objectContaining({ adminId: "admin", mediaType: "image" }));
    expect(Channel.updateOne).toHaveBeenCalledWith(expect.objectContaining({ snapshotLeaseToken: "lease" }), expect.objectContaining({ $set: { latestSnapshot: { path: "/new.jpg", capturedAt: expect.any(Date), source: 'live' } } }));
    expect(capturePlaybackSnapshot).not.toHaveBeenCalled();
    expect(Channel.updateOne.mock.invocationCallOrder[0]).toBeLessThan(deleteMediaV2.mock.invocationCallOrder[0]);
    expect(deleteMediaV2).toHaveBeenCalledWith("/old.jpg");
    const playlistUrl = new URL(axios.get.mock.calls[0][0]);
    const claims = jwt.verify(playlistUrl.searchParams.get('token'), config.get('jwt.secretKey'));
    expect(claims).toMatchObject({ status: true, user_id: 'owner', purpose: 'camera-snapshot' });
    expect(axios.get.mock.calls[1][0]).toContain('seg_1.ts?token=');
    expect(child.stdin.end).toHaveBeenCalledWith(Buffer.from('segment'));
    expect(spawn.mock.calls[0][1]).toContain('mpegts');
    expect(spawn.mock.calls[0][1]).toContain('pipe:0');
    expect(spawn.mock.calls[0][1]).not.toContain('-headers');
  });
  it("retains the old image when upload fails", async () => {
    putMediaV2.mockRejectedValue(new Error("storage unavailable"));
    await expect(refreshCameraSnapshot(camera, "lease")).rejects.toThrow("storage unavailable");
    expect(Channel.updateOne).not.toHaveBeenCalled();
    expect(deleteMediaV2).not.toHaveBeenCalled();
  });
  it('does not update the snapshot when a media segment download fails', async () => {
    axios.get.mockResolvedValueOnce({ data: '#EXTM3U\n#EXTINF:4,\nsegment.ts\n' })
      .mockRejectedValueOnce(Object.assign(new Error('segment unavailable'), { response: { status: 404 } }));
    await expect(refreshCameraSnapshot(camera, 'lease')).rejects.toMatchObject({ snapshotStage: 'playback' });
    expect(spawn).not.toHaveBeenCalled();
    expect(putMediaV2).not.toHaveBeenCalled();
    expect(Channel.updateOne).not.toHaveBeenCalled();
  });
  it('downloads initialization segments and encryption keys through Node as well', async () => {
    axios.get.mockResolvedValueOnce({ data: '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="encryption.key"\n#EXTINF:4,\nsegment.m4s\n' });
    await captureFrame('https://stream.example/playlist.m3u8', 'playback');
    expect(axios.get.mock.calls.slice(1).map(call => call[0])).toEqual([
      'https://stream.example/init.mp4?token=playback',
      'https://stream.example/encryption.key?token=playback',
      'https://stream.example/segment.m4s?token=playback',
    ]);
    expect(localPlaylist).toContain('URI="media-0.mp4"');
    expect(localPlaylist).toContain('URI="media-1.key"');
    expect(localPlaylist).toContain('media-2.m4s');
    expect(localPlaylist).not.toContain('https://');
  });
  it("keeps the reference when capture fails", async () => {
    spawn.mockImplementation(() => { setTimeout(() => child.emit("close", 1), 0); return child; });
    await expect(refreshCameraSnapshot(camera, "lease")).rejects.toThrow("Playback unavailable");
    expect(putMediaV2).not.toHaveBeenCalled();
    expect(Channel.updateOne).not.toHaveBeenCalled();
  });
  it("removes an unused new image when the camera was deleted or lease changed", async () => {
    Channel.updateOne.mockResolvedValue({ matchedCount: 0 });
    await refreshCameraSnapshot(camera, "lease");
    expect(deleteMediaV2).toHaveBeenCalledWith("/new.jpg");
    expect(deleteMediaV2).not.toHaveBeenCalledWith("/old.jpg");
  });
  it('stores recording metadata when live capture fails and playback succeeds', async () => {
    spawn.mockImplementation(() => { setTimeout(() => child.emit('close', 1), 0); return child; });
    const recordedAt = new Date('2026-10-21T12:00:00Z');
    capturePlaybackSnapshot.mockResolvedValue({ buffer: Buffer.from('archive-jpeg'), recordedAt, recordingTimeEstimated: true });
    await refreshCameraSnapshot(camera, 'lease');
    expect(Channel.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: { latestSnapshot: {
      path: '/new.jpg', capturedAt: expect.any(Date), source: 'playback', recordedAt, recordingTimeEstimated: true,
    } } }));
    expect(putMediaV2).toHaveBeenCalledWith(expect.objectContaining({ buffer: Buffer.from('archive-jpeg') }));
  });
  it("does not delete a frame when a DB acknowledgement was lost after committing", async () => {
    Channel.updateOne.mockRejectedValueOnce(new Error("acknowledgement lost"));
    Channel.findById.mockReturnValue({ select: () => ({ lean: async () => ({ latestSnapshot: { path: "/new.jpg" } }) }) });
    await expect(refreshCameraSnapshot(camera, "lease")).rejects.toThrow("acknowledgement lost");
    expect(deleteMediaV2).not.toHaveBeenCalled();
  });
  it("removes the uploaded image when a failed DB write did not commit", async () => {
    Channel.updateOne.mockRejectedValueOnce(new Error("write rejected"));
    Channel.findById.mockReturnValue({ select: () => ({ lean: async () => camera }) });
    await expect(refreshCameraSnapshot(camera, "lease")).rejects.toThrow("write rejected");
    expect(deleteMediaV2).toHaveBeenCalledWith("/new.jpg");
    expect(deleteMediaV2).not.toHaveBeenCalledWith("/old.jpg");
  });
  it("retries pending deletions before uploading another replacement", async () => {
    deleteMediaV2.mockRejectedValue(new Error("provider unavailable"));
    await expect(refreshCameraSnapshot({ ...camera, snapshotPendingDelete: ["/pending.jpg"] }, "lease")).rejects.toThrow();
    expect(putMediaV2).not.toHaveBeenCalled();
  });
  it("kills a stalled capture after 20 seconds", async () => {
    const started = new Promise(resolve => spawn.mockImplementation(() => { vi.useFakeTimers(); resolve(); return child; }));
    const result = expect(captureFrame("https://stream.example/live")).rejects.toThrow("timed out");
    await started;
    await vi.advanceTimersByTimeAsync(20000);
    await result;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    vi.useRealTimers();
  });
  it("uses local streaming paths for on-prem installations", () => {
    expect(snapshotStreamUrl({ streamingPath: "/stream/local/playlist.m3u8" }, { domain: "http://appliance:8080" }, { appEnv: "onprem" })).toBe("http://appliance:8080/stream/local/playlist.m3u8");
  });
  it("authenticates playlist, segments and initialization URIs without modifying streaming", async () => {
    axios.get.mockResolvedValue({ data: '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\nseg.ts?part=2\n' });
    const playlist = await loadSnapshotPlaylist('https://stream.example/stream/camera/playlist.m3u8', 'playback');
    expect(axios.get.mock.calls[0][0]).toBe('https://stream.example/stream/camera/playlist.m3u8?token=playback');
    expect(playlist).toContain('URI="https://stream.example/stream/camera/init.mp4?token=playback"');
    expect(playlist).toContain('https://stream.example/stream/camera/seg.ts?part=2&token=playback');
    expect(playlist).toContain('#EXT-X-ENDLIST');
  });
  it("resolves master playlists before capturing", async () => {
    axios.get.mockResolvedValueOnce({ data: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nmain/playlist.m3u8\n' });
    const playlist = await loadSnapshotPlaylist('https://stream.example/master.m3u8', 'playback');
    expect(axios.get.mock.calls[1][0]).toBe('https://stream.example/main/playlist.m3u8?token=playback');
    expect(playlist).toContain('https://stream.example/main/seg_1.ts?token=playback');
  });
  it("does not forward playback credentials to a different origin", async () => {
    axios.get.mockResolvedValue({ data: '#EXTM3U\nhttps://other.example/segment.ts\n' });
    await expect(loadSnapshotPlaylist('https://stream.example/playlist.m3u8', 'playback')).rejects.toThrow('Unsupported HLS media URL');
  });
  it("creates short-lived application tokens for existing browser-playback authentication", () => {
    const token = createSnapshotPlaybackToken('42');
    const claims = jwt.verify(token, config.get('jwt.secretKey'));
    expect(claims.status).toBe(true);
    expect(claims.user_id).toBe('42');
    expect(() => jwt.verify(token, config.get('Backend.token'))).toThrow();
    expect(claims.exp - claims.iat).toBe(120);
  });
  it("logs failures without exposing playback tokens or request configuration", () => {
    expect(snapshotFailureReason({ response: { status: 401 }, config: { url: 'https://stream/?token=secret' } })).toBe('stream/storage HTTP 401');
    expect(snapshotFailureReason({ isAxiosError: true, code: 'ECONNREFUSED', message: 'https://stream/?token=secret' })).toBe('network ECONNREFUSED');
    expect(snapshotFailureReason(new Error('Failed https://stream/?token=secret'))).not.toContain('secret');
  });
});
