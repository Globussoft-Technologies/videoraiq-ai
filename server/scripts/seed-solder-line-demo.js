/**
 * Dummy Solder Line (deskSolarShoulderDetection) data for one admin, so the
 * Solar Line QC pages have something to show before DS sends real events.
 *
 *   node scripts/seed-solder-line-demo.js --admin harish              # dry run
 *   node scripts/seed-solder-line-demo.js --admin harish --execute    # insert
 *   node scripts/seed-solder-line-demo.js --admin harish --remove     # delete it again
 *   ... --remove --remove-allocation                                  # also drop the licence row
 *
 * --admin matches the admin's email, login or first name (case-insensitive).
 * Everything inserted is marked so --remove deletes only this data:
 *   absence incidents: eventId starts with "demo-solder-"
 *   panel samples and panel incidents: panelId starts with "DEMO-"
 * Panels follow DS's "Solar panel processing" payload (zones → presence_time,
 * shoulderings_done); a panel with a short zone is also a "panel" incident.
 * --remove also clears demo rows from the previous (missedSolder) format.
 * Incidents are inserted directly, so no alert / email / Telegram / push fires,
 * and no camera's detection settings are touched (nothing is sent to DS).
 * The licence row (DetectionAllocation) is created only if missing, and only
 * removed with --remove-allocation.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { decryptConfig } from "./decrypt.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const SETTING = "deskSolarShoulderDetectionSettings";
const EVENT_PREFIX = "demo-solder-";
const PANEL_PREFIX = "DEMO-";
const ZONES = ["worker_zone_left", "worker_zone_right"]; // DS zone names; P1–P3 left, P4–P6 right
const SHIFT = [6, 14]; // 06:00–14:00 in the admin's timezone

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => args[args.indexOf(name) + 1];

// Deterministic pseudo-random so a re-seed after --remove looks the same.
const rng = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function loadConfig() {
  if (process.env.NODE_CONFIG || !process.env.MK) return;
  const file = path.join(serverRoot, "config", `${process.env.NODE_ENV || "development"}.json.enc`);
  try {
    process.env.NODE_CONFIG = JSON.stringify(decryptConfig(process.env.MK, file));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function buildDay({ admin, channels, images, day, now, tz, moment, isToday }) {
  const incidents = [];
  const panels = [];
  const start = moment.tz(day, tz).hour(SHIFT[0]).startOf("hour");
  const end = isToday ? moment.min(now, moment.tz(day, tz).hour(SHIFT[1]).startOf("hour")) : moment.tz(day, tz).hour(SHIFT[1]).startOf("hour");
  if (!end.isAfter(start)) return { incidents, panels };

  channels.forEach((channel, ci) => {
    const r = rng(Number(day.replace(/-/g, "")) * 7 + ci * 131);
    const base = {
      userId: String(admin.user_id),
      nvrId: channel.nvrId,
      channelId: channel._id,
      cameraId: String(channel._id),
      triggerNotification: false,
    };
    const image = images.get(String(channel._id)) || null;
    const tag = `${day.replace(/-/g, "")}-${ci + 1}`;

    // Panels: ~38–47 an hour, built as DS's "Solar panel processing" payload
    // (zones → presence_time, shoulderings_done of 3), then stored the way
    // incidents/create stores it: every panel a SolderPanel sample, and a
    // panel with a short zone also an incident (eventType "panel").
    let panelNo = 0;
    for (let h = start.clone(); h.isBefore(end); h.add(1, "hour")) {
      const perHour = 38 + Math.floor(r() * 10);
      for (let k = 0; k < perHour; k += 1) {
        const time = h.clone().add(Math.floor(((k + r()) * 3600) / perHour), "seconds");
        if (!time.isBefore(end)) break;
        panelNo += 1;
        const panelId = `${PANEL_PREFIX}${tag}-${String(panelNo).padStart(4, "0")}`;
        const dsZones = Object.fromEntries(ZONES.map((zone, zi) => [zone, {
          presence_time: +((zi ? 13.2 : 12.4) + (r() - 0.5) * 3).toFixed(1),
          shoulderings_done: r() < 0.015 ? 3 - (1 + Math.floor(r() * 2)) : 3,
        }]));
        const zones = Object.entries(dsZones).map(([zone, z]) => ({ zone, presenceSec: z.presence_time, done: z.shoulderings_done }));
        const missedJoints = zones.reduce((sum, z) => sum + Math.max(0, 3 - z.done), 0);
        panels.push({ userId: base.userId, channelId: channel._id, panelId, time: time.toDate(), zones });
        if (missedJoints) {
          incidents.push({
            ...base,
            eventType: "panel",
            incidentName: "Solar panel processing",
            panelId,
            zones,
            missedJoints,
            timeOfIncident: time.toDate(),
            severity: "high",
            Image: image,
            description: `${missedJoints} solder joint${missedJoints === 1 ? "" : "s"} missed on ${panelId}`,
          });
        }
      }
    }

    // Absences: 5–8 a day, 1–7 minutes each; today's last one on the first
    // camera is left open (operator still away).
    const spanMin = end.diff(start, "minutes");
    const count = 5 + Math.floor(r() * 4);
    for (let k = 0; k < count; k += 1) {
      const zi = r() < 0.5 ? 0 : 1;
      const at = start.clone().add(Math.floor(((k + 0.2 + r() * 0.6) * spanMin) / count), "minutes");
      const durationSec = 60 + Math.floor(r() * r() * 360);
      const open = isToday && ci === 0 && k === count - 1;
      if (!at.isBefore(end)) continue;
      incidents.push({
        ...base,
        eventType: "absence",
        eventId: `${EVENT_PREFIX}abs-${tag}-${k + 1}`,
        incidentName: "Desk Empty",
        zone: ZONES[zi],
        personCount: 0,
        capacity: 1,
        thresholdSec: 30,
        durationSec: open ? 30 : durationSec,
        returnedAt: open ? null : at.clone().add(durationSec, "seconds").toDate(),
        timeOfIncident: at.toDate(),
        severity: "moderate",
        Image: image,
        description: `${ZONES[1 - zi]} working · ${ZONES[zi]} desk empty`,
      });
    }
  });
  return { incidents, panels };
}

async function main() {
  const who = opt("--admin");
  if (!who || who.startsWith("--")) throw new Error("Pass --admin <email | login | first name>");

  loadConfig();
  const config = (await import("config")).default;
  const moment = (await import("moment-timezone")).default;
  await mongoose.connect(config.get("mongodb_uri"));

  const { default: Admin } = await import("../core/v1/admin/admin.model.js");
  const { default: Channel } = await import("../core/v1/channels/channels.model.js");
  const { default: Allocation } = await import("../core/v1/clientConfig/clientDetectionAllocation.model.js");
  const { Incident, DeskSolarShoulderDetectionIncident } = await import("../core/v1/incidents/incidents.model.js");
  const { default: SolderPanel } = await import("../core/v2/incidents/solderPanel.model.js");

  const rx = new RegExp(who.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const admins = await Admin.find({ $or: [{ email: rx }, { login: rx }, { name_f: rx }] }).select("user_id email login name_f name_l timezone").lean();
  if (admins.length !== 1) {
    console.log(`--admin "${who}" matched ${admins.length} admins:`);
    admins.forEach((a) => console.log(`  ${a._id}  ${a.name_f || ""} ${a.name_l || ""}  ${a.email || a.login}`));
    throw new Error("Narrow --admin to exactly one (use the full email).");
  }
  const admin = admins[0];
  const userId = String(admin.user_id);
  console.log(`Admin: ${admin.name_f || ""} ${admin.name_l || ""} <${admin.email || admin.login}> (user_id ${userId})`);

  if (flag("--remove")) {
    const inc = await DeskSolarShoulderDetectionIncident.deleteMany({ userId, $or: [{ eventId: { $regex: `^${EVENT_PREFIX}` } }, { panelId: { $regex: `^${PANEL_PREFIX}` } }] });
    const pan = await SolderPanel.deleteMany({ userId, panelId: { $regex: `^${PANEL_PREFIX}` } });
    console.log(`Removed ${inc.deletedCount} demo incidents and ${pan.deletedCount} demo panels.`);
    if (flag("--remove-allocation")) {
      const al = await Allocation.deleteOne({ adminId: admin._id, settingType: SETTING });
      console.log(`Removed ${al.deletedCount} licence row for ${SETTING}.`);
    }
    return;
  }

  const channels = await Channel.find({ userId, isAdded: true }).sort({ createdAt: 1 }).limit(Number(opt("--cameras")) || 3).select("name customName nvrId").lean();
  if (!channels.length) throw new Error("This admin has no added cameras to attach the demo data to.");

  // Reuse a real snapshot from each camera so the logs show pictures.
  const images = new Map();
  for (const ch of channels) {
    const withImage = await Incident.findOne({ channelId: ch._id, Image: { $nin: [null, ""] } }).sort({ timeOfIncident: -1 }).select("Image").lean();
    if (withImage) images.set(String(ch._id), withImage.Image);
  }

  const tz = admin.timezone || "Asia/Kolkata";
  const now = moment.tz(tz);
  const days = [now.clone().subtract(1, "day").format("YYYY-MM-DD"), now.format("YYYY-MM-DD")];
  const data = days.map((day) => buildDay({ admin, channels, images, day, now, tz, moment, isToday: day === days[1] }));
  const incidents = data.flatMap((d) => d.incidents);
  const panels = data.flatMap((d) => d.panels);

  console.log(`Cameras: ${channels.map((c) => c.customName || c.name).join(", ")}`);
  console.log(`Days: ${days.join(", ")} (${tz}, shift ${SHIFT[0]}:00–${SHIFT[1]}:00)`);
  console.log(`Would insert ${incidents.filter((i) => i.eventType === "absence").length} absences, ${incidents.filter((i) => i.eventType === "panel").length} panels with missed joints (incidents), ${panels.length} panels.`);

  const existing = await Allocation.findOne({ adminId: admin._id, settingType: SETTING }).lean();
  console.log(existing ? `Licence row already exists (enabled: ${existing.enabled}).` : "Would create the licence row so the Solar Line QC pages show.");

  if (!flag("--execute")) {
    console.log("Dry run only. Re-run with --execute to insert.");
    return;
  }

  const already = await DeskSolarShoulderDetectionIncident.countDocuments({ userId, $or: [{ eventId: { $regex: `^${EVENT_PREFIX}` } }, { panelId: { $regex: `^${PANEL_PREFIX}` } }] })
    + await SolderPanel.countDocuments({ userId, panelId: { $regex: `^${PANEL_PREFIX}` } });
  if (already) throw new Error(`Demo data already present (${already} rows). Run --remove first.`);

  await DeskSolarShoulderDetectionIncident.insertMany(incidents);
  await SolderPanel.insertMany(panels);
  if (!existing) await Allocation.create({ adminId: admin._id, settingType: SETTING, enabled: true, cameraAllocation: channels.length });
  else if (!existing.enabled) await Allocation.updateOne({ _id: existing._id }, { $set: { enabled: true } });
  console.log("Inserted. Open /solder-line (refresh the browser so the sidebar picks up the licence).");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
