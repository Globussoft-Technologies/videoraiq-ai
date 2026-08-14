import GlobalSchedule from "../core/v1/globalSchedule/globalSchedule.model.js";
import logger from "../utils/logger.js";

/**
 * Shared detection-schedule resolution.
 *
 * Single source of truth for "which schedule governs this camera's detector,
 * and should it be running right now?". Used by both the v1 one-minute
 * schedule runner and the v1/v2 save-and-apply paths so an immediate save and
 * the next cron tick can never disagree about the desired state.
 *
 * Priority:
 *   1. Global (NVR-level) schedule, when one applies to this camera + detector
 *   2. The camera-specific schedule on channel.detections[settingType].schedule
 *   3. Neither -> undefined, which isScheduleActiveNow treats as "always"
 *      (the pre-existing default; unchanged behaviour)
 *
 * isScheduleActiveNow and its two helpers were moved here verbatim from the v1
 * and v2 detectionSettings services, where they were byte-identical copies.
 */

export const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Kolkata";

export const SCHEDULE_SOURCE = {
  GLOBAL: "global",
  CAMERA: "camera",
  DEFAULT: "default",
};

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const getNowInScheduleTimezone = (timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  return {
    day: getPart("weekday")?.toLowerCase(),
    minutes: Number(getPart("hour")) * 60 + Number(getPart("minute")),
  };
};

/**
 * True when `schedule` says detection should be running at this instant.
 * No schedule, or mode "always", means always on.
 */
export const isScheduleActiveNow = (schedule) => {
  if (!schedule || schedule.mode === "always") return true;
  if (schedule.mode !== "custom") return true;

  const { day, minutes } = getNowInScheduleTimezone(
    schedule.timezone || DEFAULT_SCHEDULE_TIMEZONE,
  );
  const windows = schedule.days?.[day] || [];

  return windows.some(
    (window) =>
      minutes >= timeToMinutes(window.start) &&
      minutes < timeToMinutes(window.end),
  );
};

/** nvrId may arrive populated (a document) or raw (an ObjectId). */
const channelNvrId = (channel) => channel?.nvrId?._id || channel?.nvrId;

const idsMatch = (a, b) => Boolean(a) && Boolean(b) && String(a) === String(b);

/**
 * Does this global schedule govern this camera + detector?
 *
 * All four must hold: the schedule is enabled, it belongs to the camera's NVR,
 * the camera is enrolled (listed with enabled !== false), and the detector is
 * in scope (an empty `detectors` array means every detector).
 *
 * Note `cameras[].enabled` is enrolment, not runtime state — see the model.
 * A camera that is enrolled but currently stopped by its schedule still
 * "applies" here; whether it should be running is decided afterwards by
 * evaluating the resolved schedule.
 */
export const globalScheduleApplies = (globalSchedule, channel, settingType) => {
  if (!globalSchedule || globalSchedule.enabled === false) return false;
  if (!idsMatch(globalSchedule.nvrId, channelNvrId(channel))) return false;

  const entry = (globalSchedule.cameras || []).find((camera) =>
    idsMatch(camera?.channelId, channel?._id),
  );
  if (!entry || entry.enabled === false) return false;

  const detectors = globalSchedule.detectors || [];
  if (detectors.length && !detectors.includes(settingType)) return false;

  return true;
};

/**
 * Deterministic winner when several global schedules cover the same camera and
 * detector: the detector-scoped one beats the catch-all, then most recently
 * updated. Without this the winner would depend on document order.
 */
const pickMostSpecific = (matches) =>
  matches.slice().sort((a, b) => {
    const aScoped = (a.detectors?.length || 0) > 0 ? 1 : 0;
    const bScoped = (b.detectors?.length || 0) > 0 ? 1 : 0;
    if (aScoped !== bScoped) return bScoped - aScoped;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  })[0];

/**
 * Wrap already-loaded global schedule documents in a lookup.
 *
 * Kept separate from buildGlobalScheduleIndex so the runner can load once per
 * tick and reuse across every camera, and so tests can build one without a DB.
 */
export const createGlobalScheduleIndex = (documents = []) => {
  const schedules = (Array.isArray(documents) ? documents : []).filter(
    (doc) => doc && doc.enabled !== false,
  );

  const channelIds = new Set();
  for (const schedule of schedules) {
    for (const camera of schedule.cameras || []) {
      if (camera?.channelId && camera.enabled !== false) {
        channelIds.add(String(camera.channelId));
      }
    }
  }

  return {
    size: schedules.length,
    // Every channel covered by some enabled schedule. The runner uses this to
    // widen its candidate query beyond cameras with their own custom schedule.
    channelIds: [...channelIds],
    find(channel, settingType) {
      const matches = schedules.filter((schedule) =>
        globalScheduleApplies(schedule, channel, settingType),
      );
      return matches.length ? pickMostSpecific(matches) : null;
    },
  };
};

/**
 * Load enabled global schedules and return a lookup over them.
 *
 * Fails safe: if the query throws, the index comes back empty, so every camera
 * falls back to its camera-specific schedule (existing behaviour) rather than
 * the runner dying or flipping cameras on a partial read.
 */
export const buildGlobalScheduleIndex = async (filter = {}) => {
  try {
    const query = { enabled: true };
    if (filter.userId) query.userId = filter.userId;
    if (filter.nvrId) query.nvrId = filter.nvrId;

    const documents = await GlobalSchedule.find(query).lean();
    return createGlobalScheduleIndex(documents);
  } catch (error) {
    logger.error(
      `[GLOBAL_SCHEDULE] Failed to load global schedules, falling back to camera-specific schedules: ${error?.message}`,
    );
    return createGlobalScheduleIndex([]);
  }
};

/**
 * Apply the priority rule. Pure — takes schedules, not a database.
 *
 * `globalSchedule` may be a GlobalSchedule document (its `.schedule` is used)
 * or a bare {mode, timezone, days} object.
 */
export const resolveEffectiveSchedule = ({
  globalSchedule,
  cameraSchedule,
} = {}) => {
  const global = globalSchedule?.schedule || (globalSchedule?.mode ? globalSchedule : null);

  if (global) {
    return { schedule: global, source: SCHEDULE_SOURCE.GLOBAL };
  }
  if (cameraSchedule) {
    return { schedule: cameraSchedule, source: SCHEDULE_SOURCE.CAMERA };
  }
  return { schedule: undefined, source: SCHEDULE_SOURCE.DEFAULT };
};

/**
 * The call-site entry point: resolve the effective schedule for one camera +
 * detector and evaluate it against the current time.
 *
 * Pass `index` (from buildGlobalScheduleIndex) when resolving many cameras in a
 * loop; without it this issues one scoped query for the camera's own NVR.
 *
 * Returns { active, schedule, source }.
 */
export const resolveDesiredDetectionState = async (
  channel,
  settingType,
  { index } = {},
) => {
  const cameraSchedule = channel?.detections?.[settingType]?.schedule;

  const globalIndex =
    index ||
    (await buildGlobalScheduleIndex({
      userId: channel?.userId,
      nvrId: channelNvrId(channel),
    }));

  const globalSchedule = globalIndex.find(channel, settingType);
  const { schedule, source } = resolveEffectiveSchedule({
    globalSchedule,
    cameraSchedule,
  });

  return { active: isScheduleActiveNow(schedule), schedule, source };
};
