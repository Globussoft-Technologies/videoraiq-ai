import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const PREVIEW_DURATION_SECONDS = 5;
const PREVIEW_TIMEOUT_MS = 20000;
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_CACHE_LIMIT = 200;
const previewCache = new Map();
const previewRequests = new Map();

const pad2 = (value) => String(value).padStart(2, "0");

export function compactPreviewTime(value) {
  const date = new Date(value);
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}Z`;
}

function dahuaPreviewTime(value) {
  const date = new Date(value);
  return `${date.getFullYear()}_${pad2(date.getMonth() + 1)}_${pad2(date.getDate())}` +
    `_${pad2(date.getHours())}_${pad2(date.getMinutes())}_${pad2(date.getSeconds())}`;
}

/**
 * Build a short archive URL directly against the device. This deliberately
 * bypasses /api/playback/start: that endpoint replaces the active playback
 * for the whole NVR and a hover must never interrupt the main player.
 */
export function buildNvrPreviewSource({ nvr, channel, start, end, ip, password }) {
  const brand = String(nvr?.brand || "").toLowerCase();
  const username = nvr?.username || "admin";
  const credentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  const rtspPort = Number(nvr?.rtspPort) || 554;
  const channelId = channel?.channelId;

  if ((brand === "hikvision" || brand === "prama") && channel?.rtspChannels?.[0]?.id) {
    const trackId = channel.rtspChannels[0].id;
    return `rtsp://${credentials}@${ip}:${rtspPort}/Streaming/tracks/${trackId}` +
      `?starttime=${compactPreviewTime(start)}&endtime=${compactPreviewTime(end)}`;
  }

  if (brand === "cpplus" || brand === "dahua") {
    return `rtsp://${credentials}@${ip}:${rtspPort}/cam/playback` +
      `?channel=${channelId}&subtype=0&starttime=${dahuaPreviewTime(start)}` +
      `&endtime=${dahuaPreviewTime(end)}`;
  }

  if (brand === "tiandy") {
    return `rtsp://${credentials}@${ip}:${rtspPort}/${channelId}/1` +
      `?starttime=${compactPreviewTime(start)}&endtime=${compactPreviewTime(end)}`;
  }

  return null;
}

export function animatedPreviewArguments({ inputUrl, offsetSeconds = 0 }) {
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
  ];
  if (/^rtsp:/i.test(inputUrl)) {
    args.push(
      "-rtsp_transport", "tcp",
      // Some deployed FFmpeg builds do not expose the generic rw_timeout
      // option for RTSP inputs. The RTSP demuxer's own timeout is portable;
      // the Node process timer below remains the final safety net.
      "-timeout", String(PREVIEW_TIMEOUT_MS * 1000),
    );
  }
  if (offsetSeconds > 0) args.push("-ss", Number(offsetSeconds).toFixed(3));
  args.push(
    "-i", inputUrl,
    "-t", String(PREVIEW_DURATION_SECONDS),
    "-an",
    "-vf", "fps=2,scale=480:-2:flags=lanczos",
    "-c:v", "libwebp_anim",
    "-quality", "58",
    "-loop", "0",
    "-f", "webp",
    "pipe:1",
  );
  return args;
}

async function captureAnimatedPreview(options) {
  const ffmpeg = spawn(
    process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg",
    animatedPreviewArguments(options),
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );

  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (error, preview) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(preview);
    };
    const timer = setTimeout(() => {
      ffmpeg.kill("SIGTERM");
      finish(new Error("Timed out generating playback preview"));
    }, PREVIEW_TIMEOUT_MS);

    ffmpeg.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > PREVIEW_MAX_BYTES) {
        ffmpeg.kill("SIGTERM");
        finish(new Error("Playback preview exceeded the size limit"));
        return;
      }
      chunks.push(chunk);
    });
    ffmpeg.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4096);
    });
    ffmpeg.once("error", (error) => finish(
      new Error(`Unable to start FFmpeg for playback preview: ${error.message}`),
    ));
    ffmpeg.once("close", (code, signal) => {
      const preview = Buffer.concat(chunks);
      if (code === 0 && preview.length > 0) finish(null, preview);
      else {
        // FFmpeg includes its complete input URL in diagnostics. Never put NVR
        // credentials from that URL into application logs.
        const safeStderr = stderr
          .replace(/([a-z]+:\/\/)[^@\s]+@/gi, "$1***:***@")
          .trim();
        finish(new Error(
          `Playback preview conversion stopped (${signal || code}): ${safeStderr || "no frames produced"}`,
        ));
      }
    });
  }).finally(() => {
    if (ffmpeg.exitCode === null && ffmpeg.signalCode === null) ffmpeg.kill("SIGTERM");
  });
}

/** Cache and coalesce the same five-second hover window. */
export async function getAnimatedPlaybackPreview({ cacheKey, ...options }) {
  const now = Date.now();
  const cached = previewCache.get(cacheKey);
  if (cached?.expiresAt > now) return cached.preview;
  if (cached) previewCache.delete(cacheKey);
  if (previewRequests.has(cacheKey)) return previewRequests.get(cacheKey);

  const request = captureAnimatedPreview(options)
    .then((preview) => {
      previewCache.set(cacheKey, {
        preview,
        expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
      });
      while (previewCache.size > PREVIEW_CACHE_LIMIT) {
        previewCache.delete(previewCache.keys().next().value);
      }
      return preview;
    })
    .finally(() => previewRequests.delete(cacheKey));
  previewRequests.set(cacheKey, request);
  return request;
}

export { PREVIEW_DURATION_SECONDS };
