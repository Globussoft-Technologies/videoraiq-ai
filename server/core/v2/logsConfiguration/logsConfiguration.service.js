import logsConfigModel from "./logsConfiguration.model.js";
import adminModel from "../admin/admin.model.js";
import channelsModel from "../channels/channels.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { sendPayloadToUser } from "../../../socket.js";

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
