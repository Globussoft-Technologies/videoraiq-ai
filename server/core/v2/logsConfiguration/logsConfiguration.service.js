import logsConfigModel from "./logsConfiguration.model.js";
import adminModel from "../admin/admin.model.js";
import channelsModel from "../channels/channels.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { sendPayloadToUser } from "../../../socket.js";
import { getAllowedDetectionTypes } from "../clientConfig/detectionLicense.service.js";

// Map detection field names to log types
const DETECTION_TO_LOGS_MAP = {
  countPersonsSettings: "personCountLogs",
  countVehiclesSettings: "vehicleCountLogs",
  deskAbsenceSettings: "deskAbsenceLogs",
  guardAbsenceSettings: "guardLogs",
  conveyorDetectionSettings: "conveyorLogs",
  crusherDetectionSettings: "crusherLogs",
  waterSpillageDetectionSettings: "waterSpillLogs",
  lineCrossingSettings: "lineCrossingLogs",
  vehicleObstructionSettings: "vehicleObstructionLogs",
  carModelDetectionSettings: "carLogs",
  unauthorizedAccessSettings: "unauthorizedAccessLogs",
  genericObjectDetectionSettings: "detectedUsers",
  vehicleDetectionSettings: "detectedUsers",
};

/**
 * Which detections each log page is built from. A page stays visible while ANY
 * of its detections is licensed.
 *
 * Deliberately separate from DETECTION_TO_LOGS_MAP above. That map is
 * detection -> log for the AUTO-ENABLE loop and so can only express one log per
 * detection; licensing needs the inverse, and it is many-to-many:
 *   - ANPR Logs has no auto-enable entry at all but is plainly ANPR.
 *
 * Log types absent from this map are NOT detection outputs. They are always
 * available (subject to role permission and the admin's own logs preference)
 * and are never hidden by licensing:
 *   attendanceLogs / accessLogs  face recognition & check-in
 *   taggedUsers                  manual tagging over access logs
 *   detectedUsers                review/tag detected face folders — a face
 *                                library view, not a detection's output. It
 *                                still AUTO-ENABLES from Generic Object / ANPR
 *                                via DETECTION_TO_LOGS_MAP, which is a
 *                                different question from being hidden.
 *   trackLogs                    user + vehicle activity, only half of which
 *                                is detection-derived
 *   visibilityLogs               a presence/absence timeline. It is built from
 *                                /incidents/deskAbsenceData, but is treated as
 *                                a general availability view and kept on by
 *                                default rather than following Desk Absence.
 */
const LOG_REQUIRED_DETECTIONS = {
  personCountLogs: ["countPersonsSettings"],
  vehicleCountLogs: ["countVehiclesSettings"],
  deskAbsenceLogs: ["deskAbsenceSettings"],
  guardLogs: ["guardAbsenceSettings"],
  conveyorLogs: ["conveyorDetectionSettings"],
  crusherLogs: ["crusherDetectionSettings"],
  waterSpillLogs: ["waterSpillageDetectionSettings"],
  lineCrossingLogs: ["lineCrossingSettings"],
  vehicleObstructionLogs: ["vehicleObstructionSettings"],
  carLogs: ["carModelDetectionSettings"],
  unauthorizedAccessLogs: ["unauthorizedAccessSettings"],
  anprLogs: ["vehicleDetectionSettings"],
};

/**
 * Detection-visibility restriction, applied to the log pages.
 *
 * Every log type defaults to true, and the auto-enable loop only ever turns one
 * ON — so without this a client sees ANPR Logs, Person Count Logs, Crusher Logs
 * and the rest even with no detections licensed at all. A log page IS a place a
 * detection is viewed, so an unlicensed detection's log is forced off here
 * regardless of the stored preference.
 */
const applyLicenseToLogs = (logs, allowedTypes) => {
  for (const [logType, requiredDetections] of Object.entries(LOG_REQUIRED_DETECTIONS)) {
    if (!requiredDetections.some((settingType) => allowedTypes.has(settingType))) {
      logs[logType] = false;
    }
  }
  return logs;
};

class LogsConfigurationService {
  // Check if any camera has a specific detection enabled
  async isDetectionEnabled(adminId, detectionField) {
    const channel = await channelsModel.findOne(
      { userId: adminId.toString() },
      { [`detections.${detectionField}.enabled`]: 1 }
    );
    return channel?.detections?.[detectionField]?.enabled === true;
  }

  // Recalculate and broadcast updated logs config when detections/checkType change
  async refreshAndBroadcastLogsConfig(adminId) {
    try {
      const adminIdStr = adminId.toString();
      let config = await logsConfigModel.findOne({ adminId });
      if (!config) {
        config = await logsConfigModel.create({ adminId });
      }

      // Start with stored config
      const logs = { ...config.logs };

      // Check if admin has any cameras with checkin/checkout
      const hasCheckInCheckOut = await channelsModel.exists({
        userId: adminIdStr,
        checkType: { $in: ["checkin", "checkout"] },
      });

      if (hasCheckInCheckOut) {
        logs.attendanceLogs = true;
        logs.accessLogs = true;
      }

      // Auto-enable logs based on enabled detections
      for (const [detectionField, logType] of Object.entries(DETECTION_TO_LOGS_MAP)) {
        const isEnabled = await this.isDetectionEnabled(adminId, detectionField);
        if (isEnabled) {
          logs[logType] = true;
        }
      }

      // Licensing wins over both the stored preference and the auto-enable above.
      applyLicenseToLogs(logs, await getAllowedDetectionTypes({ adminId }));

      // Broadcast to frontend via socket
      await sendPayloadToUser(adminIdStr, `logsConfiguration_${adminId}`, {
        logs,
        timestamp: new Date().toISOString(),
      }).catch((err) => logger.error("Socket emit error:", err));

      logger.info(`Logs configuration refreshed and broadcast for admin ${adminId}`);
    } catch (error) {
      logger.error(`Error refreshing logs configuration for admin ${adminId}:`, error);
    }
  }
  async getLogsConfiguration(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      if (!data?.adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId"));
      }

      // Verify admin exists
      const admin = await adminModel.findById(data.adminId);
      if (!admin) {
        return res.status(404).json(Response.userFailResp("Admin not found"));
      }

      // Get or create default config
      let config = await logsConfigModel.findOne({ adminId: data.adminId });
      if (!config) {
        config = await logsConfigModel.create({ adminId: data.adminId });
      }

      // Check if admin has any cameras with checkin/checkout checkType
      const hasCheckInCheckOut = await channelsModel.exists({
        userId: data.adminId.toString(),
        checkType: { $in: ["checkin", "checkout"] },
      });

      // Auto-enable attendance/access logs if cameras have checkin/checkout
      const logs = { ...config.logs };
      if (hasCheckInCheckOut) {
        logs.attendanceLogs = true;
        logs.accessLogs = true;
      }

      // Auto-enable logs based on enabled detections for each camera
      for (const [detectionField, logType] of Object.entries(DETECTION_TO_LOGS_MAP)) {
        const isEnabled = await this.isDetectionEnabled(data.adminId, detectionField);
        if (isEnabled) {
          logs[logType] = true;
        }
      }

      // Licensing wins over both the stored preference and the auto-enable above.
      applyLicenseToLogs(
        logs,
        await getAllowedDetectionTypes({ adminId: data.adminId, userId: data.user_id }),
      );

      return res.status(200).json(
        Response.userSuccessResp("Logs configuration fetched", logs)
      );
    } catch (error) {
      logger.error("Error fetching logs configuration:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }

  async updateLogsConfiguration(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      if (!data?.adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId"));
      }

      const { logs } = req.body;
      if (!logs || typeof logs !== "object") {
        return res
          .status(400)
          .json(Response.userFailResp("Invalid logs object in request body"));
      }

      // Verify admin exists
      const admin = await adminModel.findById(data.adminId);
      if (!admin) {
        return res.status(404).json(Response.userFailResp("Admin not found"));
      }

      // Get or create config
      let config = await logsConfigModel.findOne({ adminId: data.adminId });
      if (!config) {
        config = new logsConfigModel({ adminId: data.adminId });
      }

      // Update only provided fields, preserve defaults for missing ones
      config.logs = { ...config.logs, ...logs };
      await config.save();

      // Emit socket event for real-time update
      await sendPayloadToUser(
        data.adminId.toString(),
        `logsConfiguration_${data.adminId}`,
        {
          logs: config.logs,
          timestamp: new Date().toISOString(),
        }
      ).catch((err) => logger.error("Socket emit error:", err));

      return res.status(200).json(
        Response.userSuccessResp("Logs configuration updated", config.logs)
      );
    } catch (error) {
      logger.error("Error updating logs configuration:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }
}

const logsConfigService = new LogsConfigurationService();

export default logsConfigService;
export const refreshLogsConfiguration = (adminId) =>
  logsConfigService.refreshAndBroadcastLogsConfig(adminId);
