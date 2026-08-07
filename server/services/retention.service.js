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
 * Per-admin overrides live on the Admin doc under `retention`, not in config —
 * same keys as the block above, each null by default meaning "use the global
 * value". An admin carrying ANY override is swept in their own pass using
 * their merged settings, and is excluded from the global pass, so a longer
 * per-admin retention is never undercut by the global cutoff.
 *   retention.enabled: false  -> never sweep this admin
 *   retention.<dataset>: "never" -> keep that dataset forever for this admin
 *   retention.batchSize / maxRunMinutes -> sizing for their own pass; the
 *     time slice is still clamped to the global run budget
 *   retention.intervalHours -> sweep them at most this often, tracked via
 *     retention.lastSweepAt (the global intervalHours remains the tick rate)
 * The global `enabled` flag stays a process-wide kill switch: when it is off
 * nothing is scheduled, per-admin settings included.
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
import adminModel from "../core/v1/admin/admin.model.js";
import { Incident } from "../core/v1/incidents/incidents.model.js";
import attendanceModel from "../core/v1/attendance/attendance.model.js";
import accessLogsModel from "../core/v1/accesslogs/accesslogs.model.js";
import newAccessLogsModel from "../core/v1/accesslogs/newAccessLogs.model.js";
import reworkedAccessLogsModel from "../core/v1/accesslogs/reworkedAccesslogs.model.js";
import { toRelativeMediaPath } from "../utils/mediaStorage.js";
import { collectMediaPaths, deleteMediaBestEffort } from "../utils/mediaCleanup.js";

// Re-exported for backward compatibility — this module used to define
// collectMediaPaths itself; it now lives in utils/mediaCleanup.js so
// NVR/channel deletion (services/delete.service.js) can share the exact
// same field list and nested-path walk instead of redefining it.
export { collectMediaPaths };

// Only the fields the sweep needs — keeps batch memory small.
const MEDIA_SELECT =
  "_id Image currentImage videoLink timeSeries.Image events.images sessions.images usersLogs.sessions.images";

// ownerField: the column on the swept doc that identifies the owning admin.
// ownerFrom: which Admin field that column holds — incidents store the admin's
// STRING user_id, everything else stores the admin's _id ObjectId. Getting this
// pair wrong makes the owner filter match nothing (a silent no-op sweep).
const DATASETS = [
  { retentionKey: "incidents", model: Incident, dateField: "timeOfIncident", ownerField: "userId", ownerFrom: "user_id" },
  { retentionKey: "attendance", model: attendanceModel, dateField: "createdAt", ownerField: "user", ownerFrom: "_id" },
  { retentionKey: "accessLogs", model: accessLogsModel, dateField: "createdAt", ownerField: "admin", ownerFrom: "_id" },
  { retentionKey: "accessLogs", model: newAccessLogsModel, dateField: "createdAt", ownerField: "admin", ownerFrom: "_id" },
  { retentionKey: "accessLogs", model: reworkedAccessLogsModel, dateField: "createdAt", ownerField: "admin", ownerFrom: "_id" },
];

// Keys an admin may override under `retention`. lastSweepAt is excluded — it is
// the sweeper's own bookkeeping, not a setting, and must not mark an admin as
// "has overrides" on its own.
export const OVERRIDE_KEYS = [
  "enabled",
  "incidents",
  "attendance",
  "accessLogs",
  "batchSize",
  "maxRunMinutes",
  "intervalHours",
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

/**
 * Retention periods an admin may set through the API — 6 months is the product
 * cap, and the settings UI offers exactly these three options. Kept here so the
 * API can never store a period the settings screen cannot represent.
 *
 * The global config block is deliberately NOT bound by this: an operator can
 * still configure any period the sweeper parses in config/<env>.json.
 */
export const RETENTION_OPTION_MONTHS = [1, 3, 6];
export const MAX_RETENTION_MONTHS = Math.max(...RETENTION_OPTION_MONTHS);

/** "1m" | "3m" | "6m" -> true. Everything else (including "180d") -> false. */
export const isAllowedRetentionSpec = (spec) => {
  const m = String(spec ?? "").trim().match(/^(\d+)\s*m$/i);
  return !!m && RETENTION_OPTION_MONTHS.includes(Number(m[1]));
};

/**
 * Delete one dataset's expired docs in batches until done or out of time.
 * Batches are addressed through the _id index (ObjectIds embed their creation
 * time), so this never collection-scans a huge collection per batch. The date
 * field is also matched as the source of truth.
 */
export async function sweepDataset({
  model,
  dateField,
  cutoff,
  batchSize,
  deadline,
  label,
  ownerFilter,
}) {
  const idCutoff = mongoose.Types.ObjectId.createFromTime(Math.floor(cutoff.getTime() / 1000));
  const query = { ...ownerFilter, _id: { $lt: idCutoff }, [dateField]: { $lt: cutoff } };

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

    mediaFailures += await deleteMediaBestEffort(paths, `[RETENTION] ${label}`);

    const res = await model.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
    deleted += res.deletedCount || 0;

    if (docs.length < batchSize) break;
  }

  return { deleted, mediaFailures, timedOut: Date.now() >= deadline };
}

/**
 * Admins carrying any per-admin retention override. Returns null if the lookup
 * fails — the caller then skips the sweep entirely rather than fall back to the
 * global cutoff, which could delete data an admin configured to keep longer.
 */
async function loadRetentionOverrides() {
  try {
    return await adminModel
      .find({ $or: OVERRIDE_KEYS.map((k) => ({ [`retention.${k}`]: { $ne: null } })) })
      .select("_id user_id retention")
      .lean();
  } catch (err) {
    logger.error(`[RETENTION] failed to load per-admin overrides: ${err?.message}`);
    return null;
  }
}

/** Drop unset keys so an override object can layer cleanly over the global config. */
const definedOnly = (obj) =>
  Object.fromEntries(
    Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined && v !== ""),
  );

/**
 * Per-admin intervalHours gate. The global interval is the tick rate; an admin
 * asking to be swept less often is skipped until their window elapses. Unset
 * (or never swept) means "every tick", matching the global behaviour.
 */
function dueForSweep(retention, now = Date.now()) {
  const hours = Number(retention?.intervalHours);
  if (!Number.isFinite(hours) || hours <= 0) return true;
  const last = retention?.lastSweepAt;
  if (!last) return true;
  const at = new Date(last).getTime();
  return !Number.isFinite(at) || now - at >= hours * 3_600_000;
}

/** Record that an admin's pass ran, for their intervalHours gate. Never throws. */
async function markSwept(adminId) {
  try {
    await adminModel.updateOne(
      { _id: adminId },
      { $set: { "retention.lastSweepAt": new Date() } },
    );
  } catch (err) {
    logger.error(`[RETENTION] failed to record lastSweepAt for ${adminId}: ${err?.message}`);
  }
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
    const globalBatchSize = Math.max(Number(cfg.batchSize) || 200, 1);
    const globalDeadline =
      Date.now() + Math.max(Number(cfg.maxRunMinutes) || 60, 1) * 60_000;

    // One dataset (or one admin's pass) failing must not stop the others.
    const runPass = async ({ dataset, cutoff, label, ownerFilter, batchSize, deadline }) => {
      try {
        const result = await sweepDataset({
          ...dataset, cutoff, batchSize, deadline, label, ownerFilter,
        });
        summary[label] = result;
        if (result.deleted || result.mediaFailures) {
          logger.info(
            `[RETENTION] ${label}: deleted ${result.deleted} docs older than ${cutoff.toISOString()}` +
              (result.mediaFailures ? ` (${result.mediaFailures} media deletions failed)` : "") +
              (result.timedOut ? " — time budget hit, resuming next run" : ""),
          );
        }
      } catch (err) {
        summary[label] = { error: err?.message };
        logger.error(`[RETENTION] ${label} sweep failed: ${err?.message}`);
      }
    };

    const overrides = await loadRetentionOverrides();
    if (!overrides) return summary; // can't tell whose rules differ — delete nothing

    // --- per-admin passes: each overriding admin, on their own merged settings.
    for (const admin of overrides) {
      const eff = { ...cfg, ...definedOnly(admin.retention) };
      const who = admin.user_id;

      if (eff.enabled === false) continue; // opted out entirely
      if (!dueForSweep(admin.retention)) continue; // not due under their own interval

      // Their time slice is clamped to the global run budget: one admin must
      // not be able to consume the whole sweep window and starve the rest.
      const deadline = Math.min(
        globalDeadline,
        Date.now() + Math.max(Number(eff.maxRunMinutes) || 60, 1) * 60_000,
      );
      const batchSize = Math.max(Number(eff.batchSize) || 200, 1);

      for (const dataset of DATASETS) {
        const owner = dataset.ownerFrom === "_id" ? admin._id : String(who ?? "");
        if (!owner) continue;

        const spec = eff[dataset.retentionKey];
        const cutoff = retentionCutoff(spec);
        if (!cutoff) {
          // "never" = keep forever. Anything else unparseable is also kept, but
          // loudly — silently deleting on a typo is unrecoverable.
          if (spec != null && String(spec).trim().toLowerCase() !== "never") {
            logger.warn(
              `[RETENTION] ${dataset.retentionKey}: admin ${who} has invalid retention "${spec}" — keeping data`,
            );
          }
          continue;
        }
        await runPass({
          dataset,
          cutoff,
          batchSize,
          deadline,
          label: `${dataset.retentionKey}/${dataset.model.modelName}#${who}`,
          ownerFilter: { [dataset.ownerField]: owner },
        });
      }
      await markSwept(admin._id);
    }

    // --- global pass: everyone without overrides. Overriding admins are
    // excluded whatever happened above — including when they were skipped for
    // being disabled, not yet due, or set to keep forever. That exclusion is
    // the point: otherwise the global cutoff silently undoes their settings.
    for (const dataset of DATASETS) {
      const cutoff = retentionCutoff(cfg[dataset.retentionKey]);
      if (!cutoff) continue; // no global retention for this dataset — keep forever

      const excluded = overrides
        .map((a) => (dataset.ownerFrom === "_id" ? a._id : String(a.user_id ?? "")))
        .filter(Boolean);

      await runPass({
        dataset,
        cutoff,
        batchSize: globalBatchSize,
        deadline: globalDeadline,
        label: `${dataset.retentionKey}/${dataset.model.modelName}`,
        ownerFilter: excluded.length
          ? { [dataset.ownerField]: { $nin: excluded } }
          : undefined,
      });
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
