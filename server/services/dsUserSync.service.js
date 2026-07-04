import config from "config";
import axios from "axios";
import logger from "../utils/logger.js";

const dsUserSyncAPI = config.get("DSAuthUsersAPI");

class DSUserSyncService {
  getDbName(adminId) {
    return `${adminId.toString()}_faces`;
  }

  /**
   * Notify the Data Science team's onfly_registration API whenever an
   * Authorized User is registered or tagged against a dsId. Non-blocking:
   * never throws, so a DS outage cannot fail the caller's flow.
   */
  async syncUser(authorizedUser, dsId) {
    try {
      if (!authorizedUser) return;

      const payload = {
        uid: authorizedUser._id?.toString(),
        firstName: authorizedUser.firstName || "",
        lastName: authorizedUser.lastName || "",
        email: authorizedUser.email || "",
        department: authorizedUser.departmentId?.departmentName || "",
        branch: authorizedUser.branch || "",
        designation: authorizedUser.designation || "",
        dsId,
        admin_id: authorizedUser.adminId?.toString(),
        db: this.getDbName(authorizedUser.adminId),
      };

      const response = await axios.post(
        `${dsUserSyncAPI}/onfly_registration`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
      logger.info("DS onfly_registration sync succeeded:", response.data);
    } catch (error) {
      logger.error("DS onfly_registration sync failed:", error?.response?.data || error.message);
    }
  }

  /**
   * Notify the Data Science team's delete_onfly API when face images are
   * deleted for a dsId. Non-blocking: never throws, so a DS outage cannot
   * fail the caller's delete flow.
   */
  async syncDeletedImages(adminId, dsId, images) {
    try {
      if (!dsId || !images?.length) return;

      const payload = {
        admin_id: adminId ? adminId.toString() : null,
        dsId,
        images,
      };

      const response = await axios.post(
        `${dsUserSyncAPI}/delete_onfly`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
      logger.info("DS delete_onfly sync succeeded:", response.data);
    } catch (error) {
      logger.error("DS delete_onfly sync failed:", error?.response?.data || error.message);
    }
  }
}

export default new DSUserSyncService();
