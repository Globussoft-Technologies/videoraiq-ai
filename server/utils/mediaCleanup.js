/**
 * Best-effort media cleanup for explicit log deletion, retention, and camera
 * preview snapshots. Removing a device does not delete historical log media.
 */
import logger from "./logger.js";
import { deleteMedia as deleteLegacyMedia } from "./mediaStorage.js";

// Keep the legacy module graph unchanged. Only tenant/version encoded paths
// lazy-load the v2 dispatcher, which avoids making v1/on-prem startup depend on
// the optional admin-storage feature.
async function deleteMedia(mediaPath) {
  if (/(?:^|[\\/])v2[\\/][a-f\d]{24}[\\/](?:env|[a-f\d]{24})[\\/]/i.test(String(mediaPath))) {
    const { deleteMediaV2 } = await import("../core/v2/adminStorage/mediaStorage.v2.js");
    return deleteMediaV2(mediaPath);
  }
  return deleteLegacyMedia(mediaPath);
}

// Every media-bearing key across the documents this is used on, including
// nested ones: incidents (Image, currentImage, videoLink, timeSeries[].Image),
// attendance (events[].images.{face,person,frame}), access logs
// (sessions[].images.* and usersLogs[].sessions[].images.*).
export const MEDIA_KEYS = new Set([
  "Image",
  "currentImage",
  "videoLink",
  "face",
  "person",
  "frame",
  "faceImage",
  "personImage",
  "frameImage",
]);

const isPlain = (v) =>
  Array.isArray(v) || (v !== null && typeof v === "object" && v.constructor === Object);

/** Walk a lean doc and collect every media path, however deeply nested. */
export const collectMediaPaths = (node, out = []) => {
  if (!isPlain(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && value.trim() && MEDIA_KEYS.has(key)) {
      out.push(value);
    } else if (isPlain(value)) {
      collectMediaPaths(value, out);
    }
  }
  return out;
};

// Best-effort media deletion, bounded concurrency so a big batch can't flood
// the SFTP pool / Oracle client. Returns how many deletions failed
// (already-gone files count as success — the outcome we actually want).
const CHUNK = 5;
export async function deleteMediaBestEffort(paths, label) {
  let failures = 0;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const results = await Promise.allSettled(
      paths.slice(i, i + CHUNK).map((p) => deleteMedia(p)),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "rejected" && !/no such file/i.test(r.reason?.message || "")) {
        failures++;
        logger.warn(
          `${label}: failed to delete media ${paths[i + j]}: ${r.reason?.message}`,
        );
      }
    }
  }
  return failures;
}
