import moment from "moment-timezone";
import { decrypt } from "../utils/cryptoUtils.js";
import { buildNvrPreviewSource } from "../core/v2/NVR/playbackPreview.js";
import { DEFAULT_ADMIN_TIMEZONE, validTimezone } from "../utils/timezone.js";

const RTSP_BRANDS = new Set(["hikvision", "prama", "dahua", "cpplus", "tiandy"]);

// The preview builders use local Date getters for device wall-clock values.
export function snapshotDeviceTime(value, timezone) {
  const m = moment(value).tz(validTimezone(timezone) || DEFAULT_ADMIN_TIMEZONE);
  return new Date(m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second());
}

export async function capturePlaybackSnapshot({ camera, nvr, timezone, decode, ffmpegPath, now = new Date() }) {
  const brand = String(nvr?.brand || "").toLowerCase();
  if (nvr?.userId && camera?.userId && String(nvr.userId) !== String(camera.userId)) throw new Error("Camera and recording archive owners do not match");
  if (nvr?.connectionMode === "direct") throw new Error("Direct RTSP cameras have no configured recording archive");
  if (brand === "honeywell") throw new Error("Background Honeywell playback skipped to protect the device's active playback session");
  if (!RTSP_BRANDS.has(brand) && brand !== "securus") throw new Error(`Independent playback snapshot is not supported for ${brand || "this NVR"}`);
  if (!nvr.ip || !nvr.password || !camera.channelId) throw new Error("NVR recording connection details are incomplete");
  const ip = decrypt(nvr.ip);
  const password = decrypt(nvr.password);

  // Avoid the recording currently being written. Never use the shared
  // /api/playback/start endpoint or change any interactive playback session.
  if (brand === "securus") {
    const { searchSecurusRecordings, toCompactDeviceTime } = await import("../core/v2/NVR/securusDvrip.js");
    const { captureSecurusPlaybackSnapshot, securusPreviewWindow } = await import("../core/v2/NVR/securusPlayback.js");
    const end = new Date(+now - 2 * 60 * 1000);
    const start = new Date(+end - 30 * 60 * 1000);
    const recordings = await searchSecurusRecordings({ ip, username: nvr.username || "admin", password, channelId: camera.channelId,
      start: snapshotDeviceTime(start, timezone), end: snapshotDeviceTime(end, timezone), timeoutMs: 10000 });
    const deviceStart = snapshotDeviceTime(start, timezone);
    const deviceEnd = snapshotDeviceTime(end, timezone);
    const latest = recordings.filter(r => r.start instanceof Date && r.end instanceof Date && r.end > r.start && r.start < deviceEnd && r.end > deviceStart)
      .sort((a, b) => b.end - a.end)[0];
    if (!latest) throw new Error("No recent Securus recording found");
    const point = new Date(Math.max(+latest.start, Math.min(+latest.end - 5000, +snapshotDeviceTime(end, timezone))));
    const window = securusPreviewWindow(latest, point);
    const buffer = await captureSecurusPlaybackSnapshot({ ip, username: nvr.username || "admin", password,
      recordings: [{ path: latest.path, index_start_time: toCompactDeviceTime(latest.start), index_end_time: toCompactDeviceTime(latest.end), start_time: toCompactDeviceTime(window.start), end_time: toCompactDeviceTime(window.end) }],
      offsetSeconds: window.offsetSeconds,
      ffmpegPath });
    const recordedAt = moment.tz(moment(point).format("YYYY-MM-DDTHH:mm:ss"), validTimezone(timezone) || DEFAULT_ADMIN_TIMEZONE).toDate();
    return { buffer, recordedAt, recordingTimeEstimated: true };
  }

  // Independent RTSP archive previews do not expose an exact frame wall clock.
  // Store the requested point and explicitly mark it as approximate.
  for (const minutesAgo of [2, 10, 30]) {
    const recordedAt = new Date(+now - minutesAgo * 60 * 1000);
    const input = buildNvrPreviewSource({ nvr, channel: camera, ip, password,
      start: snapshotDeviceTime(recordedAt, timezone),
      end: snapshotDeviceTime(new Date(+recordedAt + 10000), timezone) });
    if (!input) throw new Error("NVR has no independent archive preview URL");
    try {
      const buffer = await decode(input);
      return { buffer, recordedAt, recordingTimeEstimated: true };
    } catch {
      // A recording gap may cover this point. Try the next recent point.
    }
  }
  throw new Error("No frame could be read from recent NVR recordings");
}
