/**
 * Detection schedule diagnostic — READ ONLY.
 *
 * Answers "is this camera supposed to be on right now, does our DB agree, and
 * does DS agree?" in one pass. Makes no writes and never starts or stops a
 * pipeline: Mongo reads plus GET requests to the DS status endpoints.
 *
 * There are three places the truth can live, and drift between them is the
 * failure mode that silently breaks scheduling:
 *
 *   SHOULD  what the effective schedule says right now (global beats camera)
 *   DB      channel.detections[type].enabled — what the scheduler believes.
 *           This is what makes it idempotent, so a wrong value here means the
 *           scheduler stops calling DS and the camera stays stuck.
 *   DS      the pipeline's actual state, from the DS status endpoint.
 *
 * SHOULD vs DB disagreeing is normal for up to a minute (the runner ticks every
 * 60s). Still disagreeing after that, or DB vs DS disagreeing at all, is a bug.
 *
 * Usage:
 *   node scripts/check-detection-schedule.js --nvr <nvrId>
 *   node scripts/check-detection-schedule.js --admin <userId>
 *   node scripts/check-detection-schedule.js --nvr <nvrId> --skip-ds
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const { default: Channel } = await import("../core/v1/channels/channels.model.js");
const { default: NVR } = await import("../core/v1/NVR/nvr.model.js");
const { default: GlobalSchedule } = await import(
  "../core/v1/globalSchedule/globalSchedule.model.js"
);
const { DETECTION_TYPES, toPopulateDetections } = await import(
  "../constants/detectionTypes.js"
);
const {
  createGlobalScheduleIndex,
  resolveEffectiveSchedule,
  isScheduleActiveNow,
} = await import("../services/detectionSchedule.resolver.js");
const { resolveAdminEndpoints } = await import("../utils/adminEndpoints.js");

const DETECTOR_TYPES = Object.keys(DETECTION_TYPES);

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const options = { nvrId: null, adminId: null, skipDs: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--nvr") options.nvrId = argv[i + 1];
    if (argv[i] === "--admin") options.adminId = argv[i + 1];
    if (argv[i] === "--skip-ds") options.skipDs = true;
  }
  return options;
};

/** Same rule the API uses: enabled, or zones drawn for THIS camera. */
const isDetectorApplied = (channel, settingType) => {
  const link = channel?.detections?.[settingType];
  if (!link?.id) return false;
  if (link.enabled === true) return true;
  const zones = link.id?.settings?.referencePoints?.[String(channel._id)];
  return Array.isArray(zones) ? zones.length > 0 : Boolean(zones && Object.keys(zones).length);
};

/** DS object-detection truth for one camera. null = could not determine. */
const fetchDsState = async (detectionUrl, cameraId) => {
  try {
    const res = await axios.get(`${detectionUrl}/stream/${cameraId}/status`, { timeout: 8000 });
    const data = res.data || {};
    const running = data.running ?? data.is_running ?? data.active ?? data.status;
    if (typeof running === "boolean") return { running, raw: data };
    if (typeof running === "string") return { running: /run|active|ok|start/i.test(running), raw: data };
    return { running: null, raw: data };
  } catch (error) {
    // 404 from the status endpoint means "no pipeline for this camera", which
    // is a real answer: not running.
    if (error?.response?.status === 404) return { running: false, raw: "404 no pipeline" };
    return { running: null, raw: error?.response?.data || error.message };
  }
};

const main = async () => {
  const { nvrId, adminId, skipDs } = parseArgs();
  if (!nvrId && !adminId) {
    console.error("Usage: node scripts/check-detection-schedule.js --nvr <nvrId> | --admin <userId>");
    process.exit(1);
  }

  const MONGODB_URI = process.env.MONGODB_URI || process.env.mongoURI || process.env.mongodb_uri;
  if (!MONGODB_URI) {
    console.error("No Mongo URI in env (MONGODB_URI / mongoURI / mongodb_uri).");
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);

  const channelFilter = {};
  if (nvrId) channelFilter.nvrId = nvrId;
  if (adminId) channelFilter.userId = String(adminId);

  const channels = await Channel.find(channelFilter)
    .populate(toPopulateDetections)
    .lean();

  if (!channels.length) {
    console.log("No cameras matched. Check the id, and note cameras need isAdded:true.");
    await mongoose.disconnect();
    return;
  }

  const ownerId = String(adminId || channels[0].userId);
  const scheduleFilter = { enabled: true, userId: ownerId };
  if (nvrId) scheduleFilter.nvrId = nvrId;
  const globalSchedules = await GlobalSchedule.find(scheduleFilter).lean();
  const index = createGlobalScheduleIndex(globalSchedules);

  const { detectionUrl } = await resolveAdminEndpoints(ownerId);

  const nvr = nvrId ? await NVR.findById(nvrId).lean() : null;

  console.log("");
  console.log("═".repeat(78));
  console.log(`  Detection schedule check — ${new Date().toISOString()}`);
  if (nvr) console.log(`  NVR: ${nvr.nvrName} (${nvrId})`);
  console.log(`  Admin/userId: ${ownerId}`);
  console.log(`  Global schedules active: ${globalSchedules.length}`);
  console.log(`  DS detectionUrl: ${detectionUrl}${skipDs ? "  (skipped)" : ""}`);
  console.log("═".repeat(78));

  const mismatches = [];
  let appliedTotal = 0;

  for (const channel of channels) {
    const applied = DETECTOR_TYPES.filter((type) => isDetectorApplied(channel, type));
    const cameraName = channel.customName || channel.name;

    if (!applied.length) {
      console.log(`\n  ○ ${cameraName}  —  no detections applied (not schedulable)`);
      continue;
    }

    const dsState = skipDs ? { running: null, raw: "skipped" } : await fetchDsState(detectionUrl, String(channel._id));

    console.log(`\n  ● ${cameraName}   [${channel._id}]`);
    console.log(`      DS pipeline: ${dsState.running === null ? "UNKNOWN" : dsState.running ? "RUNNING" : "stopped"}`);

    for (const settingType of applied) {
      const globalSchedule = index.find(channel, settingType);
      const cameraSchedule = channel?.detections?.[settingType]?.schedule;
      const { schedule, source } = resolveEffectiveSchedule({ globalSchedule, cameraSchedule });

      const should = isScheduleActiveNow(schedule);
      const db = channel?.detections?.[settingType]?.enabled === true;
      appliedTotal += 1;

      const agree = should === db;
      const marker = agree ? "  " : "!!";
      const tz = schedule?.timezone || "-";
      const mode = schedule?.mode || "always(default)";

      console.log(
        `   ${marker} ${DETECTION_TYPES[settingType]}\n` +
          `        schedule=${source} mode=${mode} tz=${tz}\n` +
          `        SHOULD=${should ? "RUNNING" : "stopped"}   DB=${db ? "RUNNING" : "stopped"}` +
          (dsState.running === null ? "" : `   DS=${dsState.running ? "RUNNING" : "stopped"}`),
      );

      if (!agree) {
        mismatches.push({
          camera: cameraName,
          detector: DETECTION_TYPES[settingType],
          kind: "SHOULD vs DB",
          detail: `should=${should} db=${db} (source=${source})`,
        });
      }
      if (dsState.running !== null && db !== dsState.running) {
        mismatches.push({
          camera: cameraName,
          detector: DETECTION_TYPES[settingType],
          kind: "DB vs DS",
          detail: `db=${db} ds=${dsState.running}`,
        });
      }
    }
  }

  console.log("");
  console.log("─".repeat(78));
  console.log(`  ${channels.length} camera(s), ${appliedTotal} applied detector(s)`);

  if (!mismatches.length) {
    console.log("  ✓ SHOULD, DB and DS all agree.");
  } else {
    console.log(`  ${mismatches.length} mismatch(es):`);
    for (const m of mismatches) {
      console.log(`    - [${m.kind}] ${m.camera} / ${m.detector}: ${m.detail}`);
    }
    console.log("");
    console.log("  SHOULD vs DB  → normal for <1 min after a change (runner ticks every 60s).");
    console.log("                  Persisting means the runner is not reaching this camera:");
    console.log("                  check it is running, and grep the logs for this cameraId.");
    console.log("  DB vs DS      → our belief is wrong, so the runner will stay idempotent and");
    console.log("                  never correct it. Check for DS request FAILED lines.");
  }
  console.log("─".repeat(78));
  console.log("");

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Diagnostic failed:", error?.message || error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
