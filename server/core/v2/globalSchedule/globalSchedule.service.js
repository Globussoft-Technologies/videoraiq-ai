import GlobalSchedule from "./globalSchedule.model.js";
import Channel from "../channels/channels.model.js";
import NVR from "../NVR/nvr.model.js";
import { DETECTION_TYPES, toPopulateDetections } from "../../../constants/detectionTypes.js";
import GlobalScheduleValidation from "./globalSchedule.validation.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import Admin from "../admin/admin.model.js";

/**
 * NVR-level global detection scheduling — CRUD only.
 *
 * This service decides WHAT the schedule is. It never calls the DS APIs and
 * never starts or stops a pipeline: the existing one-minute detection schedule
 * runner picks up saved schedules and drives the transitions, via the shared
 * resolver in services/detectionSchedule.resolver.js. A schedule saved here
 * therefore takes effect on the next runner tick (within a minute) rather than
 * instantly, which is what keeps this feature free of a second scheduler.
 */

const DETECTOR_TYPES = Object.keys(DETECTION_TYPES);

/**
 * Is this detector actually set up ON THIS CAMERA?
 *
 * A link alone (`detections[type].id`) is not enough. Creating or editing a
 * detection setting links it to every selected channel with `enabled: false`,
 * so a camera typically carries links for many detector types it was never
 * actually configured for. Listing those would show almost every detector
 * against every camera.
 *
 * A detector counts as applied when it is either:
 *   - currently enabled on this camera, or
 *   - has zones drawn for THIS camera — settings.referencePoints[cameraId],
 *     which is precisely the `zones` payload sent to DS when starting it.
 *
 * The zones arm matters: a detector that is properly configured but currently
 * stopped (by a schedule, say) must still count as applied, or the camera
 * would wrongly drop out of the schedulable list whenever it is off.
 *
 * Requires channels fetched with `toPopulateDetections` — referencePoints
 * lives on the DetectionSetting document, not on the channel.
 */
const isDetectorApplied = (channel, settingType) => {
  const link = channel?.detections?.[settingType];
  if (!link?.id) return false;
  if (link.enabled === true) return true;

  const referencePoints = link.id?.settings?.referencePoints;
  const zones = referencePoints?.[String(channel._id)];
  return Array.isArray(zones) ? zones.length > 0 : Boolean(zones && Object.keys(zones).length);
};

/** The detector types actually applied to a camera. */
const appliedDetectors = (channel) =>
  DETECTOR_TYPES.filter((settingType) => isDetectorApplied(channel, settingType));

/**
 * A camera is "configured" when at least one detector is actually applied to
 * it. Per the spec, only configured cameras are eligible for global scheduling
 * — scheduling a camera with nothing set up would have nothing to start/stop.
 */
const isConfiguredForDetection = (channel) =>
  DETECTOR_TYPES.some((settingType) => isDetectorApplied(channel, settingType));

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toCameraSummary = (channel) => ({
  channelId: channel._id,
  name: channel.customName || channel.name,
  configuredDetectors: appliedDetectors(channel).map((settingType) => ({
    settingType,
    detectionName: DETECTION_TYPES[settingType],
    // Live detection state, shown for context. Distinct from a camera's
    // enrolment in a global schedule.
    enabled: channel?.detections?.[settingType]?.enabled === true,
  })),
});

/**
 * Ownership check. Everything else in this service depends on it, so it is the
 * first thing every handler does — an admin must never read or write another
 * admin's NVR.
 */
const findOwnedNvr = async (nvrId, userId) =>
  NVR.findOne({ _id: nvrId, userId }).lean();

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || "").trim());

/**
 * The Admin _id this schedule should act as.
 *
 * Prefers the adminId already on the request, then an Admin whose user_id is
 * the caller's. Returns null when neither resolves, which is recorded as-is
 * rather than guessed at.
 */
const resolveScheduleAdminId = async (req, userId) => {
  const fromToken = req?.verified?.userData?.adminId;
  if (isMongoObjectId(fromToken)) return String(fromToken);

  const candidate = String(userId || "").trim();
  if (!candidate) return null;

  try {
    const admin = await Admin.findOne({ user_id: candidate }).select("_id").lean();
    return admin?._id ? String(admin._id) : null;
  } catch (error) {
    logger.error(`[GLOBAL_SCHEDULE] Could not resolve adminId for ${candidate}: ${error?.message}`);
    return null;
  }
};

const findOwnedSchedule = async (id, userId) =>
  GlobalSchedule.findOne({ _id: id, userId });

/**
 * Validate the camera list against the NVR: every enrolled camera must belong
 * to this NVR and be configured for detection. Returns an error message, or
 * null when the list is acceptable.
 */
const validateCameras = async (cameras, nvrId, userId) => {
  if (!cameras?.length) return null;

  const channelIds = cameras.map((camera) => camera.channelId);
  const uniqueIds = new Set(channelIds.map(String));
  if (uniqueIds.size !== channelIds.length) {
    return "cameras contains duplicate channelId entries";
  }

  // Populated so isDetectorApplied can read settings.referencePoints.
  const channels = await Channel.find({
    _id: { $in: channelIds },
    nvrId,
    userId,
  })
    .populate(toPopulateDetections)
    .lean();

  const foundIds = new Set(channels.map((channel) => String(channel._id)));
  const missing = channelIds.filter((id) => !foundIds.has(String(id)));
  if (missing.length) {
    return `Cameras not found on this NVR: ${missing.join(", ")}`;
  }

  // Only enrolled (enabled) cameras must be detection-configured. An
  // un-enrolled row is inert, so it is allowed to reference a camera whose
  // detectors were since removed.
  const enrolledIds = new Set(
    cameras.filter((camera) => camera.enabled !== false).map((camera) => String(camera.channelId)),
  );
  const unconfigured = channels
    .filter((channel) => enrolledIds.has(String(channel._id)) && !isConfiguredForDetection(channel))
    .map((channel) => channel.customName || channel.name || String(channel._id));

  if (unconfigured.length) {
    return `Only cameras configured for detection can be scheduled: ${unconfigured.join(", ")}`;
  }

  return null;
};

class GlobalScheduleService {
  /**
   * Tab 1 of the UI: NVR details plus its cameras split into configured
   * (eligible for global scheduling) and non-configured.
   */
  async getNvrCameras(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;
      const { nvrId } = req.params;
      const search = String(req.query?.search || "").trim();

      const nvr = await findOwnedNvr(nvrId, user_id);
      if (!nvr) {
        return res.status(404).json(Response.userFailResp("NVR not found"));
      }

      const baseFilter = { nvrId, userId: user_id };
      const totalCameraCount = await Channel.countDocuments(baseFilter);
      const channelFilter = { ...baseFilter };
      if (search) {
        const regex = new RegExp(escapeRegex(search), "i");
        channelFilter.$or = [
          { name: regex },
          { customName: regex },
          { channelId: regex },
          { localChannelId: regex },
        ];
      }

      const channels = await Channel.find(channelFilter)
        .populate(toPopulateDetections)
        .lean();

      const configured = [];
      const nonConfigured = [];
      for (const channel of channels) {
        (isConfiguredForDetection(channel) ? configured : nonConfigured).push(
          toCameraSummary(channel),
        );
      }

      // Which of those cameras are already enrolled elsewhere, so the UI can
      // show it rather than letting an admin double-enrol by accident.
      const schedules = await GlobalSchedule.find({ userId: user_id, nvrId }).lean();
      const enrolled = {};
      for (const schedule of schedules) {
        for (const camera of schedule.cameras || []) {
          if (camera?.enabled === false) continue;
          enrolled[String(camera.channelId)] = {
            globalScheduleId: schedule._id,
            name: schedule.name,
            enabled: schedule.enabled,
          };
        }
      }

      return res.status(200).json(
        Response.userSuccessResp("NVR cameras fetched successfully", {
          nvr: {
            _id: nvr._id,
            nvrName: nvr.nvrName,
            brand: nvr.brand,
            location: nvr.location,
            cameraCount: totalCameraCount,
          },
          configuredCameras: configured,
          nonConfiguredCameras: nonConfigured,
          enrolledCameras: enrolled,
        }),
      );
    } catch (error) {
      logger.error("Error fetching NVR cameras for global scheduling:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to fetch NVR cameras", error.message));
    }
  }

  async createGlobalSchedule(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;

      const { error, value } = GlobalScheduleValidation.createValidation(req.body);
      if (error) {
        return res
          .status(400)
          .json(Response.userFailResp("Validation Failed", error.message));
      }

      const nvr = await findOwnedNvr(value.nvrId, user_id);
      if (!nvr) {
        return res.status(404).json(Response.userFailResp("NVR not found"));
      }

      const cameraError = await validateCameras(value.cameras, value.nvrId, user_id);
      if (cameraError) {
        return res.status(400).json(Response.userFailResp("Validation Failed", cameraError));
      }

      const adminId = await resolveScheduleAdminId(req, user_id);
      if (!adminId) {
        logger.error(
          `[GLOBAL_SCHEDULE] No adminId resolved for userId=${user_id} — the runner ` +
            "will not be able to call DS for this schedule",
        );
      }

      const created = await GlobalSchedule.create({ ...value, userId: user_id, adminId });

      logger.info(
        `[GLOBAL_SCHEDULE] Created ${created._id} userId=${user_id} nvrId=${value.nvrId} ` +
          `cameras=${value.cameras.length} detectors=${value.detectors.length || "all"}`,
      );

      return res.status(201).json(
        Response.userSuccessResp("Global schedule created successfully", {
          globalSchedule: created,
        }),
      );
    } catch (error) {
      logger.error("Error creating global schedule:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to create global schedule", error.message));
    }
  }

  async getAllGlobalSchedules(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;
      const { nvrId } = req.query;

      const filter = { userId: user_id };
      if (nvrId) filter.nvrId = nvrId;

      const globalSchedules = await GlobalSchedule.find(filter)
        .populate("nvrId", "nvrName brand location")
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json(
        Response.userSuccessResp("Global schedules fetched successfully", {
          count: globalSchedules.length,
          globalSchedules,
        }),
      );
    } catch (error) {
      logger.error("Error fetching global schedules:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to fetch global schedules", error.message));
    }
  }

  async getGlobalSchedule(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;

      const globalSchedule = await GlobalSchedule.findOne({
        _id: req.params.id,
        userId: user_id,
      })
        .populate("nvrId", "nvrName brand location")
        .lean();

      if (!globalSchedule) {
        return res.status(404).json(Response.userFailResp("Global schedule not found"));
      }

      return res.status(200).json(
        Response.userSuccessResp("Global schedule fetched successfully", {
          globalSchedule,
        }),
      );
    } catch (error) {
      logger.error("Error fetching global schedule:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to fetch global schedule", error.message));
    }
  }

  async updateGlobalSchedule(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;

      const { error, value } = GlobalScheduleValidation.updateValidation(req.body);
      if (error) {
        return res
          .status(400)
          .json(Response.userFailResp("Validation Failed", error.message));
      }

      const globalSchedule = await findOwnedSchedule(req.params.id, user_id);
      if (!globalSchedule) {
        return res.status(404).json(Response.userFailResp("Global schedule not found"));
      }

      if (value.cameras) {
        const cameraError = await validateCameras(
          value.cameras,
          globalSchedule.nvrId,
          user_id,
        );
        if (cameraError) {
          return res.status(400).json(Response.userFailResp("Validation Failed", cameraError));
        }
      }

      for (const field of ["name", "enabled", "schedule", "cameras", "detectors"]) {
        if (value[field] !== undefined) globalSchedule[field] = value[field];
      }
      // Backfill for schedules saved before adminId existed, so an existing
      // schedule starts working again the first time it is edited.
      if (!globalSchedule.adminId) {
        globalSchedule.adminId = await resolveScheduleAdminId(req, user_id);
      }

      globalSchedule.markModified("schedule");
      await globalSchedule.save();

      logger.info(
        `[GLOBAL_SCHEDULE] Updated ${globalSchedule._id} userId=${user_id} ` +
          `fields=${Object.keys(value).join(",")}`,
      );

      return res.status(200).json(
        Response.userSuccessResp("Global schedule updated successfully", {
          globalSchedule,
        }),
      );
    } catch (error) {
      logger.error("Error updating global schedule:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to update global schedule", error.message));
    }
  }

  async deleteGlobalSchedule(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;

      const globalSchedule = await GlobalSchedule.findOneAndDelete({
        _id: req.params.id,
        userId: user_id,
      });

      if (!globalSchedule) {
        return res.status(404).json(Response.userFailResp("Global schedule not found"));
      }

      // Deleting only removes the override. Every camera it covered reverts to
      // its own camera-specific schedule on the next runner tick; nothing is
      // stopped or started here.
      logger.info(
        `[GLOBAL_SCHEDULE] Deleted ${globalSchedule._id} userId=${user_id} ` +
          `nvrId=${globalSchedule.nvrId} — covered cameras revert to camera-specific schedules`,
      );

      return res
        .status(200)
        .json(Response.userSuccessResp("Global schedule deleted successfully"));
    } catch (error) {
      logger.error("Error deleting global schedule:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to delete global schedule", error.message));
    }
  }
}

export default new GlobalScheduleService();
