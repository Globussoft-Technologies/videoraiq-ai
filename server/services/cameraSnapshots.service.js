import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import axios from "axios";
import jwt from "jsonwebtoken";
import config from "config";
import Channel from "../core/v1/channels/channels.model.js";
import NVR from "../core/v1/NVR/nvr.model.js";
import Admin from "../core/v1/admin/admin.model.js";
import { resolveStream, buildRTSPUrl } from "../utils/rtspStream.js";
import { putMediaV2, deleteMediaV2 } from "../core/v2/adminStorage/mediaStorage.v2.js";
import logger from "../utils/logger.js";
import { capturePlaybackSnapshot } from "./cameraPlaybackSnapshot.service.js";

export const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;

async function snapshotStage(stage, operation) {
  try { return await operation(); }
  catch (error) { error.snapshotStage ||= stage; throw error; }
}

// Use the same application-token format as browser playback. Some deployed
// streaming servers reject service tokens even when backend decoding accepts them.
export function createSnapshotPlaybackToken(userId) {
  return jwt.sign({ user_id: userId, status: true, purpose: "camera-snapshot" }, config.get("jwt.secretKey"), { algorithm: "HS512", expiresIn: "2m" });
}

// Axios errors contain request URLs and credentials: never log the raw error.
export function snapshotFailureReason(error) {
  if (error?.response?.status) return `stream/storage HTTP ${error.response.status}`;
  if (error?.isAxiosError) return `network ${error.code || "request failed"}`;
  return String(error?.message || "unknown error").replace(/(?:https?|rtsps?):\/\/[^\s"']+/gi, "[URL]").replace(/token=[^\s&]+/gi, "token=[redacted]").slice(0, 250);
}

export async function loadSnapshotPlaylist(url, playbackToken, depth = 0) {
  if (depth > 3) throw new Error("Too many nested HLS playlists");
  const authenticatedUrl = value => {
    const target = new URL(value, url);
    if (!["http:", "https:"].includes(target.protocol) || target.origin !== new URL(url).origin) throw new Error("Unsupported HLS media URL");
    target.searchParams.set("token", playbackToken);
    return target.href;
  };
  let data;
  try {
    ({ data } = await axios.get(authenticatedUrl(url), { timeout: 20000, responseType: "text", maxContentLength: 1024 * 1024, maxRedirects: 0 }));
  } catch (error) {
    const message = error.response?.data?.message || error.response?.data;
    error.snapshotCameraMissing = error.response?.status === 404 && typeof message === "string" && /camera not found in config/i.test(message);
    throw error;
  }
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

async function downloadSnapshotMedia(playlist, directory) {
  const resources = new Map();
  const localName = url => {
    if (!resources.has(url)) {
      const extension = path.posix.extname(new URL(url).pathname).toLowerCase();
      const allowed = [".ts", ".m4s", ".mp4", ".aac", ".key"];
      resources.set(url, `media-${resources.size}${allowed.includes(extension) ? extension : ".bin"}`);
    }
    return resources.get(url);
  };
  const localPlaylist = playlist.split(/\r?\n/).map(line => {
    if (line.trim() && !line.startsWith("#")) return localName(line.trim());
    return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${localName(uri)}"`);
  }).join("\n");
  if (!resources.size || resources.size > 32) throw new Error("Invalid snapshot playlist resource count");
  const firstUrl = resources.keys().next().value;
  const directTs = !/#EXT-X-(?:KEY|MAP|BYTERANGE):/.test(playlist) && new URL(firstUrl).pathname.toLowerCase().endsWith(".ts");
  let transportStream;
  let total = 0;
  const limit = 32 * 1024 * 1024;
  const signal = AbortSignal.timeout(60000);
  for (const [url, filename] of resources) {
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, signal, maxContentLength: limit - total, maxRedirects: 0 });
    const bytes = Buffer.from(response.data);
    total += bytes.length;
    if (!bytes.length || total > limit) throw new Error("Snapshot media is empty or exceeds size limit");
    if (directTs) { transportStream = bytes; break; }
    await writeFile(path.join(directory, filename), bytes);
  }
  const filename = path.join(directory, "snapshot.m3u8");
  await writeFile(filename, localPlaylist);
  return { filename, transportStream };
}

export async function captureFrame(url, playbackToken) {
  const playlist = await loadSnapshotPlaylist(url, playbackToken);
  const directory = await mkdtemp(path.join(tmpdir(), "videoraiq-snapshot-"));
  try {
    // Node already has working authenticated HTTP access to the segments.
    // FFmpeg only reads local media, avoiding its separate HTTP/TLS stack.
    const media = await downloadSnapshotMedia(playlist, directory);
    return await decodeSnapshotFrame(media.filename, media.transportStream);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function snapshotFfmpegExecutable() {
  const configured = (config.has("FFMPEG_PATH") && config.get("FFMPEG_PATH")) || process.env.FFMPEG_PATH;
  if (configured) return configured;
  // Prefer the distro binary verified on staging; retain the bundled binary
  // for Windows and hosts without a system FFmpeg installation.
  if (process.platform === "linux" && existsSync("/usr/bin/ffmpeg")) return "/usr/bin/ffmpeg";
  return ffmpegStatic || "ffmpeg";
}

function decodeSnapshotFrame(filename, transportStream, archive = false) {
  return new Promise((resolve, reject) => {
    const binary = snapshotFfmpegExecutable();
    const child = spawn(binary, [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-threads", "1",
      ...(archive ? ["-rtsp_transport", "tcp", "-timeout", "15000000", "-i", filename] : transportStream ? ["-f", "mpegts", "-i", "pipe:0"] : ["-protocol_whitelist", "file,crypto", "-allowed_extensions", "ALL", "-f", "hls", "-i", filename]),
      "-frames:v", "1", "-threads", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
    ], { windowsHide: true, stdio: [transportStream ? "pipe" : "ignore", "pipe", "pipe"] });
    const chunks = [];
    let size = 0;
    let stderr = "";
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-4096); });
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
    child.once("close", (code, signal) => finish(code === 0 && size > 0 ? null : new Error(
      `Stream has no frame (FFmpeg exit ${code}, signal ${signal || "none"})${stderr ? `: ${snapshotFailureReason(new Error(stderr))}` : ""}`,
    )));
    if (transportStream) {
      child.stdin.on("error", () => finish(new Error("Could not feed snapshot media")));
      child.stdin.end(transportStream);
    }
  });
}

export function snapshotStreamUrl(camera, nvr, stream) {
  if (!nvr) return null;
  // All supported brands (including direct RTSP cameras) are exposed through
  // the same HLS interface. Never reconstruct a vendor-specific RTSP URL here.
  if (stream.appEnv === "cloud") {
    if (!stream.host || !nvr._id || !camera._id) return null;
    return new URL(`stream/${nvr._id}-${camera._id}/playlist.m3u8`, `${stream.host.replace(/\/+$/, "")}/`).href;
  }
  const path = camera.streamingPath || (camera.localChannelId ? `stream/${camera.localChannelId}/playlist.m3u8` : null);
  if (!path) return null;
  // Some appliances return a complete URL rather than a relative path.
  if (/^https?:\/\//i.test(path)) return new URL(path).href;
  const host = nvr.domain || stream.host;
  if (!host) return null;
  return new URL(path.replace(/^\/+/, ""), `${host.replace(/\/+$/, "")}/`).href;
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
  await snapshotStage("cleanup", () => cleanupPending(camera, token));
  const nvr = await NVR.findById(camera.nvrId).lean();
  const admin = await Admin.findOne({ user_id: String(camera.userId) }).select("_id timezone").lean();
  const stream = await resolveStream(camera.userId);
  const url = snapshotStreamUrl(camera, nvr, stream);
  const captureLive = async () => {
    if (!url) throw new Error("Camera has no usable stream URL");
    try { return await captureFrame(url, createSnapshotPlaybackToken(camera.userId)); }
    catch (error) {
      if (!error.snapshotCameraMissing || stream.appEnv !== "cloud" || String(nvr?.userId) !== String(camera.userId)) throw error;
      await snapshotStage("registration", async () => {
        const channel = nvr.connectionMode === "direct"
          ? await Channel.findOne({ _id: camera._id, userId: camera.userId }).select("+manualRtspUrl").lean()
          : camera;
        const rtspUrl = buildRTSPUrl(nvr, channel, "main");
        const response = await axios.post(`${stream.host.replace(/\/+$/, "")}/api/add-camera`, {
          id: `${nvr._id}-${camera._id}`, rtsp_url: rtspUrl, generate: "true",
        }, { headers: { Authorization: `Bearer ${stream.token}` }, timeout: 10000 });
        if (response.data?.status !== "success") throw new Error("Streaming server did not confirm camera registration");
      });
      return captureFrame(url, createSnapshotPlaybackToken(camera.userId));
    }
  };
  let buffer, playback;
  try { buffer = await snapshotStage("capture", captureLive); }
  catch (error) {
    logger.warn(`Camera ${camera._id} live snapshot failed: ${snapshotFailureReason(error)}; trying independent playback`);
    playback = await snapshotStage("playback", () => capturePlaybackSnapshot({ camera, nvr, timezone: admin?.timezone,
      ffmpegPath: snapshotFfmpegExecutable(), decode: input => decodeSnapshotFrame(input, undefined, true) }));
    buffer = playback.buffer;
  }
  const capturedAt = new Date();
  const path = await snapshotStage("upload", () => putMediaV2({ adminId: admin?._id, buffer, mediaType: "image", folderName: "camera-snapshots", originalName: `${camera._id}.jpg` }));
  let result;
  try {
    result = await Channel.updateOne({ _id: camera._id, isAdded: true, snapshotLeaseToken: token }, {
      $set: { latestSnapshot: { path, capturedAt, source: playback ? "playback" : "live",
        ...(playback ? { recordedAt: playback.recordedAt, recordingTimeEstimated: playback.recordingTimeEstimated } : {}) } },
      ...(camera.latestSnapshot?.path ? { $addToSet: { snapshotPendingDelete: camera.latestSnapshot.path } } : {}),
    });
  } catch (error) {
    error.snapshotStage = "database";
    // A lost DB acknowledgement can mean the write succeeded. Never delete
    // the new frame until a read confirms that it is not the current one.
    const current = await Channel.findById(camera._id).select("latestSnapshot").lean().catch(() => null);
    if (current && current.latestSnapshot?.path !== path) await deleteMediaV2(path).catch(() => {});
    throw error;
  }
  if (!result.matchedCount) { await deleteMediaV2(path); return false; }
  logger.info(`Camera snapshot saved for ${camera._id} at ${capturedAt.toISOString()}`);
  if (camera.latestSnapshot?.path) await snapshotStage("cleanup", () => cleanupPending({ ...camera, snapshotPendingDelete: [camera.latestSnapshot.path] }, token));
  return true;
}

let running = false;
export async function runCameraSnapshotSweep({ force = false, userId } = {}) {
  const summary = { attempted: 0, saved: 0, failed: 0, skipped: 0, failures: [] };
  if (running) return { ...summary, alreadyRunning: true };
  running = true;
  const eligibility = now => ({
    ...(userId ? { userId: String(userId) } : {}),
    $and: [
      ...(!force ? [{ $or: [{ snapshotNextAttemptAt: { $exists: false } }, { snapshotNextAttemptAt: { $lte: now } }] }] : []),
      { $or: [{ snapshotLeaseUntil: { $exists: false } }, { snapshotLeaseUntil: { $lte: now } }] },
    ],
  });
  try {
    const cursor = Channel.find(eligibility(new Date())).select("_id").lean().cursor();
    for await (const row of cursor) {
      const now = new Date();
      const token = randomUUID();
      const camera = await Channel.findOneAndUpdate({
        _id: row._id,
        ...eligibility(now),
      }, { $set: { snapshotLeaseToken: token, snapshotLeaseUntil: new Date(+now + 10 * 60 * 1000), snapshotNextAttemptAt: new Date(+now + SNAPSHOT_INTERVAL_MS) } }, { new: true })
        .select("+snapshotPendingDelete").lean();
      if (!camera) { summary.skipped++; continue; }
      summary.attempted++;
      try {
        if (await refreshCameraSnapshot(camera, token)) summary.saved++;
        else summary.skipped++;
      }
      catch (error) {
        const failure = { cameraId: String(row._id), name: camera.customName || camera.name, stage: error.snapshotStage || "resolve", reason: snapshotFailureReason(error) };
        summary.failed++;
        summary.failures.push(failure);
        logger.warn(`Camera snapshot refresh failed for ${row._id} at ${failure.stage}: ${failure.reason}; retaining the last successful image`);
      }
      finally { await Channel.updateOne({ _id: row._id, snapshotLeaseToken: token }, { $unset: { snapshotLeaseUntil: 1, snapshotLeaseToken: 1 } }); }
    }
  } catch (error) {
    summary.error = snapshotFailureReason(error);
    logger.warn(`Camera snapshot sweep failed: ${summary.error}`);
  } finally { running = false; }
  return summary;
}

let timer;
export function startCameraSnapshotRunner() {
  const enabled = config.has("CAMERA_SNAPSHOTS_ENABLED")
    ? config.get("CAMERA_SNAPSHOTS_ENABLED")
    : true;
  if (timer || enabled === false || enabled === "false") return;
  void runCameraSnapshotSweep();
  timer = setInterval(() => void runCameraSnapshotSweep(), 60000);
  timer.unref();
}
