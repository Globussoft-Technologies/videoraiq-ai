import GlobalSchedule from "../core/v1/globalSchedule/globalSchedule.model.js";
import { DETECTION_TYPES } from "../constants/detectionTypes.js";
import logger from "../utils/logger.js";
import {
  isValidTimezone,
  isWithinScheduleDays,
  nextScheduleBoundary,
} from "../utils/scheduleWindows.js";

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
 * isScheduleActiveNow and its helpers were moved here from the v1 and v2
 * detectionSettings services, where they were byte-identical copies. Window
 * coverage now lives one level further down in utils/scheduleWindows.js, shared
 * with the Joi validators so a schedule can never validate under one rule and
 * be evaluated under another.
 */

export const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Kolkata";

export const SCHEDULE_SOURCE = {
  GLOBAL: "global",
  CAMERA: "camera",
  DEFAULT: "default",
  // A live manual override outranks every schedule until it lapses.
  OVERRIDE: "override",
};

/**
 * Project this instant into the schedule's zone and read off the local weekday
 * and minute-of-day. Intl does the IANA lookup, so DST transitions are handled
 * by the runtime rather than by an offset we would have to maintain.
 *
 * A zone the runtime rejects would otherwise throw a RangeError out of the
 * one-minute runner and abort the whole tick for every camera. Rows predating
 * timezone validation can still hold one, so fall back to the default and say
 * so rather than taking the sweep down.
 */
const getNowInScheduleTimezone = (timezone) => {
  let zone = timezone;
  if (!isValidTimezone(zone)) {
    logger.error(
      `[DETECTION_SCHEDULE] Unusable schedule timezone "${timezone}" - ` +
        `falling back to ${DEFAULT_SCHEDULE_TIMEZONE}`,
    );
    zone = DEFAULT_SCHEDULE_TIMEZONE;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
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
 *
 * Coverage is delegated to isWithinScheduleDays, which reads the day's own
 * windows AND the previous day's overnight windows. That second half is what
 * makes "Monday 22:00 -> 08:00" stay on through Tuesday 07:59: the minutes
 * after midnight belong to Tuesday's timeline but were configured on Monday.
 * Normal windows evaluate exactly as they always did.
 */
export const isScheduleActiveNow = (schedule) => {
  if (!schedule || schedule.mode === "always") return true;
  if (schedule.mode !== "custom") return true;

  const { day, minutes } = getNowInScheduleTimezone(
    schedule.timezone || DEFAULT_SCHEDULE_TIMEZONE,
  );

  return isWithinScheduleDays(schedule.days, day, minutes);
};

/**
 * Is a manual override still in force?
 *
 * Absent fields (every document predating the feature) and a lapsed
 * overrideUntil both read as "no" — so the schedule governs exactly as it did
 * before, with no migration.
 */
export const isManualOverrideActive = (detection, now = new Date()) => {
  const until = detection?.overrideUntil;
  if (!until) return false;
  const expiry = new Date(until).getTime();
  return Number.isFinite(expiry) && expiry > now.getTime();
};

/**
 * The override to persist when someone toggles a detector by hand.
 *
 * Only a toggle that CONTRADICTS the governing schedule is worth remembering;
 * agreeing with it needs no override and clears any stale one. The expiry is
 * the moment the schedule would next have flipped the state on its own, so the
 * override lasts exactly one window and then hands control back — nobody has
 * to remember to undo it.
 *
 * Returns undefined for both fields when no override applies, which is also
 * how a caller clears one.
 */
export const manualOverrideFor = (schedule, enable, now = new Date()) => {
  // null, not undefined: assigning undefined to a Mongoose path is not a
  // reliable unset, so clearing has to write an explicit empty value.
  const none = { overrideState: null, overrideUntil: null };

  // No schedule governs this detector, so the toggle already sticks: the
  // runner skips detectors nothing schedules.
  if (!schedule) return none;
  if (isScheduleActiveNow(schedule) === enable) return none;

  const until = nextScheduleBoundary(schedule, now);
  // A schedule with no boundary inside a week (always-on, or empty) gives the
  // override nothing to expire against; leave the schedule in charge rather
  // than granting an unbounded one.
  if (!until) return none;

  return { overrideState: enable, overrideUntil: until };
};

/**
 * Is it safe to move this whole camera with one bulk DS call?
 *
 * The bulk endpoints (/stream/stop-all, /stream/resume-all) take camera ids
 * and act on EVERY detector on the camera — the payload carries no detector
 * scope at all. So batching a camera is only correct when every detector
 * configured on it is meant to end up in the state the batch is moving to.
 *
 * Otherwise stopping one detector at its schedule close would also stop the
 * others, minutes or hours before their own close times, and only the
 * detector that triggered the batch would have its stored `enabled` updated
 * — leaving the rest marked running while their pipelines are dead, which
 * the runner then never corrects because stored and desired already agree.
 *
 * `targetStates` is the state each configured detector should be in after
 * this tick: its resolved schedule verdict when something governs it, or
 * its current state when nothing does (an ungoverned detector must be left
 * exactly as it is).
 */
/**
 * Where every configured detector on this camera should end up right now.
 *
 * Feeds cameraCanBulkToggle. A detector nothing schedules contributes its
 * CURRENT state, because nothing is entitled to move it — that is what stops
 * a bulk call sweeping an untouched detector along with the one whose window
 * just closed.
 *
 * Builds the global index once and reuses it across detectors, so this costs
 * one query rather than one per detector. Pass `index` when the caller
 * already has one (the schedule runner does).
 */
export const cameraDetectorTargetStates = async (channel, { index } = {}) => {
  const detections = channel?.detections || {};

  const globalIndex =
    index ||
    (await buildGlobalScheduleIndex({
      userId: channel?.userId,
      nvrId: channelNvrId(channel),
    }));

  const states = [];
  for (const settingType of Object.keys(DETECTION_TYPES)) {
    const entry = detections[settingType];
    if (!entry?.id) continue; // not configured on this camera

    const governed =
      Boolean(entry?.schedule) || Boolean(globalIndex.find(channel, settingType));
    if (!governed) {
      states.push(entry?.enabled === true);
      continue;
    }

    const desired = await resolveDesiredDetectionState(channel, settingType, {
      index: globalIndex,
    });
    states.push(desired.active);
  }

  return states;
};

export const cameraCanBulkToggle = (targetStates = [], operation) => {
  if (!Array.isArray(targetStates) || targetStates.length === 0) return false;

  // RESUME IS NEVER BATCHED.
  //
  // /stream/resume-all carries only { admin_id, camera_id } — no stream url,
  // no detectors, no zones or thresholds. It can only un-pause a pipeline DS
  // already holds, so a detector DS has never been told about (first start
  // after configuration, or after a DS restart) comes back "resumed" while
  // nothing actually runs: enabled=true in our DB, no detections firing.
  //
  // Starting therefore always goes through the per-detector POST /stream,
  // which sends the full configuration and is idempotent. Stopping needs no
  // configuration, so it still batches.
  if (operation !== "stop") return false;

  return targetStates.every((state) => state === false);
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

  // A live manual override outranks the schedule. `schedule` is still
  // returned so callers can show what will resume, and so the toggle path can
  // ask the schedule's own verdict without the override answering for it.
  const detection = channel?.detections?.[settingType];
  if (isManualOverrideActive(detection)) {
    return {
      active: detection.overrideState === true,
      schedule,
      source: SCHEDULE_SOURCE.OVERRIDE,
      overrideUntil: detection.overrideUntil,
    };
  }

  return { active: isScheduleActiveNow(schedule), schedule, source };
};
