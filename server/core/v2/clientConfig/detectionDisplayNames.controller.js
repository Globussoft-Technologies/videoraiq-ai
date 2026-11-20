import mongoose from "mongoose";
import Admin from "../../v1/admin/admin.model.js";
import { DETECTION_LOG_METADATA } from "../../../constants/detectionTypes.js";
import logger from "../../../utils/logger.js";
import { settingTypeByIncidentType, settingTypeByLogPermission } from "../../../utils/detectionDisplayNames.js";

const settingTypeByLogKey = {
  ...Object.fromEntries(Object.entries(DETECTION_LOG_METADATA).map(([key, log]) => [log.logsConfigKey, key])),
  attendanceLogs: "faceAuthenticationSettings",
};

function adminIdFor(req) {
  const verified = req.verified;
  const user = verified?.userData;
  if (!mongoose.isValidObjectId(user?.adminId) || verified.apiKey || user.system ||
      user.registrationLinkId) return null;
  return user.adminId;
}

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

export async function getDetectionDisplayNames(req, res) {
  const adminId = adminIdFor(req);
  if (!adminId) return sendError(res, 403, "Account access is required");

  try {
    const admin = await Admin.findById(adminId).select("detectionDisplayNames").lean();
    if (!admin) return sendError(res, 404, "Account not found");
    return res.set("Cache-Control", "no-store").json({
      names: admin.detectionDisplayNames || {},
      settingTypeByLogKey,
      settingTypeByIncidentType,
      settingTypeByLogPermission,
    });
  } catch (error) {
    logger.error("[DETECTION_DISPLAY_NAMES] Read failed", error);
    return sendError(res, 500, "Could not load detection display names");
  }
}
