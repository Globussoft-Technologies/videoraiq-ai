/**
 * Delete one admin's Solder Line panel records (solderpanels) in a date range,
 * with each panel's image removed from whichever provider holds it. These are
 * the samples the Solder Line pages chart; a panel with missed joints also had
 * an incident (same image file), removed by delete-incidents-by-date.js.
 *
 *   node scripts/delete-solder-panels-by-date.js --admin rayzonenergies --from 2026-10-21 --to 2026-10-21
 *   node scripts/delete-solder-panels-by-date.js --admin rayzonenergies --from 2026-10-21 --to 2026-10-21 --execute
 *
 * Same options as delete-incidents-by-date.js (--admin, --from, --to, --tz,
 * --execute), plus --camera <channel _id> to limit it to one camera. Matches on
 * the panel's time. Dry run by default; safe to re-run.
 */
import mongoose from "mongoose";
import { arg, finishDeleteScript, runIfMain, startDeleteScript } from "./delete-incidents-by-date.js";

runIfMain(import.meta.url, async () => {
  const { execute, admin, start, end, media } = await startDeleteScript(" [--camera <channel _id>]");
  const { default: SolderPanel } = await import("../core/v2/incidents/solderPanel.model.js");
  const camera = arg("camera");
  if (camera && !mongoose.isValidObjectId(camera)) throw new Error("--camera must be a channel _id");
  const query = {
    userId: String(admin.user_id),
    time: { $gte: start, $lte: end },
    ...(camera ? { channelId: new mongoose.Types.ObjectId(camera) } : {}),
  };
  console.log(`Camera   : ${camera || "all"}`);
  const summary = await SolderPanel.aggregate([
    { $match: query },
    { $group: { _id: { $gt: ["$missedJoints", 0] }, n: { $sum: 1 } } },
  ]);
  const count = (missed) => summary.find((s) => s._id === missed)?.n || 0;
  console.log(`  ${String(count(true)).padStart(6)}  panels with missed joints`);
  console.log(`  ${String(count(false)).padStart(6)}  complete panels`);
  await finishDeleteScript({ Model: SolderPanel, query, media, execute, noun: "panels" });
});
