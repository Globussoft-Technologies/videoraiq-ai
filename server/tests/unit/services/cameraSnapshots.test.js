import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import axios from "axios";
import jwt from "jsonwebtoken";
import config from "config";
import { createServer } from "node:http";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../../../core/v1/channels/channels.model.js", () => ({ default: { updateOne: vi.fn(), findById: vi.fn() } }));
vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../../../core/v1/admin/admin.model.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../utils/rtspStream.js", () => ({ resolveStream: vi.fn() }));
vi.mock("../../../core/v2/adminStorage/mediaStorage.v2.js", () => ({ putMediaV2: vi.fn(), deleteMediaV2: vi.fn() }));
import { spawn } from "node:child_process";
import Channel from "../../../core/v1/channels/channels.model.js";
import NVR from "../../../core/v1/NVR/nvr.model.js";
import Admin from "../../../core/v1/admin/admin.model.js";
import { resolveStream } from "../../../utils/rtspStream.js";
import { putMediaV2, deleteMediaV2 } from "../../../core/v2/adminStorage/mediaStorage.v2.js";
import { captureFrame, refreshCameraSnapshot, snapshotStreamUrl, loadSnapshotPlaylist, createSnapshotPlaybackToken } from "../../../services/cameraSnapshots.service.js";

const camera = { _id: "camera", nvrId: "nvr", userId: "owner", latestSnapshot: { path: "/old.jpg" } };
let child;
beforeEach(() => {
  vi.resetAllMocks();
  child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = vi.fn();
  child.kill = vi.fn();
  spawn.mockImplementation(() => {
    setTimeout(() => { child.stdout.emit("data", Buffer.from("jpeg")); child.emit("close", 0); }, 0);
    return child;
  });
  NVR.findById.mockReturnValue({ lean: async () => ({ _id: "nvr" }) });
  Admin.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: "admin" }) }) });
  resolveStream.mockResolvedValue({ appEnv: "cloud", host: "https://stream.example", token: "service" });
  putMediaV2.mockResolvedValue("/new.jpg");
  deleteMediaV2.mockResolvedValue();
  Channel.updateOne.mockResolvedValue({ matchedCount: 1 });
  axios.get.mockResolvedValue({ data: '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg_1.ts\n' });
});

describe("camera snapshots", () => {
  it("captures a real JPEG from HLS segments using existing query-token access", async () => {
    const actual = await vi.importActual('node:child_process');
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
    expect(Channel.updateOne).toHaveBeenCalledWith(expect.objectContaining({ snapshotLeaseToken: "lease" }), expect.objectContaining({ $set: { latestSnapshot: { path: "/new.jpg", capturedAt: expect.any(Date) } } }));
    expect(Channel.updateOne.mock.invocationCallOrder[0]).toBeLessThan(deleteMediaV2.mock.invocationCallOrder[0]);
    expect(deleteMediaV2).toHaveBeenCalledWith("/old.jpg");
    const playlistUrl = new URL(axios.get.mock.calls[0][0]);
    const claims = jwt.verify(playlistUrl.searchParams.get('token'), config.get('Backend.token'));
    expect(claims).toMatchObject({ service: 'python-backend', user_id: 'owner', purpose: 'camera-snapshot' });
    expect(child.stdin.end.mock.calls[0][0]).toContain('seg_1.ts?token=');
    expect(spawn.mock.calls[0][1]).not.toContain('-headers');
  });
  it("retains the old image when upload fails", async () => {
    putMediaV2.mockRejectedValue(new Error("storage unavailable"));
    await expect(refreshCameraSnapshot(camera, "lease")).rejects.toThrow("storage unavailable");
    expect(Channel.updateOne).not.toHaveBeenCalled();
    expect(deleteMediaV2).not.toHaveBeenCalled();
  });
  it("keeps the reference when capture fails", async () => {
    spawn.mockImplementation(() => { setTimeout(() => child.emit("close", 1), 0); return child; });
    await expect(refreshCameraSnapshot(camera, "lease")).rejects.toThrow("Stream has no frame");
    expect(putMediaV2).not.toHaveBeenCalled();
    expect(Channel.updateOne).not.toHaveBeenCalled();
  });
  it("removes an unused new image when the camera was deleted or lease changed", async () => {
    Channel.updateOne.mockResolvedValue({ matchedCount: 0 });
    await refreshCameraSnapshot(camera, "lease");
    expect(deleteMediaV2).toHaveBeenCalledWith("/new.jpg");
    expect(deleteMediaV2).not.toHaveBeenCalledWith("/old.jpg");
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
    vi.useFakeTimers();
    spawn.mockReturnValue(child);
    const result = expect(captureFrame("https://stream.example/live")).rejects.toThrow("timed out");
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
  it("creates short-lived tokens accepted by the existing service-token verifier", () => {
    const claims = jwt.verify(createSnapshotPlaybackToken('42'), config.get('Backend.token'));
    expect(claims.service).toBe('python-backend');
    expect(claims.exp - claims.iat).toBe(120);
  });
});
