import adminModel from "../admin/admin.model.js";
import Channel from "../channels/channels.model.js";
import allocationModel from "./clientDetectionAllocation.model.js";
import { DETECTION_TYPES, TYPE_MAP } from "../../../constants/detectionTypes.js";
import logger from "../../../utils/logger.js";
import pythonService from "../../../services/python.service.js";
import config from "config";

/**
 * Licensing is a CLOUD-ONLY concern.
 *
 * On-premise installs have no superadmin to license anything — the customer
 * owns the box — so every rule here is switched off and the product behaves
 * exactly as it did before this feature: no camera cap, no per-detection cap,
 * every detection visible. The frontend mirrors this with VITE_LOCAL_SETUP.
 *
 * Driven by its own config flag, never by APP_ENV. APP_ENV is overloaded — a
 * dozen call sites branch on it for stream URLs, channel ids, auth and plan
 * checks — so tying licensing to it would couple this feature to unrelated
 * deployment behaviour and make it impossible to turn licensing on or off for
 * one install without side effects.
 *
 * Deliberately strict: `config.get` throws when the key is missing, so a
 * deployment must state its intent. There is no default, because both possible
 * ones are wrong — guessing `true` would impose a licence on an on-premise
 * customer who never bought one, and guessing `false` would silently drop every
 * restriction in cloud. Failing at boot is the honest outcome.
 *
 * The switch lives at the SOURCE rather than at each call site: with licensing
 * off, getAllowedDetectionTypes() reports every detection as allowed, which
 * makes the visibility stripping, the log-page filter, the global-schedule
 * filter and the incident-type filter all no-ops for free. Only the two paths
 * that read Admin.purchasedCameras directly (nvr.service, socket) need to ask.
 */
const LICENSING_ENABLED = Boolean(config.get("LICENSING_ENABLED"));

export const isLicensingEnforced = () => LICENSING_ENABLED;

/**
 * Admin licensing & detection restrictions — the single source of truth for
 * "is this client allowed to run this detection on this camera?".
 *
 * Three independent rules, all configured by the superadmin (server-superadmin
 * writes them, this backend only reads):
 *
 *   1. CAMERA LICENSE      Admin.purchasedCameras caps how many DISTINCT
 *                          cameras may have any detection enabled at once.
 *   2. DETECTION LIMIT     ClientDetectionAllocation.cameraAllocation caps how
 *                          many cameras a single detection type may run on.
 *   3. DETECTION VISIBILITY ClientDetectionAllocation.enabled decides whether a
 *                          detection exists at all for this client — hidden
 *                          from every list, rejected on every write.
 *
 * A camera consumes license only when a detection is ENABLED on it, which is
 * the same definition the superadmin "Configured" stat card uses (the Channel
 * pre-save sets control=1 exactly when some detection is enabled). Linking a
 * detection setting to a camera without enabling it costs nothing, and the
 * number of zones on a camera is irrelevant — only the camera count matters.
 *
 * Unconfigured means DENIED: a client with purchasedCameras = 0 may not enable
 * anything, and a detection with no allocation row (or cameraAllocation = 0) is
 * unavailable. The superadmin must license a client before it can run
 * detections. This is deliberately stricter than the NVR camera-add limit in
 * nvr.service.js / socket.js, where 0 still means "uncapped" — that limit
 * governs how many cameras may be ADDED and is left untouched.
 */

export const LICENSE_ERRORS = {
  NO_CAMERA_LICENSE: "NO_CAMERA_LICENSE",
  DETECTION_NOT_LICENSED: "DETECTION_NOT_LICENSED",
  CAMERA_LICENSE_EXCEEDED: "CAMERA_LICENSE_EXCEEDED",
  DETECTION_CAMERA_LIMIT_REACHED: "DETECTION_CAMERA_LIMIT_REACHED",
};

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || "").trim());

const detectionName = (settingType) => DETECTION_TYPES[settingType] || settingType;

export const CAMERA_LICENSE_MESSAGE =
  "You have exceeded your purchased camera license limit. Please deselect an existing camera to continue.";

// Distinct from CAMERA_LICENSE_MESSAGE: with no licence at all there is nothing
// to deselect, so telling the user to free a camera is a dead end. The only way
// forward is for support to grant a licence.
export const NO_CAMERA_LICENSE_MESSAGE =
  "You do not have any camera license. Please contact support to enable cameras.";

export const detectionLimitMessage = (settingType) =>
  `You have reached the camera limit for ${detectionName(settingType)}. Remove it from another camera to enable it here.`;

export const detectionNotLicensedMessage = (settingType) =>
  `${detectionName(settingType)} is not enabled for your account. Contact your administrator to add it to your plan.`;

/**
 * Resolve the tenant (Admin doc) behind a request. Tokens carry either an
 * adminId (admin login) or only a user_id (member login); channelUserId is the
 * last-resort fallback used by the detection-settings paths that already
 * resolve the tenant from the owning channel.
 */
export const resolveTenant = async ({ adminId, userId, channelUserId } = {}) => {
  if (isMongoObjectId(adminId)) {
    const admin = await adminModel
      .findById(String(adminId))
      .select("_id user_id purchasedCameras")
      .lean();
    if (admin) return admin;
  }

  const resolvedUserId = [userId, channelUserId]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (!resolvedUserId) return null;

  return adminModel
    .findOne({ user_id: resolvedUserId })
    .select("_id user_id purchasedCameras")
    .lean();
};

/**
 * settingType -> cameraAllocation for every detection this client may use.
 * A detection absent from this map is invisible to the client.
 */
export const getAllowedAllocations = async (adminId) => {
  if (!adminId) return new Map();
  const rows = await allocationModel
    .find({ adminId, enabled: true })
    .select("settingType cameraAllocation")
    .lean();
  return new Map(
    rows
      .filter((row) => DETECTION_TYPES[row.settingType])
      .map((row) => [row.settingType, Number(row.cameraAllocation) || 0]),
  );
};

/**
 * The detection types a client may see, as a Set. Resolves the tenant itself so
 * callers can pass a raw token payload. Returns an empty Set when the tenant
 * cannot be resolved or nothing is licensed — callers treat that as "hide all".
 */
export const getAllowedDetectionTypes = async ({ adminId, userId, channelUserId } = {}) => {
  // On-prem: everything is allowed, which turns every downstream filter into a
  // no-op without each one needing its own check.
  if (!isLicensingEnforced()) return new Set(Object.keys(DETECTION_TYPES));

  try {
    const admin = await resolveTenant({ adminId, userId, channelUserId });
    if (!admin?._id) return new Set();
    const allocations = await getAllowedAllocations(admin._id);
    return new Set(allocations.keys());
  } catch (error) {
    logger.error(`detectionLicense getAllowedDetectionTypes: ${error.message}`);
    return new Set();
  }
};

const cameraLabel = (channel) =>
  channel?.customName || channel?.name || String(channel?._id || "");

/**
 * Current consumption for a tenant, computed from the live Channel documents
 * (never from the superadmin's ClientCameraDetection mirror — that collection
 * records what the superadmin set, not what the client is actually running).
 *
 * Returns:
 *   licenseCameras   cameras with at least one detection enabled (license spend)
 *   byType           settingType -> [{ cameraId, name }] currently running it
 */
export const getUsage = async (userId) => {
  const channels = await Channel.find({ userId })
    .select("name customName detections")
    .lean();

  const licenseCameras = [];
  const byType = new Map();

  for (const channel of channels) {
    const cameraId = String(channel._id);
    const name = cameraLabel(channel);
    // Every detection currently on for this camera. The UI needs the whole
    // list: freeing a CAMERA licence slot means switching all of them off,
    // whereas freeing a DETECTION slot only touches the one type.
    const enabledTypes = Object.entries(channel.detections || {})
      .filter(([, detection]) => detection?.enabled === true)
      .map(([settingType]) => settingType);

    for (const settingType of enabledTypes) {
      if (!byType.has(settingType)) byType.set(settingType, []);
      byType.get(settingType).push({ cameraId, name, settingType });
    }

    if (enabledTypes.length) {
      licenseCameras.push({ cameraId, name, detections: enabledTypes });
    }
  }

  return { licenseCameras, byType };
};

/**
 * Full licensing snapshot for a tenant — what the client UI renders and what
 * assertCanEnableDetection decides on.
 */
export const getLicenseState = async ({ adminId, userId, channelUserId } = {}) => {
  const admin = await resolveTenant({ adminId, userId, channelUserId });
  if (!admin?._id) {
    return {
      resolved: false,
      adminId: null,
      userId: null,
      purchasedCameras: 0,
      allocations: new Map(),
      licenseCameras: [],
      byType: new Map(),
    };
  }

  const [allocations, usage] = await Promise.all([
    getAllowedAllocations(admin._id),
    getUsage(admin.user_id),
  ]);

  return {
    resolved: true,
    adminId: String(admin._id),
    userId: admin.user_id,
    purchasedCameras: Number(admin.purchasedCameras) || 0,
    allocations,
    licenseCameras: usage.licenseCameras,
    byType: usage.byType,
  };
};

/**
 * The gate every "turn this detection on for this camera" path calls.
 *
 * Returns { ok: true } or { ok: false, code, message, limit, inUse, cameras },
 * where `cameras` is what the caller must free up — the UI lists them so the
 * user can deselect one and retry, per the requirement.
 *
 * Re-enabling a detection on a camera that already consumes the slot is always
 * allowed: a camera already inside the licensed set costs nothing extra, and a
 * detection already running on that camera is not a new assignment.
 */
export const assertCanEnableDetection = async ({
  adminId,
  userId,
  channelUserId,
  channelId,
  settingType,
  state, // optional pre-fetched getLicenseState result, for batch callers
}) => {
  if (!isLicensingEnforced()) return { ok: true };

  const license = state || (await getLicenseState({ adminId, userId, channelUserId }));
  const targetId = String(channelId || "");

  if (!license.resolved) {
    return {
      ok: false,
      code: LICENSE_ERRORS.DETECTION_NOT_LICENSED,
      message: detectionNotLicensedMessage(settingType),
      limit: 0,
      inUse: 0,
      cameras: [],
    };
  }

  // 0. No camera licence at all. Checked before everything else: whatever else
  // is or is not allocated, a client with zero licensed cameras cannot run any
  // detection anywhere, and there is no camera to free up — so this needs its
  // own "contact support" answer rather than the deselect-a-camera one.
  if (license.purchasedCameras <= 0) {
    return {
      ok: false,
      code: LICENSE_ERRORS.NO_CAMERA_LICENSE,
      message: NO_CAMERA_LICENSE_MESSAGE,
      limit: 0,
      inUse: license.licenseCameras.length,
      cameras: [],
    };
  }

  // 1. Visibility — the detection must be switched on for this client at all.
  if (!license.allocations.has(settingType)) {
    return {
      ok: false,
      code: LICENSE_ERRORS.DETECTION_NOT_LICENSED,
      message: detectionNotLicensedMessage(settingType),
      limit: 0,
      inUse: 0,
      cameras: [],
    };
  }

  // 2. Camera license — distinct cameras running any detection.
  const licenseCameras = license.licenseCameras || [];
  const alreadyLicensed = licenseCameras.some((camera) => camera.cameraId === targetId);
  if (!alreadyLicensed && licenseCameras.length >= license.purchasedCameras) {
    return {
      ok: false,
      code: LICENSE_ERRORS.CAMERA_LICENSE_EXCEEDED,
      message: CAMERA_LICENSE_MESSAGE,
      limit: license.purchasedCameras,
      inUse: licenseCameras.length,
      cameras: licenseCameras,
    };
  }

  // 3. Detection-wise camera limit — cameras running THIS detection.
  const allocation = license.allocations.get(settingType) || 0;
  const camerasForType = license.byType.get(settingType) || [];
  const alreadyRunning = camerasForType.some((camera) => camera.cameraId === targetId);
  if (!alreadyRunning && camerasForType.length >= allocation) {
    return {
      ok: false,
      code: LICENSE_ERRORS.DETECTION_CAMERA_LIMIT_REACHED,
      message: detectionLimitMessage(settingType),
      limit: allocation,
      inUse: camerasForType.length,
      cameras: camerasForType,
    };
  }

  return { ok: true };
};

/**
 * Same gate, for a detection type alone (create / update / attach a detection
 * setting). Only rule 1 applies — linking a setting to a camera without
 * enabling it consumes no license.
 */
export const assertDetectionLicensed = async ({
  adminId,
  userId,
  channelUserId,
  settingType,
}) => {
  if (!isLicensingEnforced()) return { ok: true };

  const allowed = await getAllowedDetectionTypes({ adminId, userId, channelUserId });
  if (allowed.has(settingType)) return { ok: true };
  return {
    ok: false,
    code: LICENSE_ERRORS.DETECTION_NOT_LICENSED,
    message: detectionNotLicensedMessage(settingType),
  };
};

/**
 * Strip every detection the client may not see from a channel's `detections`
 * map. Applied to channel responses so unlicensed detections disappear from the
 * camera-derived lists too (Live Wall badges, engine filters, camera settings),
 * not just from the detection-type dropdowns.
 *
 * Works on plain objects (.lean()) and on hydrated documents alike — callers
 * pass whatever they were already about to send.
 */
export const stripUnlicensedDetections = (channel, allowedTypes) => {
  if (!channel || !allowedTypes) return channel;
  const source = channel.detections;
  if (!source || typeof source !== "object") return channel;

  const detections = typeof source.toObject === "function" ? source.toObject() : source;
  const filtered = {};
  for (const [settingType, value] of Object.entries(detections)) {
    if (allowedTypes.has(settingType)) filtered[settingType] = value;
  }

  if (typeof channel.toObject === "function") {
    const plain = channel.toObject();
    plain.detections = filtered;
    return plain;
  }
  return { ...channel, detections: filtered };
};

/** stripUnlicensedDetections over a list. */
export const stripUnlicensedDetectionsFromList = (channels, allowedTypes) =>
  Array.isArray(channels)
    ? channels.map((channel) => stripUnlicensedDetections(channel, allowedTypes))
    : channels;

/**
 * Stop a detection everywhere it is running for one client, because the
 * superadmin has revoked it.
 *
 * Without this, revoking left an orphan: the allocation said "not licensed", so
 * every read stripped the detection out of the UI — no card, no toggle, no log
 * page — while `Channel.detections.<type>.enabled` stayed true and the CV
 * backend (which reads channels as a `system` caller and is deliberately NOT
 * filtered) kept running the engine and producing incidents. Nobody could stop
 * it: the client had no control left to click, and the superadmin had none
 * either. Revoking now actually revokes.
 *
 * Each camera is saved individually rather than with updateMany, because the
 * Channel pre-save hook is what maintains `control` (1 while any detector is
 * on); a bulk update would bypass it and leave cameras marked running with
 * nothing running on them.
 *
 * Never throws — this is called from a pub/sub handler. A camera whose engine
 * refuses to stop is still flipped off in the database, so the state the UI and
 * the licence read from is correct either way.
 */
export const revokeDetectionEverywhere = async ({ adminId, userId, settingType }) => {
  if (!userId || !settingType) return { stopped: 0, failed: 0 };

  const channels = await Channel.find({
    userId,
    [`detections.${settingType}.enabled`]: true,
  }).populate("nvrId");

  let stopped = 0;
  let failed = 0;

  for (const channel of channels) {
    try {
      // The stop path needs only the camera, its NVR and the detector modes —
      // far less than a start, so no zones/thresholds are looked up here.
      await pythonService.handleDetectionStartStop(
        channel,
        adminId,
        false,
        settingType,
        [],
        [],
        [],
        0,
        undefined,
        {},
        {},
      );
    } catch (err) {
      failed += 1;
      logger.error(
        `[LICENSE] revoke: engine stop failed for channel=${channel._id} ` +
          `detector=${settingType}: ${err.message}`,
      );
    }

    try {
      channel.detections[settingType].enabled = false;
      // Clear any manual override too, or the one-minute schedule runner could
      // read a stale "a human wanted this on" and turn it back on.
      channel.detections[settingType].overrideState = undefined;
      channel.detections[settingType].overrideUntil = undefined;
      await channel.save();
      stopped += 1;
    } catch (err) {
      logger.error(
        `[LICENSE] revoke: could not disable channel=${channel._id} ` +
          `detector=${settingType}: ${err.message}`,
      );
    }
  }

  if (channels.length) {
    logger.info(
      `[LICENSE] revoked ${settingType} for user=${userId} — ` +
        `${stopped} camera(s) stopped, ${failed} engine stop(s) failed`,
    );
  }

  return { stopped, failed, cameras: channels.length };
};

/** DETECTION_TYPES narrowed to what this client may see. */
export const filterDetectionTypes = (allowedTypes) =>
  Object.fromEntries(
    Object.entries(DETECTION_TYPES).filter(([settingType]) => allowedTypes.has(settingType)),
  );

/**
 * The licensed detections as INCIDENT types (`vehicleDetection`) rather than
 * setting types (`vehicleDetectionSettings`). Incidents, alerts and the log
 * pages are all keyed by the short name, so anything filtering those needs this
 * translation rather than the raw allocation keys.
 */
export const allowedIncidentTypes = (allowedTypes) =>
  new Set(
    [...allowedTypes]
      .map((settingType) => TYPE_MAP[settingType])
      .filter(Boolean),
  );

export default {
  isLicensingEnforced,
  LICENSE_ERRORS,
  CAMERA_LICENSE_MESSAGE,
  NO_CAMERA_LICENSE_MESSAGE,
  detectionLimitMessage,
  detectionNotLicensedMessage,
  resolveTenant,
  getAllowedAllocations,
  getAllowedDetectionTypes,
  getUsage,
  getLicenseState,
  assertCanEnableDetection,
  assertDetectionLicensed,
  stripUnlicensedDetections,
  stripUnlicensedDetectionsFromList,
  filterDetectionTypes,
  allowedIncidentTypes,
  revokeDetectionEverywhere,
};
