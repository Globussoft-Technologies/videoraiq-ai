/**
 * Delete one admin's incidents in a date range, with their stored media
 * (images / video) removed from whichever provider holds each file: per-admin
 * v2 storage, Oracle/S3/GCP object storage, or NAS/SFTP. Uses the same
 * helpers as the retention sweeper (utils/mediaCleanup.js).
 *
 *   node scripts/delete-incidents-by-date.js --admin rayzonenergies --from 2026-10-21 --to 2026-10-21
 *   node scripts/delete-incidents-by-date.js --admin rayzonenergies --from 2026-10-21 --to 2026-10-21 --execute
 *
 * Dry run by default: prints what would be deleted. --execute deletes.
 *   --admin    exact login, email, user_id or admin _id (must match one admin)
 *   --from     first day, YYYY-MM-DD, in the admin's timezone (inclusive)
 *   --to       last day, YYYY-MM-DD (inclusive; default --from)
 *   --type     only these incident types, comma separated (e.g. deskSolarShoulderDetection)
 *   --tz       timezone override (default: the admin's, else Asia/Kolkata)
 *
 * Matches on timeOfIncident, the time Incident Center shows. An incident
 * whose media could not be deleted is kept (and listed) so a re-run retries
 * it instead of orphaning the file; a file that is already gone counts as
 * deleted. Safe to re-run. Solder Line panels: delete-solder-panels-by-date.js.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import momentTZ from "moment-timezone";
import { decryptConfig } from "./decrypt.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_SELECT = "_id Image currentImage videoLink timeSeries.Image";
// The server's local copy of viewed media (incidents.service.js cacheDir).
const CACHE_DIR = path.join("/tmp", "media-cache");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** [start, end] of the given local days in `tz`, as UTC instants. */
export const dayRange = (from, to, tz) => {
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("--from/--to must be YYYY-MM-DD");
  if (!momentTZ.tz.zone(tz)) throw new Error(`Unknown timezone ${tz}`);
  const start = momentTZ.tz(from, "YYYY-MM-DD", tz).startOf("day");
  const end = momentTZ.tz(to, "YYYY-MM-DD", tz).endOf("day");
  if (end.isBefore(start)) throw new Error("--to is before --from");
  return { start: start.toDate(), end: end.toDate() };
};

/**
 * Pages through the matching docs by _id. Per doc: delete its media (best
 * effort, provider-aware), then the row, unless a media delete failed.
 */
export async function purgeWithMedia({ Model, query, media, execute, batchSize = 200, log = console.log }) {
  const result = { matched: 0, deleted: 0, mediaFiles: 0, kept: [] };
  let lastId = null;
  for (;;) {
    const docs = await Model.find(lastId ? { ...query, _id: { $gt: lastId } } : query)
      .select(MEDIA_SELECT).sort({ _id: 1 }).limit(batchSize).lean();
    if (!docs.length) break;
    lastId = docs[docs.length - 1]._id;
    result.matched += docs.length;

    const pathsOf = (doc) => media.collectMediaPaths(doc)
      .map(media.toRelativeMediaPath)
      // An external URL (e.g. a video link) isn't ours to delete.
      .filter((p) => typeof p === "string" && p.trim() && !/^https?:\/\//i.test(p));
    const deletable = [];
    for (let i = 0; i < docs.length; i += 5) {
      await Promise.all(docs.slice(i, i + 5).map(async (doc) => {
        const paths = pathsOf(doc);
        result.mediaFiles += paths.length;
        if (!execute) return;
        const failures = paths.length ? await media.deleteMediaBestEffort(paths, `[DELETE-BY-DATE] ${doc._id}`) : 0;
        if (failures) { result.kept.push(String(doc._id)); return; }
        deletable.push(doc._id);
        for (const p of paths) fs.promises.unlink(path.join(CACHE_DIR, path.basename(p))).catch(() => {});
      }));
    }
    if (execute && deletable.length) {
      result.deleted += (await Model.deleteMany({ _id: { $in: deletable } })).deletedCount || 0;
      log(`  deleted ${result.deleted} / ${result.matched} so far`);
    }
    if (docs.length < batchSize) break;
  }
  return result;
}

export const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? null : process.argv[i + 1];
  if (i !== -1 && (!value || value.startsWith("--"))) throw new Error(`--${name} needs a value`);
  return value;
};

function loadConfig() {
  dotenv.config({ path: path.join(serverRoot, ".env") });
  if (process.env.NODE_CONFIG || !process.env.MK) return;
  const file = path.join(serverRoot, "config", `${process.env.NODE_ENV || "development"}.json.enc`);
  try {
    process.env.NODE_CONFIG = JSON.stringify(decryptConfig(process.env.MK, file));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

/**
 * Shared CLI start: reads --admin/--from/--to/--tz, connects with the server's
 * config, finds exactly one admin and prints the header. Returns what a
 * delete script needs.
 */
export async function startDeleteScript(usage) {
  const execute = process.argv.includes("--execute");
  const adminArg = arg("admin");
  const from = arg("from");
  const to = arg("to") || from;
  if (!adminArg || !from) throw new Error(`Usage: --admin <login|email|user_id|_id> --from YYYY-MM-DD [--to YYYY-MM-DD] [--tz Zone]${usage} [--execute]`);

  loadConfig();
  const config = (await import("config")).default;
  await mongoose.connect(config.get("mongodb_uri"));
  const { default: Admin } = await import("../core/v1/admin/admin.model.js");
  const { collectMediaPaths, deleteMediaBestEffort } = await import("../utils/mediaCleanup.js");
  const { toRelativeMediaPath } = await import("../utils/mediaStorage.js");

  // Exact match only: a fuzzy match deleting another admin's data is not recoverable.
  const admins = await Admin.find({
    $or: [
      { login: adminArg }, { email: adminArg }, { user_id: adminArg },
      ...(mongoose.isValidObjectId(adminArg) ? [{ _id: adminArg }] : []),
    ],
  }).select("_id login email user_id timezone").lean();
  if (admins.length !== 1) throw new Error(`--admin ${adminArg} matched ${admins.length} admins; need exactly one`);
  const [admin] = admins;

  const tz = arg("tz") || admin.timezone || "Asia/Kolkata";
  const { start, end } = dayRange(from, to, tz);
  console.log(`Database : ${mongoose.connection.db.databaseName}`);
  console.log(`Admin    : ${admin.login} <${admin.email}> user_id ${admin.user_id}`);
  console.log(`Range    : ${from} to ${to} (${tz}) = ${start.toISOString()} .. ${end.toISOString()}`);
  return {
    execute, admin, start, end,
    media: { collectMediaPaths, deleteMediaBestEffort, toRelativeMediaPath },
  };
}

/** Shared CLI end: runs the purge and prints the outcome. */
export async function finishDeleteScript({ Model, query, media, execute, noun }) {
  console.log(execute ? "\nDeleting..." : "\nDry run: nothing is deleted. Add --execute to delete.");
  const result = await purgeWithMedia({ Model, query, media, execute });
  console.log(`\nMatched ${result.matched} ${noun} with ${result.mediaFiles} media files.`);
  if (execute) {
    console.log(`Deleted ${result.deleted} ${noun} and their media.`);
    if (result.kept.length) {
      console.log(`Kept ${result.kept.length} whose media failed to delete (see warnings above); re-run to retry:`);
      console.log(result.kept.join("\n"));
    }
  }
}

/** Runs main when the file is executed directly (not when imported). */
export function runIfMain(metaUrl, main) {
  if (!process.argv[1] || path.resolve(process.argv[1]) !== fileURLToPath(metaUrl)) return;
  // Exits explicitly: the media layer's SFTP pool and Redis client keep the
  // event loop alive otherwise.
  main()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(error.message);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
}

runIfMain(import.meta.url, async () => {
  const { execute, admin, start, end, media } = await startDeleteScript(" [--type a,b]");
  const { Incident } = await import("../core/v1/incidents/incidents.model.js");
  const types = (arg("type") || "").split(",").map((t) => t.trim()).filter(Boolean);
  const query = {
    userId: String(admin.user_id),
    timeOfIncident: { $gte: start, $lte: end },
    ...(types.length ? { incidentType: { $in: types } } : {}),
  };
  console.log(`Types    : ${types.length ? types.join(", ") : "all"}`);
  const byType = await Incident.aggregate([{ $match: query }, { $group: { _id: "$incidentType", n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  byType.forEach(({ _id, n }) => console.log(`  ${String(n).padStart(6)}  ${_id}`));
  if (!byType.length) console.log("  nothing matches");
  await finishDeleteScript({ Model: Incident, query, media, execute, noun: "incidents" });
});
