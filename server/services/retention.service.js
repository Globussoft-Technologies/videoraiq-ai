/**
 * Data retention sweeper.
 *
 * Deletes Attendance logs, Access logs (all three collections) and Incidents
 * older than the configured retention period — media files first (from the
 * active storage provider via mediaStorage), then the DB rows.
 *
 * Config (config/<env>.json):
 *   "DataRetention": {
 *     "enabled": true,
 *     "incidents": "3m",        // Nd | Nm | Ny (days / months / years)
 *     "attendance": "1y",
 *     "accessLogs": "6m",       // omit a key (or null) to keep that data forever
 *     "batchSize": 200,         // docs per batch (default 200)
 *     "maxRunMinutes": 60,      // hard time budget per sweep (default 60)
 *     "intervalHours": 24       // how often to sweep (default 24)
 *   }
 *
 * Safety properties (this runs inside the API process, which exits on any
 * unhandled rejection — nothing here may ever throw out of a timer):
 * - every entry point is fully try/caught; a sweep failure only logs
 * - work is batched and time-boxed, so a huge backlog can't hog the process;
 *   whatever is left is picked up by the next run (idempotent by design)
 * - media deletion is best-effort with bounded concurrency: a storage failure
 *   never blocks retention — the DB row is still removed and the orphaned
 *   path is logged
 * - an in-process lock prevents overlapping sweeps
 */
import config from "config";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { Incident } from "../core/v1/incidents/incidents.model.js";
import attendanceModel from "../core/v1/attendance/attendance.model.js";
import accessLogsModel from "../core/v1/accesslogs/accesslogs.model.js";
import newAccessLogsModel from "../core/v1/accesslogs/newAccessLogs.model.js";
import reworkedAccessLogsModel from "../core/v1/accesslogs/reworkedAccesslogs.model.js";
import { deleteMedia, toRelativeMediaPath } from "../utils/mediaStorage.js";

// Every media-bearing key across the swept documents, including nested ones:
// incidents (Image, currentImage, videoLink, timeSeries[].Image), attendance
// (events[].images.{face,person,frame}), access logs
// (sessions[].images.* and usersLogs[].sessions[].images.*).
const MEDIA_KEYS = new Set([
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

// Only the fields the sweep needs — keeps batch memory small.
const MEDIA_SELECT =
  "_id Image currentImage videoLink timeSeries.Image events.images sessions.images usersLogs.sessions.images";

const DATASETS = [
  { retentionKey: "incidents", model: Incident, dateField: "timeOfIncident" },
  { retentionKey: "attendance", model: attendanceModel, dateField: "createdAt" },
  { retentionKey: "accessLogs", model: accessLogsModel, dateField: "createdAt" },
  { retentionKey: "accessLogs", model: newAccessLogsModel, dateField: "createdAt" },
  { retentionKey: "accessLogs", model: reworkedAccessLogsModel, dateField: "createdAt" },
];

/** "90d" | "3m" | "1y" -> cutoff Date (null when unset/invalid). */
export const retentionCutoff = (spec, now = new Date()) => {
  const m = String(spec ?? "")
    .trim()
    .match(/^(\d+)\s*(d|m|y)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!n) return null;
  const unit = m[2].toLowerCase();
  const d = new Date(now);
  if (unit === "d") d.setDate(d.getDate() - n);
  else if (unit === "m") d.setMonth(d.getMonth() - n);
  else d.setFullYear(d.getFullYear() - n);
  return d;
};

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
// the SFTP pool. Returns how many deletions failed (already-gone files count
// as success for retention purposes).
const CHUNK = 5;
async function deleteMediaBestEffort(paths, label) {
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
          `[RETENTION] ${label}: failed to delete media ${paths[i + j]}: ${r.reason?.message}`,
        );
      }
    }
  }
  return failures;
}

/**
 * Delete one dataset's expired docs in batches until done or out of time.
 * Batches are addressed through the _id index (ObjectIds embed their creation
 * time), so this never collection-scans a huge collection per batch. The date
 * field is also matched as the source of truth.
 */
export async function sweepDataset({ model, dateField, cutoff, batchSize, deadline, label }) {
  const idCutoff = mongoose.Types.ObjectId.createFromTime(Math.floor(cutoff.getTime() / 1000));
  const query = { _id: { $lt: idCutoff }, [dateField]: { $lt: cutoff } };

  let deleted = 0;
  let mediaFailures = 0;

  while (Date.now() < deadline) {
    const docs = await model
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .select(MEDIA_SELECT)
      .lean();
    if (!docs.length) break;

    const paths = docs
      .flatMap((d) => collectMediaPaths(d))
      .map(toRelativeMediaPath)
      // External URLs (e.g. video links) aren't ours to delete.
      .filter((p) => typeof p === "string" && p.trim() && !/^https?:\/\//i.test(p));

    mediaFailures += await deleteMediaBestEffort(paths, label);

    const res = await model.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
    deleted += res.deletedCount || 0;

    if (docs.length < batchSize) break;
  }

  return { deleted, mediaFailures, timedOut: Date.now() >= deadline };
}

let running = false; // ponytail: in-process lock — one API instance runs the sweeper

/** One full sweep across all configured datasets. Never throws. */
export async function runRetentionSweep() {
  if (running) {
    logger.warn("[RETENTION] sweep already running — skipping this tick");
    return null;
  }
  running = true;
  const summary = {};
  try {
    const cfg = config.has("DataRetention") ? config.get("DataRetention") : {};
    const batchSize = Math.max(Number(cfg.batchSize) || 200, 1);
    const deadline = Date.now() + (Math.max(Number(cfg.maxRunMinutes) || 60, 1)) * 60_000;

    for (const dataset of DATASETS) {
      const cutoff = retentionCutoff(cfg[dataset.retentionKey]);
      if (!cutoff) continue; // no retention configured for this dataset — keep forever

      const label = `${dataset.retentionKey}/${dataset.model.modelName}`;
      try {
        const result = await sweepDataset({ ...dataset, cutoff, batchSize, deadline, label });
        summary[label] = result;
        if (result.deleted || result.mediaFailures) {
          logger.info(
            `[RETENTION] ${label}: deleted ${result.deleted} docs older than ${cutoff.toISOString()}` +
              (result.mediaFailures ? ` (${result.mediaFailures} media deletions failed)` : "") +
              (result.timedOut ? " — time budget hit, resuming next run" : ""),
          );
        }
      } catch (err) {
        // One dataset failing must not stop the others.
        summary[label] = { error: err?.message };
        logger.error(`[RETENTION] ${label} sweep failed: ${err?.message}`);
      }
    }
  } catch (err) {
    logger.error(`[RETENTION] sweep failed: ${err?.message}`);
  } finally {
    running = false;
  }
  return summary;
}

/**
 * Start the periodic sweeper: first run shortly after boot, then every
 * intervalHours. Plain in-process timers — no queue that can silently die
 * with jobs stuck in it. Safe to call unconditionally; does nothing unless
 * DataRetention.enabled is true.
 */
export function scheduleRetentionSweep() {
  try {
    const cfg = config.has("DataRetention") ? config.get("DataRetention") : {};
    if (!cfg.enabled) {
      logger.info("[RETENTION] disabled — sweeper not scheduled");
      return;
    }
    const intervalMs = (Math.max(Number(cfg.intervalHours) || 24, 1)) * 3_600_000;
    const startDelayMs = 5 * 60_000; // let the server settle before the first sweep

    const guarded = () => runRetentionSweep().catch((err) =>
      // runRetentionSweep never throws, but the process exits on any
      // unhandled rejection — belt and braces.
      logger.error(`[RETENTION] unexpected sweep rejection: ${err?.message}`),
    );

    setTimeout(guarded, startDelayMs).unref();
    setInterval(guarded, intervalMs).unref();
    logger.info(
      `[RETENTION] sweeper scheduled: first run in 5m, then every ${intervalMs / 3_600_000}h`,
    );
  } catch (err) {
    logger.error(`[RETENTION] failed to schedule sweeper: ${err?.message}`);
  }
}
