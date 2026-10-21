import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import axios from "axios";
import jwt from "jsonwebtoken";
import config from "config";
import Channel from "../core/v1/channels/channels.model.js";
import NVR from "../core/v1/NVR/nvr.model.js";
import Admin from "../core/v1/admin/admin.model.js";
import { resolveStream } from "../utils/rtspStream.js";
import { putMediaV2, deleteMediaV2 } from "../core/v2/adminStorage/mediaStorage.v2.js";
import logger from "../utils/logger.js";

export const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;

// The unmodified streaming server validates these through by-login-token.
export function createSnapshotPlaybackToken(userId) {
  return jwt.sign({ service: "python-backend", user_id: userId, purpose: "camera-snapshot" }, config.get("Backend.token"), { algorithm: "HS512", expiresIn: "2m" });
}

export async function loadSnapshotPlaylist(url, playbackToken, depth = 0) {
  if (depth > 3) throw new Error("Too many nested HLS playlists");
  const authenticatedUrl = value => {
    const target = new URL(value, url);
    if (!["http:", "https:"].includes(target.protocol) || target.origin !== new URL(url).origin) throw new Error("Unsupported HLS media URL");
    target.searchParams.set("token", playbackToken);
    return target.href;
  };
  const { data } = await axios.get(authenticatedUrl(url), { timeout: 20000, responseType: "text", maxContentLength: 1024 * 1024, maxRedirects: 0 });
  if (typeof data !== "string" || !data.trimStart().startsWith("#EXTM3U")) throw new Error("Invalid HLS playlist");
  const lines = data.split(/\r?\n/);
  // Resolve a master playlist before passing a fixed media playlist to ffmpeg.
  const variant = lines.findIndex(line => line.startsWith("#EXT-X-STREAM-INF:"));
  if (variant >= 0) {
    const child = lines.slice(variant + 1).find(line => line.trim() && !line.startsWith("#"));
    if (!child) throw new Error("HLS variant has no URL");
    return loadSnapshotPlaylist(authenticatedUrl(child.trim()), playbackToken, depth + 1);
  }
  return lines.map(line => {
    if (line.trim() && !line.startsWith("#")) return authenticatedUrl(line.trim());
    return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${authenticatedUrl(uri)}"`);
  }).join("\n") + "\n#EXT-X-ENDLIST\n";
}

export async function captureFrame(url, playbackToken) {
  // Query tokens do not propagate from a playlist to its segments. Resolve
  // every URI in the backend, then feed a finite playlist through stdin.
  const playlist = await loadSnapshotPlaylist(url, playbackToken);
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-protocol_whitelist", "pipe,http,https,tcp,tls,crypto", "-f", "hls", "-i", "pipe:0",
      "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
    ], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const chunks = [];
    let size = 0;
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) { child.kill("SIGKILL"); reject(error); }
      else resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(() => finish(new Error("Frame capture timed out")), 20000);
    child.stdout.on("data", chunk => {
      size += chunk.length;
      if (size > 15 * 1024 * 1024) finish(new Error("Frame exceeds size limit"));
      else chunks.push(chunk);
    });
    child.once("error", () => finish(new Error("Could not start frame capture")));
    child.once("close", code => finish(code === 0 && size > 0 ? null : new Error("Stream has no frame")));
    child.stdin.on("error", () => finish(new Error("Could not feed snapshot playlist")));
    child.stdin.end(playlist);
  });
}

export function snapshotStreamUrl(camera, nvr, stream) {
  if (!nvr) return null;
  if (stream.appEnv === "cloud") {
    return new URL(`stream/${nvr._id}-${camera._id}/playlist.m3u8`, `${stream.host.replace(/\/+$/, "")}/`).href;
  }
  if (!nvr.domain || !camera.streamingPath) return null;
  return new URL(camera.streamingPath.replace(/^\/+/, ""), `${nvr.domain.replace(/\/+$/, "")}/`).href;
}

async function cleanupPending(camera, token) {
  for (const path of camera.snapshotPendingDelete || []) {
    try {
      await deleteMediaV2(path);
    } catch (error) {
      if (error.statusCode !== 404 && error.$metadata?.httpStatusCode !== 404 && !/no such file/i.test(error.message)) throw error;
    }
    await Channel.updateOne({ _id: camera._id, snapshotLeaseToken: token }, { $pull: { snapshotPendingDelete: path } });
  }
}

export async function refreshCameraSnapshot(camera, token) {
  // Retry failed provider deletions before creating another image.
  await cleanupPending(camera, token);
  const nvr = await NVR.findById(camera.nvrId).lean();
  const stream = await resolveStream(camera.userId);
  const url = snapshotStreamUrl(camera, nvr, stream);
  if (!url) return;
  const buffer = await captureFrame(url, createSnapshotPlaybackToken(camera.userId));
  const capturedAt = new Date();
  const admin = await Admin.findOne({ user_id: String(camera.userId) }).select("_id").lean();
  const path = await putMediaV2({ adminId: admin?._id, buffer, mediaType: "image", folderName: "camera-snapshots", originalName: `${camera._id}.jpg` });
  let result;
  try {
    result = await Channel.updateOne({ _id: camera._id, isAdded: true, snapshotLeaseToken: token }, {
      $set: { latestSnapshot: { path, capturedAt } },
      ...(camera.latestSnapshot?.path ? { $addToSet: { snapshotPendingDelete: camera.latestSnapshot.path } } : {}),
    });
  } catch (error) {
    // A lost DB acknowledgement can mean the write succeeded. Never delete
    // the new frame until a read confirms that it is not the current one.
    const current = await Channel.findById(camera._id).select("latestSnapshot").lean().catch(() => null);
    if (current && current.latestSnapshot?.path !== path) await deleteMediaV2(path).catch(() => {});
    throw error;
  }
  if (!result.matchedCount) { await deleteMediaV2(path); return; }
  if (camera.latestSnapshot?.path) await cleanupPending({ ...camera, snapshotPendingDelete: [camera.latestSnapshot.path] }, token);
}

let running = false;
export async function runCameraSnapshotSweep() {
  if (running) return;
  running = true;
  try {
    const cursor = Channel.find({
      $and: [
        { $or: [{ snapshotNextAttemptAt: { $exists: false } }, { snapshotNextAttemptAt: { $lte: new Date() } }] },
        { $or: [{ snapshotLeaseUntil: { $exists: false } }, { snapshotLeaseUntil: { $lte: new Date() } }] },
      ],
    }).select("_id").lean().cursor();
    for await (const row of cursor) {
      const now = new Date();
      const token = randomUUID();
      const camera = await Channel.findOneAndUpdate({
        _id: row._id,
        $and: [
          { $or: [{ snapshotNextAttemptAt: { $exists: false } }, { snapshotNextAttemptAt: { $lte: now } }] },
          { $or: [{ snapshotLeaseUntil: { $exists: false } }, { snapshotLeaseUntil: { $lte: now } }] },
        ],
      }, { $set: { snapshotLeaseToken: token, snapshotLeaseUntil: new Date(+now + 10 * 60 * 1000), snapshotNextAttemptAt: new Date(+now + SNAPSHOT_INTERVAL_MS) } }, { new: true })
        .select("+snapshotPendingDelete").lean();
      if (!camera) continue;
      try { await refreshCameraSnapshot(camera, token); }
      catch { logger.warn(`Camera snapshot refresh failed for ${row._id}; retaining the last successful image`); }
      finally { await Channel.updateOne({ _id: row._id, snapshotLeaseToken: token }, { $unset: { snapshotLeaseUntil: 1, snapshotLeaseToken: 1 } }); }
    }
  } catch (error) {
    logger.warn(`Camera snapshot sweep failed: ${error.message}`);
  } finally { running = false; }
}

let timer;
export function startCameraSnapshotRunner() {
  if (timer || process.env.CAMERA_SNAPSHOTS_ENABLED === "false") return;
  void runCameraSnapshotSweep();
  timer = setInterval(() => void runCameraSnapshotSweep(), 60000);
  timer.unref();
}
