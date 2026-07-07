import config from "config";
import logger from "./logger.js";
import adminModel from "../core/v1/admin/admin.model.js";

// Global config defaults for the per-admin overridable service endpoints.
const defaults = {
  dsAuthUsersAPI: config.get("DSAuthUsersAPI"),
  attendanceUrl: config.get("PythonService.attendanceUrl"),
  detectionUrl: config.get("PythonService.detectionUrl"),
};

const isObjectId = (v) => /^[a-f\d]{24}$/i.test(String(v));

// Resolve a given admin's service endpoints. Each field falls back to the
// global config value when the admin has no override (null/empty). Accepts the
// admin's Mongo _id (24-hex, e.g. NVR/Channel/authUser.adminId) OR the admin's
// user_id (e.g. NVR/Channel.userId, token user_id). With no id, returns the
// global defaults. Single lookup returns all three fields.
export const resolveAdminEndpoints = async (adminIdOrUserId) => {
  if (!adminIdOrUserId) return { ...defaults };
  try {
    const query = isObjectId(adminIdOrUserId)
      ? { _id: adminIdOrUserId }
      : { user_id: String(adminIdOrUserId) };
    const admin = await adminModel
      .findOne(query)
      .select("dsAuthUsersAPI attendanceUrl detectionUrl")
      .lean();
    return {
      dsAuthUsersAPI: admin?.dsAuthUsersAPI || defaults.dsAuthUsersAPI,
      attendanceUrl: admin?.attendanceUrl || defaults.attendanceUrl,
      detectionUrl: admin?.detectionUrl || defaults.detectionUrl,
    };
  } catch (err) {
    logger.error(`Failed to resolve admin endpoints for ${adminIdOrUserId}`, err.message);
    return { ...defaults };
  }
};
