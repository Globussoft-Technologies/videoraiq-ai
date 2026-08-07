/**
 * Shared "delete a document's stored media, best-effort" logic used by
 * anything that removes rows which may reference files on the active
 * storage provider (NAS or Oracle, via mediaStorage.js) — the retention
 * sweeper and NVR/channel cascade deletion.
 *
 * Kept in one place so both callers stay in sync on which fields carry a
 * media path and how a failed delete is handled, instead of drifting the
 * way retention and NVR-delete previously did (NVR-delete didn't touch
 * storage at all).
 */
import logger from "./logger.js";
import { deleteMedia } from "./mediaStorage.js";

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
